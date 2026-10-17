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

/** Map<tenantId, métricas> para los colegios pedidos. */
async function metricsByTenant(tenantIds) {
  const result = new Map();
  if (!tenantIds.length) return result;

  if (await detectRlsBypass()) {
    // pg serializa el arreglo JS como literal de arreglo de Postgres ('{…}').
    const { rows } = await db.raw(`${METRICS_SQL} WHERE t.id = ANY(?::uuid[])`, [tenantIds]);
    rows.forEach((row) => result.set(row.tenant_id, toMetrics(row)));
  } else {
    for (let i = 0; i < tenantIds.length; i += PER_TENANT_CONCURRENCY) {
      const chunk = tenantIds.slice(i, i + PER_TENANT_CONCURRENCY);
      await Promise.all(
        chunk.map((id) =>
          withTenantTransaction(id, async (trx) => {
            const { rows } = await trx.raw(`${METRICS_SQL} WHERE t.id = ?`, [id]);
            if (rows[0]) result.set(id, toMetrics(rows[0]));
          })
        )
      );
    }
  }

  tenantIds.forEach((id) => {
    if (!result.has(id)) result.set(id, { ...EMPTY });
  });
  return result;
}

/** Métricas de un colegio dentro de una transacción ya acotada (req.db del tenantResolver). */
async function metricsForTenant(trx, tenantId) {
  const { rows } = await trx.raw(`${METRICS_SQL} WHERE t.id = ?`, [tenantId]);
  return rows[0] ? toMetrics(rows[0]) : { ...EMPTY };
}

module.exports = { metricsByTenant, metricsForTenant };
