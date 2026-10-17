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
  return db.transaction(async (trx) => {
    await trx.raw("SELECT set_config('app.tenant_id', ?, true)", [tenantId]);
    return work(trx);
  });
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

module.exports = { db, withTenantTransaction, detectRlsBypass, connectionConfig };
