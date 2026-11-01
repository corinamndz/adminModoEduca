const { db, withTenantTransaction, detectRlsBypass } = require('../../config/database');

/**
 * Métricas por colegio, sobre las tablas del sistema escolar:
 *   studentsEnrolled  alumnos con inscripción activa en un año escolar activo
 *   studentsActive    alumnos con ficha activa (estén o no inscritos)
 *   guardians         representantes registrados
 *   staff / teachers  personal activo / de ellos, docentes
 *   users             cuentas de acceso del colegio
 *   lastLoginAt       último inicio de sesión de cualquier usuario del colegio
 *
 * La misma consulta sirve en los dos modos:
 *   - rol con BYPASSRLS → una sola consulta para todos los colegios;
 *   - rol sin bypass   → una consulta por colegio dentro de su transacción con
 *     `app.tenant_id` (RLS deja ver solo ese colegio, y se filtra por él).
 */
const METRICS_SQL = `
  SELECT t.id AS tenant_id,
         COALESCE(s.students_active, 0)   AS students_active,
         COALESCE(e.students_enrolled, 0) AS students_enrolled,
         COALESCE(g.guardians, 0)         AS guardians,
         COALESCE(st.staff, 0)            AS staff,
         COALESCE(st.teachers, 0)         AS teachers,
         COALESCE(u.users, 0)             AS users,
         u.last_login_at
  FROM tenants t
  LEFT JOIN (
    SELECT tenant_id, count(*) FILTER (WHERE status = 'active') AS students_active
    FROM students GROUP BY tenant_id
  ) s ON s.tenant_id = t.id
  LEFT JOIN (
    SELECT en.tenant_id, count(DISTINCT en.student_id) AS students_enrolled
    FROM enrollments en
    JOIN sections sc       ON sc.id = en.section_id
    JOIN school_periods sp ON sp.id = sc.school_period_id
    WHERE en.status = 'active' AND sp.is_active
    GROUP BY en.tenant_id
  ) e ON e.tenant_id = t.id
  LEFT JOIN (
    SELECT tenant_id, count(*) AS guardians FROM guardians GROUP BY tenant_id
  ) g ON g.tenant_id = t.id
  LEFT JOIN (
    SELECT tenant_id,
           count(*) FILTER (WHERE status = 'active')                              AS staff,
           count(*) FILTER (WHERE status = 'active' AND staff_type = 'teaching') AS teachers
    FROM staff GROUP BY tenant_id
  ) st ON st.tenant_id = t.id
  LEFT JOIN (
    SELECT tenant_id, count(*) AS users, max(last_login_at) AS last_login_at
    FROM users GROUP BY tenant_id
  ) u ON u.tenant_id = t.id
`;

const EMPTY = { studentsEnrolled: 0, studentsActive: 0, guardians: 0, staff: 0, teachers: 0, users: 0, lastLoginAt: null };

const toMetrics = (row) => ({
  studentsEnrolled: row.students_enrolled,
  studentsActive: row.students_active,
  guardians: row.guardians,
  staff: row.staff,
  teachers: row.teachers,
  users: row.users,
  lastLoginAt: row.last_login_at,
});

const PER_TENANT_CONCURRENCY = 4;

/**
 * Corre una consulta para varios colegios, según dónde vivan sus datos:
 *   - colegios en public (sin esquema propio) y rol con bypass de RLS →
 *     UNA consulta para todos (`bulk(ids)`);
 *   - colegios con esquema propio, o rol sin bypass → una por colegio
 *     (`perTenant(trx, id)`), dentro de su transacción (search_path + RLS).
 * Devuelve la concatenación de las filas.
 */
async function queryAcrossTenants(tenantIds, { bulk, perTenant }) {
  if (!tenantIds.length) return [];
  // to_jsonb(t)->>'schema_name': tolera que la migración 003 aún no esté aplicada.
  const { rows: located } = await db.raw(
    "SELECT t.id, to_jsonb(t)->>'schema_name' AS schema_name FROM tenants t WHERE t.id = ANY(?::uuid[])",
    [tenantIds]
  );
  const shared = located.filter((t) => !t.schema_name).map((t) => t.id);
  const ownSchema = located.filter((t) => t.schema_name).map((t) => t.id);

  const out = [];
  let oneByOne = ownSchema;
  if (await detectRlsBypass()) {
    if (shared.length) out.push(...(await bulk(shared)));
  } else {
    oneByOne = [...shared, ...ownSchema];
  }

  for (let i = 0; i < oneByOne.length; i += PER_TENANT_CONCURRENCY) {
    const chunk = oneByOne.slice(i, i + PER_TENANT_CONCURRENCY);
    const results = await Promise.all(chunk.map((id) => withTenantTransaction(id, (trx) => perTenant(trx, id))));
    results.forEach((rows) => out.push(...rows));
  }
  return out;
}

/** Map<tenantId, métricas> para los colegios pedidos. */
async function metricsByTenant(tenantIds) {
  const rows = await queryAcrossTenants(tenantIds, {
    // pg serializa el arreglo JS como literal de arreglo de Postgres ('{…}').
    bulk: async (ids) => (await db.raw(`${METRICS_SQL} WHERE t.id = ANY(?::uuid[])`, [ids])).rows,
    perTenant: async (trx, id) => (await trx.raw(`${METRICS_SQL} WHERE t.id = ?`, [id])).rows,
  });

  const result = new Map(rows.map((row) => [row.tenant_id, toMetrics(row)]));
  tenantIds.forEach((id) => {
    if (!result.has(id)) result.set(id, { ...EMPTY });
  });
  return result;
}

const MONTHLY_SQL = `
  SELECT tenant_id, to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, count(*) AS students
  FROM students
  WHERE status = 'active'
`;

/**
 * Alumnos activos por colegio y mes de registro: [{ tenantId, month: 'YYYY-MM', students }].
 * Mismo reparto que metricsByTenant (ver queryAcrossTenants).
 */
async function activeStudentsByMonth(tenantIds) {
  const rows = await queryAcrossTenants(tenantIds, {
    bulk: async (ids) => (await db.raw(`${MONTHLY_SQL} AND tenant_id = ANY(?::uuid[]) GROUP BY 1, 2`, [ids])).rows,
    perTenant: async (trx, id) => (await trx.raw(`${MONTHLY_SQL} AND tenant_id = ? GROUP BY 1, 2`, [id])).rows,
  });
  return rows.map((r) => ({ tenantId: r.tenant_id, month: r.month, students: r.students }));
}

/** Métricas de un colegio dentro de una transacción ya acotada (req.db del tenantResolver). */
async function metricsForTenant(trx, tenantId) {
  const { rows } = await trx.raw(`${METRICS_SQL} WHERE t.id = ?`, [tenantId]);
  return rows[0] ? toMetrics(rows[0]) : { ...EMPTY };
}

module.exports = { metricsByTenant, metricsForTenant, activeStudentsByMonth };
