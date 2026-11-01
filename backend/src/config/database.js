const knex = require('knex');
const { types } = require('pg');

// Columnas DATE como texto 'YYYY-MM-DD' (igual que el sistema escolar).
types.setTypeParser(1082, (value) => value);
// COUNT(*) llega como BIGINT (texto): las métricas caben de sobra en un Number.
types.setTypeParser(20, (value) => Number(value));

function connectionConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'school_saas',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

const db = knex({
  client: 'pg',
  connection: connectionConfig(),
  pool: {
    min: Number(process.env.DB_POOL_MIN) || 1,
    max: Number(process.env.DB_POOL_MAX) || 10,
  },
});

/**
 * Abre una transacción con `app.tenant_id` fijado: es la misma llave que usan
 * las políticas RLS del sistema escolar (migrations/001_init.sql). Todo lo que
 * el superadmin escriba DENTRO de un colegio pasa por aquí, aunque el rol de
 * base de datos salte RLS: así la operación queda acotada a ese colegio
 * también si mañana se le quita BYPASSRLS al rol.
 */
async function withTenantTransaction(tenantId, work) {
  const schemaName = await tenantSchemaOf(tenantId);
  return db.transaction(async (trx) => {
    await scopeToTenant(trx, { id: tenantId, schemaName });
    return work(trx);
  });
}

/**
 * Acota una transacción a un colegio:
 *   - app.tenant_id → políticas RLS (igual que siempre);
 *   - search_path   → si el colegio tiene esquema propio, sus tablas se
 *     resuelven ahí; las globales (tenants, modules…) siguen en public.
 * SET LOCAL (set_config(..., true)): se deshace solo al terminar la transacción.
 */
async function scopeToTenant(trx, { id, schemaName }) {
  await trx.raw("SELECT set_config('app.tenant_id', ?, true)", [id]);
  if (schemaName) {
    await trx.raw("SELECT set_config('search_path', format('%I, public', ?::text), true)", [schemaName]);
  }
}

// El esquema de un colegio se asigna al crearlo y no cambia: caché sin vencimiento
// para los que lo tienen; los "sin esquema" se reconsultan (podrían migrarse).
const schemaCache = new Map();
async function tenantSchemaOf(tenantId) {
  if (schemaCache.has(tenantId)) return schemaCache.get(tenantId);
  // to_jsonb(t)->>'schema_name': funciona aunque la columna aún no exista (migración 003 pendiente).
  const row = await db('tenants as t').where('t.id', tenantId).first(db.raw("to_jsonb(t)->>'schema_name' AS schema_name"));
  const schemaName = row?.schema_name || null;
  if (schemaName) schemaCache.set(tenantId, schemaName);
  return schemaName;
}

let rlsBypass = null;

/**
 * ¿Puede el rol actual leer filas de TODOS los colegios en una sola consulta?
 * Sí si es superusuario, tiene BYPASSRLS, o es dueño de las tablas sin
 * FORCE ROW LEVEL SECURITY (el caso típico en desarrollo con `postgres`).
 */
async function detectRlsBypass() {
  if (rlsBypass !== null) return rlsBypass;
  const { rows } = await db.raw(`
    SELECT (r.rolsuper OR r.rolbypassrls)
        OR (c.relowner = r.oid AND NOT c.relforcerowsecurity) AS bypass
    FROM pg_roles r
    CROSS JOIN pg_class c
    WHERE r.rolname = current_user
      AND c.oid = 'public.students'::regclass
  `);
  rlsBypass = Boolean(rows[0]?.bypass);
  return rlsBypass;
}

module.exports = { db, withTenantTransaction, scopeToTenant, tenantSchemaOf, detectRlsBypass, connectionConfig };
