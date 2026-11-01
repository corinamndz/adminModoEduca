const { ApiError } = require('../../utils/ApiError');
const { isValidSchemaName } = require('../../utils/schemaName');

/**
 * Aprovisionamiento de un esquema por colegio
 * ===========================================
 * La PLANTILLA es el esquema `public` tal como está hoy: ya tiene aplicadas
 * todas las migraciones del sistema escolar. Se lee su estructura del catálogo
 * de PostgreSQL y se replica en el esquema nuevo, así nunca hay una lista de
 * tablas a mano que se quede atrás cuando el colegio agrega una migración.
 *
 * Qué se replica, por cada tabla "del colegio":
 *   1. la tabla con columnas, defaults, CHECK, PK/UNIQUE e índices
 *      (CREATE TABLE … (LIKE public.x INCLUDING ALL));
 *   2. sus claves foráneas;
 *   3. sus triggers (las funciones se comparten: viven en public y resuelven
 *      sus tablas por search_path, así que operan sobre el esquema del colegio);
 *   4. Row Level Security y sus políticas (segunda capa, igual que en public);
 *   5. schema_migrations, con las migraciones ya incluidas en la copia.
 *
 * Tablas "del colegio" = las que tienen tenant_id, más las que dependen por FK
 * de ellas (student_guardians, user_roles). El resto es global y se queda en
 * public: tenants, modules, currencies, education_levels, schema_migrations.
 *
 * El truco de los nombres: las definiciones (FKs, triggers) se leen con
 * search_path = public, así PostgreSQL las escribe SIN esquema
 * ("REFERENCES students(id)"). Se ejecutan con search_path = "<esquema>", public:
 * "students" se resuelve en el esquema nuevo y "tenants" (que no se copia) en public.
 *
 * Todo corre en la transacción del alta: si algo falla, no queda ni el esquema.
 */

const TEMPLATE = 'public';
const ALWAYS_GLOBAL = new Set(['tenants', 'schema_migrations']);

const setSearchPath = (trx, schema) =>
  trx.raw("SELECT set_config('search_path', format('%I, public', ?::text), true)", [schema]);

/** { tenantTables, globalTables } a partir del catálogo de la plantilla. */
async function classifyTemplateTables(trx) {
  const { rows: tables } = await trx.raw(
    `SELECT c.relname AS name,
            EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) AS has_tenant_id
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ? AND c.relkind = 'r' AND NOT c.relispartition`,
    [TEMPLATE]
  );
  const { rows: fks } = await trx.raw(
    `SELECT child.relname AS child, parent.relname AS parent
     FROM pg_constraint k
     JOIN pg_class child  ON child.oid  = k.conrelid
     JOIN pg_class parent ON parent.oid = k.confrelid
     JOIN pg_namespace n  ON n.oid = child.relnamespace
     JOIN pg_namespace pn ON pn.oid = parent.relnamespace
     WHERE k.contype = 'f' AND n.nspname = ? AND pn.nspname = ?`,
    [TEMPLATE, TEMPLATE]
  );

  const scoped = new Set(tables.filter((t) => t.has_tenant_id && !ALWAYS_GLOBAL.has(t.name)).map((t) => t.name));
  // Cierre transitivo: si depende de una tabla del colegio, también es del colegio.
  let grew = true;
  while (grew) {
    grew = false;
    for (const { child, parent } of fks) {
      if (scoped.has(parent) && !scoped.has(child) && !ALWAYS_GLOBAL.has(child)) {
        scoped.add(child);
        grew = true;
      }
    }
  }

  const tenantTables = [...scoped].sort();
  const globalTables = tables.map((t) => t.name).filter((n) => !scoped.has(n)).sort();
  return { tenantTables, globalTables };
}

/** Definiciones de la plantilla, escritas sin esquema (ver comentario de arriba). */
async function readTemplateDefinitions(trx, tenantTables) {
  await trx.raw("SELECT set_config('search_path', 'public', true)");

  const { rows: foreignKeys } = await trx.raw(
    `SELECT c.relname AS table, k.conname AS name, pg_get_constraintdef(k.oid) AS def
     FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ? AND k.contype = 'f' AND c.relname = ANY(?)
     ORDER BY c.relname, k.conname`,
    [TEMPLATE, tenantTables]
  );
  const { rows: triggers } = await trx.raw(
    `SELECT c.relname AS table, t.tgname AS name, pg_get_triggerdef(t.oid) AS def
     FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ? AND NOT t.tgisinternal AND c.relname = ANY(?)
     ORDER BY c.relname, t.tgname`,
    [TEMPLATE, tenantTables]
  );
  const { rows: rls } = await trx.raw(
    `SELECT c.relname AS table, c.relforcerowsecurity AS force
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ? AND c.relrowsecurity AND c.relname = ANY(?)`,
    [TEMPLATE, tenantTables]
  );
  const { rows: policies } = await trx.raw(
    `SELECT p.polname AS name, c.relname AS table, p.polpermissive AS permissive,
            CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
                          WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd,
            CASE WHEN p.polroles = '{0}' THEN NULL
                 ELSE ARRAY(SELECT quote_ident(rolname) FROM pg_roles WHERE oid = ANY(p.polroles)) END AS roles,
            pg_get_expr(p.polqual, p.polrelid) AS using_expr,
            pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
     FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ? AND c.relname = ANY(?)`,
    [TEMPLATE, tenantTables]
  );
  const { rows: serials } = await trx.raw(
    `SELECT table_name || '.' || column_name AS col FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ANY(?) AND column_default LIKE 'nextval(%'`,
    [TEMPLATE, tenantTables]
  );

  return { foreignKeys, triggers, rls, policies, serials: serials.map((s) => s.col) };
}

