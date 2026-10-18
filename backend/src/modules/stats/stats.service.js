const { db } = require('../../config/database');
const { round2, priceOf, CURRENCY } = require('../../utils/money');
const { metricsByTenant, activeStudentsByMonth } = require('./metrics.service');

const TREND_MONTHS = 12;

/** ['2025-11', …, '2026-10']: los últimos `n` meses, terminando en el actual. */
function lastMonths(n, now = new Date()) {
  const months = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

/**
 * Ingreso mensual estimado por mes: para cada colegio facturable, sus alumnos
 * activos HOY acumulados según la fecha de registro × SU tarifa actual.
 * Es una reconstrucción (no guarda bajas ni tarifas históricas), útil para
 * ver la tendencia de crecimiento.
 */
async function buildRevenueTrend(billable) {
  const months = lastMonths(TREND_MONTHS);
  const priceById = new Map(billable.map((t) => [t.id, t.pricePerStudent]));
  const rows = await activeStudentsByMonth(billable.map((t) => t.id));

  // Por mes: alumnos nuevos y su ingreso (cada colegio con su tarifa).
  const added = new Map();
  let baseStudents = 0;
  let baseRevenue = 0;
  rows.forEach((r) => {
    const revenue = r.students * priceById.get(r.tenantId);
    if (r.month < months[0]) {
      baseStudents += r.students;
      baseRevenue += revenue;
    } else {
      const m = added.get(r.month) || { students: 0, revenue: 0 };
      added.set(r.month, { students: m.students + r.students, revenue: m.revenue + revenue });
    }
  });

  let students = baseStudents;
  let revenue = baseRevenue;
  return months.map((month) => {
    const m = added.get(month);
    if (m) {
      students += m.students;
      revenue += m.revenue;
    }
    return { month, students, revenue: round2(revenue) };
  });
}

/**
 * Panel global: colegios por estado, totales de alumnos/representantes/personal
 * de los colegios ACTIVOS, monetización estimada y rankings.
 *
 * Monetización: cada colegio paga SU tarifa (platform.tenant_accounts.price_per_student)
 * por alumno registrado (ficha activa) y mes. Facturables = colegios activos con
 * plan distinto de "Prueba"; los de prueba se informan aparte como potencial.
 */
async function getOverview() {
  const tenants = await db('tenants as t')
    .leftJoin('platform.tenant_accounts as a', 'a.tenant_id', 't.id')
    .select('t.id', 't.name', 't.slug', 't.status', 't.created_at', 'a.plan', 'a.price_per_student')
    .orderBy('t.created_at', 'desc');
  const metrics = await metricsByTenant(tenants.map((t) => t.id));

  const since30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const byStatus = { active: 0, suspended: 0, trial: 0 };
  const totals = { studentsEnrolled: 0, studentsActive: 0, guardians: 0, staff: 0, teachers: 0, users: 0 };
  let newLast30Days = 0;
  let onTrialPlan = 0;

  for (const t of tenants) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    if (new Date(t.created_at).getTime() >= since30d) newLast30Days += 1;
    if (t.status !== 'active') continue;
    if (t.plan === 'trial') onTrialPlan += 1;
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
    plan: t.plan || 'standard',
    pricePerStudent: priceOf(t.price_per_student),
    createdAt: t.created_at,
    metrics: metrics.get(t.id),
  }));

  const active = withMetrics.filter((t) => t.status === 'active');
  const revenueByTenant = active
    .map((t) => {
      const students = t.metrics.studentsActive;
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        billable: t.plan !== 'trial',
        students,
        pricePerStudent: t.pricePerStudent,
        monthly: round2(students * t.pricePerStudent),
      };
    })
    // Orden por alumnos: es lo que mide el largo de la barra en el gráfico.
    .sort((a, b) => b.students - a.students || b.monthly - a.monthly || a.name.localeCompare(b.name, 'es'));

  const billable = revenueByTenant.filter((r) => r.billable);
  const sum = (list, key) => round2(list.reduce((acc, r) => acc + r[key], 0));
  const billableStudents = billable.reduce((acc, r) => acc + r.students, 0);
  const monthlyTotal = sum(billable, 'monthly');

  return {
    tenants: { total: tenants.length, ...byStatus, onTrialPlan, newLast30Days },
    totals,
    revenue: {
      currency: CURRENCY,
      billableTenants: billable.length,
      billableStudents,
      monthlyTotal,
      // Tarifa promedio ponderada por alumno (cada colegio tiene la suya).
      averagePricePerStudent: billableStudents ? round2(monthlyTotal / billableStudents) : null,
      trialPotential: sum(revenueByTenant.filter((r) => !r.billable), 'monthly'),
      byTenant: revenueByTenant,
      trend: await buildRevenueTrend(billable),
    },
    topByStudents: [...active].sort((a, b) => b.metrics.studentsEnrolled - a.metrics.studentsEnrolled).slice(0, 5),
    recentTenants: withMetrics.slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getOverview };
