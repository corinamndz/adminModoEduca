import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { statsApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import Button from '../../components/ui/Button';
import { Alert, Badge, Card, EmptyState, PageHeader, StatCard } from '../../components/ui/primitives';
import { formatDate, formatDateTime, formatNumber, STATUS_LABELS } from '../../lib/format';

function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  return (
    <>
      <PageHeader
        title="Panel global"
        subtitle="Métricas agregadas de todos los colegios de la red."
        actions={
          <Button variant="secondary" icon="refresh" onClick={load} loading={loading} loadingText="Actualizando…">
            Actualizar
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="stat-grid">
        <StatCard
          label="Colegios activos"
          icon="building"
          loading={loading && !data}
          value={formatNumber(t?.active)}
          footer={t && `${formatNumber(t.total)} registrados · ${formatNumber(t.suspended)} inactivos`}
        />
        <StatCard
          label="Alumnos matriculados"
          icon="graduation"
          tone="info"
          loading={loading && !data}
          value={formatNumber(totals?.studentsEnrolled)}
          footer={totals && `${formatNumber(totals.studentsActive)} con ficha activa`}
        />
        <StatCard
          label="Representantes"
          icon="users"
          tone="success"
          loading={loading && !data}
          value={formatNumber(totals?.guardians)}
          footer="Familias registradas"
        />
        <StatCard
          label="Personal gestionado"
          icon="briefcase"
          tone="warning"
          loading={loading && !data}
          value={formatNumber(totals?.staff)}
          footer={totals && `${formatNumber(totals.teachers)} docentes`}
        />
      </div>
      <p className="muted-note">
        Las sumas incluyen solo colegios activos. {data && `Actualizado: ${formatDateTime(data.generatedAt)}.`}
      </p>

      <div className="grid-2">
        <Card title="Colegios con más alumnos" subtitle="Matrícula del año escolar activo" flush>
          {data?.topByStudents?.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Colegio</th>
                  <th className="num">Alumnos</th>
                  <th className="num">Personal</th>
                </tr>
              </thead>
              <tbody>
                {data.topByStudents.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/${row.slug}`} className="cell-title">{row.name}</Link>
                      <span className="cell-sub">/{row.slug}</span>
                    </td>
                    <td className="num">{formatNumber(row.metrics.studentsEnrolled)}</td>
                    <td className="num">{formatNumber(row.metrics.staff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            !loading && <EmptyState title="Sin colegios activos todavía" />
          )}
        </Card>

        <Card
          title="Altas recientes"
          subtitle={t ? `${formatNumber(t.newLast30Days)} en los últimos 30 días` : undefined}
          actions={<Link to="/tenants" className="link-action">Ver todos</Link>}
          flush
        >
          {data?.recentTenants?.length ? (
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
                    <td>{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            !loading && <EmptyState title="Aún no hay colegios" />
          )}
        </Card>
      </div>
    </>
  );
}

export default DashboardPage;
