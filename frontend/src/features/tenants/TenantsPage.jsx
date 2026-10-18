import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { tenantsApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { Alert, Badge, Card, EmptyState, PageHeader } from '../../components/ui/primitives';
import Spinner from '../../components/ui/Spinner';
import { formatDate, formatMoney, formatNumber, formatPrice, PLAN_LABELS, STATUS_LABELS, timeAgo } from '../../lib/format';
import CreateTenantModal from './CreateTenantModal';
import CredentialsResult from './CredentialsResult';

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'suspended', label: 'Inactivos' },
];

function TenantsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTenants(await tenantsApi.list());
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cargar la lista de colegios.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Filtro en el cliente: la lista completa ya está cargada (con métricas).
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tenants.filter(
      (t) =>
        (!status || t.status === status) &&
        (!term || [t.name, t.slug, t.admin?.email].some((v) => String(v || '').toLowerCase().includes(term)))
    );
  }, [tenants, search, status]);

  const onCreated = (result) => {
    setCreateOpen(false);
    setCreated(result);
    load();
  };

  return (
    <>
      <PageHeader
        title="Colegios"
        subtitle="Todos los colegios (tenants) registrados en la plataforma."
        actions={
          <Button icon="plus" onClick={() => setCreateOpen(true)}>
            Nuevo colegio
          </Button>
        }
      />

      {created && <CredentialsResult result={created} onClose={() => setCreated(null)} />}
      {error && <Alert variant="danger">{error}</Alert>}

      <Card flush>
        <div className="table-toolbar">
          <div className="input-group">
            <Icon name="search" className="input-group__icon" size={16} />
            <input
              className="input"
              type="search"
              placeholder="Buscar por nombre, URL o correo del admin…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar colegios"
            />
          </div>
          <div className="segmented" role="group" aria-label="Filtrar por estado">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`segmented__item ${status === f.value ? 'segmented__item--active' : ''}`}
                onClick={() => setStatus(f.value)}
                aria-pressed={status === f.value}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="table-toolbar__count">
            {formatNumber(visible.length)} de {formatNumber(tenants.length)}
          </span>
        </div>

        {loading && !tenants.length ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState title={tenants.length ? 'Ningún colegio coincide con la búsqueda' : 'Aún no hay colegios'}>
            {!tenants.length && 'Crea el primero con «Nuevo colegio».'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table table--hover">
              <thead>
                <tr>
                  <th>Colegio</th>
                  <th>URL</th>
                  <th>Estado</th>
                  <th className="num">Alumnos</th>
                  <th className="num">Represent.</th>
                  <th className="num">Personal</th>
                  <th className="num">Ingreso / mes</th>
                  <th>Última actividad</th>
                  <th>Alta</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id} onClick={() => navigate(`/${t.slug}`)} className="row-link">
                    <td>
                      <span className="cell-title">{t.name}</span>
                      <span className="cell-sub">
                        {t.admin?.email || 'Sin admin registrado'} · {PLAN_LABELS[t.plan] || t.plan}
                      </span>
                    </td>
                    <td>
                      <code className="slug">/{t.slug}</code>
                    </td>
                    <td>
                      <Badge variant={STATUS_LABELS[t.status]?.variant}>{STATUS_LABELS[t.status]?.label || t.status}</Badge>
                    </td>
                    <td className="num">{formatNumber(t.metrics.studentsEnrolled)}</td>
                    <td className="num">{formatNumber(t.metrics.guardians)}</td>
                    <td className="num">{formatNumber(t.metrics.staff)}</td>
                    <td className="num">
                      <span className="cell-title">{formatMoney(t.monthlyEstimate)}</span>
                      <span className="cell-sub">{formatPrice(t.pricePerStudent)} / alumno</span>
                    </td>
                    <td className="cell-muted">{timeAgo(t.metrics.lastLoginAt)}</td>
                    <td className="cell-muted">{formatDate(t.createdAt)}</td>
                    <td className="cell-actions">
                      <a
                        href={t.loginUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn--ghost btn--sm"
                        onClick={(e) => e.stopPropagation()}
                        title={`Abrir el login de ${t.name}`}
                        aria-label={`Abrir el login de ${t.name}`}
                      >
                        <Icon name="link" size={15} />
                      </a>
                      <Link
                        to={`/${t.slug}`}
                        className="btn btn--ghost btn--sm"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Ver ${t.name}`}
                      >
                        <Icon name="arrowRight" size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateTenantModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={onCreated} />
    </>
  );
}

export default TenantsPage;
