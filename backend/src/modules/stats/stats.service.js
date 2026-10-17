const { db } = require('../../config/database');
const { metricsByTenant } = require('./metrics.service');

/**
 * Panel global: cuántos colegios hay por estado y la suma de alumnos,
 * representantes y personal de los colegios ACTIVOS (los suspendidos no se
 * gestionan en la red mientras lo estén).
 */
async function getOverview() {
  const tenants = await db('tenants').select('id', 'name', 'slug', 'status', 'created_at').orderBy('created_at', 'desc');
  const metrics = await metricsByTenant(tenants.map((t) => t.id));

  const since30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const byStatus = { active: 0, suspended: 0, trial: 0 };
  const totals = { studentsEnrolled: 0, studentsActive: 0, guardians: 0, staff: 0, teachers: 0, users: 0 };
  let newLast30Days = 0;

  for (const t of tenants) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    if (new Date(t.created_at).getTime() >= since30d) newLast30Days += 1;
    if (t.status !== 'active') continue;
    const m = metrics.get(t.id);
    Object.keys(totals).forEach((key) => {
      totals[key] += m[key];
    });
  }

  const withMetrics = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    createdAt: t.created_at,
    metrics: metrics.get(t.id),
  }));

  return {
    tenants: { total: tenants.length, ...byStatus, newLast30Days },
    totals,
    topByStudents: withMetrics
      .filter((t) => t.status === 'active')
      .sort((a, b) => b.metrics.studentsEnrolled - a.metrics.studentsEnrolled)
      .slice(0, 5),
    recentTenants: withMetrics.slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getOverview };
