import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { statsApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import Button from '../../components/ui/Button';
import { Alert, Badge, Card, EmptyState, PageHeader, StatCard } from '../../components/ui/primitives';
import BarList from '../../components/charts/BarList';
import TrendArea from '../../components/charts/TrendArea';
import ViewToggle from '../../components/charts/ViewToggle';
import RevenueCard from './RevenueCard';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatMonthLong,
  formatMonthShort,
  formatNumber,
  formatPrice,
  STATUS_LABELS,
} from '../../lib/format';

const MAX_BARS = 8; // más colegios se agrupan en "Otros"

/** Filas del gráfico de barras: top 8 + "Otros N colegios" (nunca más categorías). */
function buildBarRows(byTenant, currency) {
  const head = byTenant.slice(0, MAX_BARS);
  const tail = byTenant.slice(MAX_BARS);
  const rows = head.map((t) => ({
    key: t.id,
    label: t.billable ? t.name : `${t.name} (prueba)`,
    value: t.students,
    valueLabel: `${formatNumber(t.students)} · ${formatMoney(t.billable ? t.monthly : 0, currency)}`,
    muted: !t.billable,
    tooltip: [
      ['alumnos registrados', formatNumber(t.students)],
      ['por alumno', formatPrice(t.pricePerStudent, currency)],
      [t.billable ? 'ingreso mensual estimado' : 'no facturable (plan de prueba)', formatMoney(t.billable ? t.monthly : 0, currency)],
    ],
  }));
  if (tail.length) {
    const students = tail.reduce((acc, t) => acc + t.students, 0);
    const monthly = Math.round(tail.reduce((acc, t) => acc + (t.billable ? t.monthly : 0), 0) * 100) / 100;
    rows.push({
      key: 'others',
      label: `Otros ${tail.length} colegios`,
      value: students,
      valueLabel: `${formatNumber(students)} · ${formatMoney(monthly, currency)}`,
      muted: true,
      tooltip: [
        ['alumnos registrados', formatNumber(students)],
        ['ingreso mensual estimado', formatMoney(monthly, currency)],
      ],
    });
  }
  return rows;
}

