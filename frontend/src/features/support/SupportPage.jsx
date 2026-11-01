import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supportApi, tenantsApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { Alert, Badge, Card, EmptyState, Field, PageHeader, StatCard } from '../../components/ui/primitives';
import { formatDateTime, formatNumber, timeAgo } from '../../lib/format';

const STATUS_VARIANT = { open: 'warning', in_progress: 'info', resolved: 'success', closed: 'neutral' };
const PRIORITY_VARIANT = { low: 'neutral', normal: 'neutral', high: 'warning', urgent: 'danger' };
const FILTERS = [
  { value: 'active', label: 'Pendientes' },
  { value: 'open', label: 'Abiertos' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'resolved', label: 'Resueltos' },
  { value: 'closed', label: 'Cerrados' },
  { value: '', label: 'Todos' },
];

/**
 * Soporte técnico: bandeja consolidada de los tickets que envían los
 * Administradores de todos los colegios. Filtros por estado, colegio,
 * categoría, prioridad y texto; cada ticket se abre para responder y cambiar
 * su estado (el colegio recibe el aviso en su campana).
 */
function SupportPage() {
  const [data, setData] = useState({ items: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('active');
  const [tenantId, setTenantId] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [tenants, setTenants] = useState([]);
  const [options, setOptions] = useState(null);
  const [openId, setOpenId] = useState(null);

  // Búsqueda en el servidor, con una pequeña espera al escribir.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await supportApi.list({ status, tenantId, category, priority, q: query }));
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron cargar los tickets.'));
    } finally {
      setLoading(false);
    }
  }, [status, tenantId, category, priority, query]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    tenantsApi.list().then(setTenants).catch(() => setTenants([]));
    supportApi.options().then(setOptions).catch(() => setOptions(null));
  }, []);

  const s = data.summary || {};
  const anyFilter = Boolean(tenantId || category || priority || query) || status !== 'active';
  const tenantOptions = useMemo(() => [...tenants].sort((a, b) => a.name.localeCompare(b.name, 'es')), [tenants]);

  return (
    <>
      <PageHeader title="Soporte técnico" subtitle="Tickets enviados por los administradores de cada colegio." />

      <div className="stat-grid support-stats">
        <StatCard label="Por responder" value={formatNumber(s.awaiting || 0)} icon="mail" tone="danger" footer="Pendientes con el último mensaje del colegio" />
        <StatCard label="Abiertos" value={formatNumber(s.open || 0)} icon="alertCircle" tone="warning" />
        <StatCard label="En progreso" value={formatNumber(s.in_progress || 0)} icon="refresh" tone="info" />
        <StatCard label="Resueltos" value={formatNumber(s.resolved || 0)} icon="checkCircle" tone="success" />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card flush>
        <div className="table-toolbar support-toolbar">
          <div className="input-group">
            <Icon name="search" className="input-group__icon" size={16} />
            <input className="input" type="search" placeholder="Buscar por N°, asunto, colegio o quien reporta…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar tickets" />
          </div>
          <select className="input support-select" value={tenantId} onChange={(e) => setTenantId(e.target.value)} aria-label="Colegio">
            <option value="">Todos los colegios</option>
            {tenantOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select className="input support-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {(options?.categories || []).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select className="input support-select" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Prioridad">
            <option value="">Toda prioridad</option>
            {(options?.priorities || []).map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="table-toolbar">
          <div className="segmented" role="group" aria-label="Filtrar por estado">
            {FILTERS.map((f) => (
              <button key={f.value} type="button" className={`segmented__item ${status === f.value ? 'segmented__item--active' : ''}`} onClick={() => setStatus(f.value)} aria-pressed={status === f.value}>
                {f.label}
              </button>
            ))}
          </div>
          <span className="table-toolbar__count">{formatNumber(data.items.length)} ticket{data.items.length === 1 ? '' : 's'}</span>
        </div>

        {loading && !data.items.length ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState icon="checkCircle" title={anyFilter ? 'Ningún ticket con estos filtros' : 'Sin tickets pendientes'}>
            {!anyFilter && 'Cuando un colegio reporte un problema, aparecerá aquí.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table table--hover">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Asunto</th>
                  <th>Colegio</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>Última actividad</th>
                  <th aria-label="Abrir" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <tr key={t.id} onClick={() => setOpenId(t.id)} className={`row-link ${t.awaiting_platform ? 'support-row--awaiting' : ''}`}>
                    <td>
                      <code className="slug">{t.code}</code>
                    </td>
                    <td>
                      <span className="cell-title">
                        {t.subject}
                        {t.has_attachment && <Icon name="paperclip" size={12} className="support-clip" />}
                      </span>
                      <span className="cell-sub">
                        {t.category_label} · {t.reporter_name}
                      </span>
                    </td>
                    <td>
                      <span className="cell-title">{t.tenant.name}</span>
                      <span className="cell-sub">/{t.tenant.slug}</span>
                    </td>
                    <td>
                      <Badge variant={PRIORITY_VARIANT[t.priority]}>{t.priority_label}</Badge>
                    </td>
                    <td>
                      <Badge variant={STATUS_VARIANT[t.status]}>{t.status_label}</Badge>
                      {t.awaiting_platform && <span className="cell-sub support-awaiting">Por responder</span>}
                    </td>
                    <td className="cell-muted">{timeAgo(t.last_activity_at)}</td>
                    <td className="cell-actions">
                      <Icon name="arrowRight" size={15} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openId && <TicketModal id={openId} options={options} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}

/** Un ticket: datos, adjunto, conversación y respuesta con cambio de estado y prioridad. */
function TicketModal({ id, options, onClose, onChanged }) {
  const toast = useToast();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    supportApi
      .get(id)
      .then((ticket) => {
        setT(ticket);
        setStatus(ticket.status);
        setPriority(ticket.priority);
      })
      .catch((err) => setError(errorMessage(err, 'No se pudo abrir el ticket.')));
  }, [id]);

  useEffect(() => {
    if (!t?.has_attachment) return undefined;
    let url = null;
    supportApi
      .attachmentBlob(id)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setPreview({ url, isPdf: t.attachment_mime === 'application/pdf' });
      })
      .catch(() => setPreview(null));
    return () => url && URL.revokeObjectURL(url);
  }, [id, t?.has_attachment, t?.attachment_mime]);

  const dirty = body.trim().length >= 2 || (t && (status !== t.status || priority !== t.priority));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await supportApi.update(id, {
        body: body.trim() || undefined,
        status: status !== t.status ? status : undefined,
        priority: priority !== t.priority ? priority : undefined,
      });
      setT(updated);
      setStatus(updated.status);
      setPriority(updated.priority);
      setBody('');
      onChanged?.();
      toast.success('Ticket actualizado', `${updated.code} · ${updated.status_label}. El colegio recibió el aviso en su campana.`);
    } catch (err) {
      toast.error('No se pudo guardar', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={t ? `${t.code} · ${t.subject}` : 'Ticket'}
      subtitle={t ? `${t.tenant.name} · ${t.category_label}` : undefined}
      onClose={onClose}
      busy={saving}
      footer={
        t && (
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cerrar
            </Button>
            <Button icon="mail" onClick={save} loading={saving} disabled={!dirty}>
              {body.trim() ? 'Enviar respuesta' : 'Guardar cambios'}
            </Button>
          </>
        )
      }
    >
      {error && <Alert variant="danger">{error}</Alert>}
      {!t ? (
        !error && <Spinner />
      ) : (
        <div className="ticket">
          <div className="ticket__meta">
            <Badge variant={STATUS_VARIANT[t.status]}>{t.status_label}</Badge>
            <Badge variant={PRIORITY_VARIANT[t.priority]}>Prioridad {t.priority_label.toLowerCase()}</Badge>
            <Link to={`/${t.tenant.slug}`} className="ticket__tenant">
              <Icon name="building" size={13} /> {t.tenant.name}
            </Link>
            {t.assigned_to_name && <span className="cell-muted">· Atiende: {t.assigned_to_name}</span>}
          </div>
          <dl className="ticket__facts">
            <div>
              <dt>Reportado por</dt>
              <dd>
                {t.reporter_name}
                {t.reporter_email && <span className="cell-muted"> · {t.reporter_email}</span>}
              </dd>
            </div>
            <div>
              <dt>Enviado</dt>
              <dd>{formatDateTime(t.created_at)}</dd>
            </div>
            {t.page_url && (
              <div>
                <dt>Pantalla</dt>
                <dd>{t.page_url}</dd>
              </div>
            )}
            {t.user_agent && (
              <div>
                <dt>Navegador</dt>
                <dd className="ticket__ua" title={t.user_agent}>
                  {t.user_agent}
                </dd>
              </div>
            )}
          </dl>

          <div className="ticket__thread">
            <article className="ticket-msg ticket-msg--school">
              <header>
                <strong>{t.reporter_name}</strong> <span>{formatDateTime(t.created_at)}</span>
              </header>
              <p>{t.description}</p>
              {preview &&
                (preview.isPdf ? (
                  <a href={preview.url} target="_blank" rel="noreferrer" className="ticket__file">
                    <Icon name="file" size={15} /> {t.attachment_name}
                  </a>
                ) : (
                  <a href={preview.url} target="_blank" rel="noreferrer" className="ticket__shot" title="Abrir en tamaño completo">
                    <img src={preview.url} alt={t.attachment_name} />
                  </a>
                ))}
            </article>
            {t.messages.map((m) => (
              <article key={m.id} className={`ticket-msg ticket-msg--${m.author_type}`}>
                <header>
                  <strong>{m.author_name}</strong> <span>{formatDateTime(m.created_at)}</span>
                </header>
                <p>{m.body}</p>
                {m.status_change_label && (
                  <div className="ticket-msg__status">
                    <Icon name="refresh" size={12} /> Estado: {m.status_change_label}
                  </div>
                )}
              </article>
            ))}
          </div>

          <div className="ticket__reply">
            <Field label="Respuesta al colegio" htmlFor="ticket-reply" hint="La verá el administrador en su sistema y le llegará un aviso a la campana.">
              <textarea id="ticket-reply" className="input" rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe la respuesta o los pasos para resolverlo…" />
            </Field>
            <div className="ticket__controls">
              <Field label="Estado" htmlFor="ticket-status">
                <select id="ticket-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {(options?.statuses || []).map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prioridad" htmlFor="ticket-priority">
                <select id="ticket-priority" className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {(options?.priorities || []).map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default SupportPage;