/**
 * Crea el esquema `schema` con la estructura de las tablas del colegio y deja
 * la transacción apuntando a él (search_path = "<schema>", public).
 * Devuelve un resumen de lo creado.
 */
async function createTenantSchema(trx, schema, { schoolDbRole } = {}) {
  if (!isValidSchemaName(schema)) {
    throw ApiError.unprocessable(`"${schema}" no es un nombre de esquema válido.`);
  }

  const { tenantTables, globalTables } = await classifyTemplateTables(trx);
  if (!tenantTables.includes('users') || !tenantTables.includes('roles')) {
    throw ApiError.unprocessable(
      'La plantilla (esquema public) no tiene las tablas del sistema escolar. Corre las migraciones del sistema escolar antes de crear colegios.'
    );
  }
  const defs = await readTemplateDefinitions(trx, tenantTables);
  if (defs.serials.length) {
    // Ninguna tabla del colegio usa SERIAL hoy; si apareciera, compartiría la secuencia de public.
    console.warn(`[schemas] Columnas SERIAL en tablas del colegio (comparten secuencia con public): ${defs.serials.join(', ')}`);
  }

  // 1) Esquema y tablas (sin IF NOT EXISTS: nunca se "adopta" un esquema que ya existía)
  await trx.raw('CREATE SCHEMA ??', [schema]);
  for (const table of tenantTables) {
    await trx.raw('CREATE TABLE ??.?? (LIKE ??.?? INCLUDING ALL)', [schema, table, TEMPLATE, table]);
  }

  // A partir de aquí los nombres sin esquema se resuelven primero en el del colegio.
  await setSearchPath(trx, schema);

  // 2) Claves foráneas (las tablas de destino ya existen, con sus PK/UNIQUE)
  for (const fk of defs.foreignKeys) {
    await trx.raw(`ALTER TABLE ??.?? ADD CONSTRAINT ?? ${fk.def}`, [schema, fk.table, fk.name]);
  }

  // 3) Triggers: "CREATE [CONSTRAINT] TRIGGER … ON public.<tabla> … EXECUTE FUNCTION fn()".
  //    pg_get_triggerdef SIEMPRE califica la tabla (a diferencia de las FKs), así que se
  //    reescribe "ON public.<tabla>" → "ON <esquema>.<tabla>". La función queda sin
  //    esquema y se resuelve en public (compartida).
  for (const trigger of defs.triggers) {
    const target = new RegExp(` ON ${TEMPLATE}\\.("?)${trigger.table}\\1 `);
    if (!target.test(trigger.def)) {
      throw new Error(`No se pudo adaptar el trigger ${trigger.name} al esquema ${schema}: ${trigger.def}`);
    }
    const def = trigger.def.replace(target, ` ON "${schema}"."${trigger.table}" `);
    if (/\bpublic\./.test(def)) {
      // p. ej. un CONSTRAINT TRIGGER con "FROM public.otra_tabla": revisar a mano antes de replicarlo.
      throw new Error(`El trigger ${trigger.name} referencia otra tabla de public; no se replica automáticamente: ${def}`);
    }
    await trx.raw(def);
  }

  // 4) Row Level Security y políticas
  for (const { table, force } of defs.rls) {
    await trx.raw('ALTER TABLE ??.?? ENABLE ROW LEVEL SECURITY', [schema, table]);
    if (force) await trx.raw('ALTER TABLE ??.?? FORCE ROW LEVEL SECURITY', [schema, table]);
  }
  for (const p of defs.policies) {
    const roles = p.roles?.length ? p.roles.join(', ') : 'PUBLIC';
    const using = p.using_expr ? ` USING (${p.using_expr})` : '';
    const check = p.check_expr ? ` WITH CHECK (${p.check_expr})` : '';
    await trx.raw(
      `CREATE POLICY ?? ON ??.?? AS ${p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'} FOR ${p.cmd} TO ${roles}${using}${check}`,
      [p.name, schema, p.table]
    );
  }

  // 5) Versión de la estructura: las migraciones que ya trae la copia
  await trx.raw('CREATE TABLE ??.schema_migrations (LIKE public.schema_migrations INCLUDING ALL)', [schema]);
  await trx.raw('INSERT INTO ??.schema_migrations SELECT * FROM public.schema_migrations', [schema]);

  // Permisos para el rol con el que se conecta el sistema escolar, si es otro.
  if (schoolDbRole) {
    await trx.raw('GRANT USAGE ON SCHEMA ?? TO ??', [schema, schoolDbRole]);
    await trx.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ?? TO ??', [schema, schoolDbRole]);
  }

  // Verificación: todas las tablas quedaron creadas.
  const { rows } = await trx.raw(
    "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ? AND c.relkind = 'r'",
    [schema]
  );
  const expected = tenantTables.length + 1; // + schema_migrations
  if (rows[0].n !== expected) {
    throw new Error(`El esquema ${schema} quedó incompleto: ${rows[0].n} de ${expected} tablas.`);
  }

  return {
    schema,
    tables: tenantTables.length,
    foreignKeys: defs.foreignKeys.length,
    triggers: defs.triggers.length,
    policies: defs.policies.length,
    sharedTables: globalTables,
  };
}

module.exports = { createTenantSchema, classifyTemplateTables, setSearchPath };