function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [trendView, setTrendView] = useState('chart');
  const [barsView, setBarsView] = useState('chart');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await statsApi.overview());
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron cargar las estadísticas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const t = data?.tenants;
  const totals = data?.totals;
  const revenue = data?.revenue;
  const currency = revenue?.currency || 'USD';

  const trendPoints = useMemo(
    () =>
      (revenue?.trend || []).map((p) => ({
        key: p.month,
        label: formatMonthShort(p.month),
        longLabel: formatMonthLong(p.month),
        value: p.revenue,
        detail: `${formatNumber(p.students)} alumnos registrados`,
      })),
    [revenue]
  );

  const barRows = useMemo(() => (revenue ? buildBarRows(revenue.byTenant, currency) : []), [revenue, currency]);

  return (
    <>
      <PageHeader
        title="Panel global"
        subtitle="Indicadores y monetización estimada de toda la red de colegios."
        actions={
          <Button variant="secondary" icon="refresh" onClick={load} loading={loading} loadingText="Actualizando…">
            Actualizar
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Mientras recarga, se conserva lo anterior atenuado: sin saltos de layout */}
      <div className={`dashboard ${loading && data ? 'dashboard--refreshing' : ''}`}>
        <div className="stat-grid">
          <StatCard
            label="Colegios activos"
            icon="building"
            loading={!data}
            value={formatNumber(t?.active)}
            footer={t && `${formatNumber(t.onTrialPlan)} en prueba · ${formatNumber(t.suspended)} inactivos`}
          />
          <StatCard
            label="Alumnos registrados"
            icon="graduation"
            tone="info"
            loading={!data}
            value={formatNumber(totals?.studentsActive)}
            footer={totals && `${formatNumber(totals.studentsEnrolled)} matriculados en el año activo`}
          />
          <StatCard
            label="Representantes"
            icon="users"
            tone="success"
            loading={!data}
            value={formatNumber(totals?.guardians)}
            footer="Familias registradas en la red"
          />
          <StatCard
            label="Personal gestionado"
            icon="briefcase"
            tone="warning"
            loading={!data}
            value={formatNumber(totals?.staff)}
            footer={totals && `${formatNumber(totals.teachers)} docentes`}
          />
        </div>
        <p className="muted-note">
          Sumas de colegios activos. {data && `Actualizado: ${formatDateTime(data.generatedAt)}`}
        </p>

        {revenue && (
          <>
            <div className="dashboard__revenue">
              <RevenueCard revenue={revenue} />

              <Card
                title="Evolución del ingreso mensual estimado"
                subtitle="Últimos 12 meses · alumnos registrados × la tarifa de cada colegio facturable"
                actions={<ViewToggle value={trendView} onChange={setTrendView} label="evolución del ingreso" />}
              >
                {trendView === 'chart' ? (
                  <TrendArea
                    points={trendPoints}
                    formatValue={(v) => formatMoney(v, currency)}
                    formatTick={(v) => formatMoneyCompact(v, currency)}
                    ariaLabel={`Ingreso mensual estimado de los últimos 12 meses; actual ${formatMoney(revenue.monthlyTotal, currency)}. Usa las flechas para recorrer los meses.`}
                  />
                ) : (
                  <div className="table-wrap chart-table">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Mes</th>
                          <th className="num">Alumnos registrados</th>
                          <th className="num">Ingreso estimado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...revenue.trend].reverse().map((p) => (
                          <tr key={p.month}>
                            <td>{formatMonthLong(p.month)}</td>
                            <td className="num">{formatNumber(p.students)}</td>
                            <td className="num">{formatMoney(p.revenue, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="chart-note">
                  Estimación con los alumnos registrados hoy, según su fecha de alta. No incluye bajas pasadas.
                </p>
              </Card>
            </div>

            <div className="dashboard__split">
              <Card
                title="Alumnos e ingreso por colegio"
                subtitle="Peso de cada colegio en la matrícula y en el ingreso mensual de la plataforma"
                actions={<ViewToggle value={barsView} onChange={setBarsView} label="alumnos por colegio" />}
              >
                {!revenue.byTenant.length ? (
                  <EmptyState title="Sin colegios activos todavía" />
                ) : barsView === 'chart' ? (
                  <BarList rows={barRows} ariaLabel="Alumnos registrados e ingreso mensual estimado por colegio" />
                ) : (
                  <div className="table-wrap chart-table">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Colegio</th>
                          <th className="num">Alumnos</th>
                          <th className="num">Por alumno</th>
                          <th className="num">Ingreso / mes</th>
                          <th className="num">% del total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenue.byTenant.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <Link to={`/${row.slug}`} className="cell-title">{row.name}</Link>
                              {!row.billable && <span className="cell-sub">Plan de prueba · no facturable</span>}
                            </td>
                            <td className="num">{formatNumber(row.students)}</td>
                            <td className="num">{formatPrice(row.pricePerStudent, currency)}</td>
                            <td className="num">{formatMoney(row.billable ? row.monthly : 0, currency)}</td>
                            <td className="num">
                              {revenue.monthlyTotal && row.billable
                                ? `${((row.monthly / revenue.monthlyTotal) * 100).toFixed(1)} %`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card
                title="Altas recientes"
                subtitle={t ? `${formatNumber(t.newLast30Days)} en los últimos 30 días` : undefined}
                actions={<Link to="/tenants" className="link-action">Ver todos</Link>}
                flush
              >
                {data.recentTenants.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Colegio</th>
                        <th>Estado</th>
                        <th>Alta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentTenants.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <Link to={`/${row.slug}`} className="cell-title">{row.name}</Link>
                            <span className="cell-sub">/{row.slug}</span>
                          </td>
                          <td>
                            <Badge variant={STATUS_LABELS[row.status]?.variant}>{STATUS_LABELS[row.status]?.label || row.status}</Badge>
                          </td>
                          <td className="cell-muted">{formatDate(row.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState title="Aún no hay colegios" />
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default DashboardPage;
