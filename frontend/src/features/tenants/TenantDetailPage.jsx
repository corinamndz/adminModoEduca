import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tenantsApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { Alert, Badge, Card, Field, PageHeader, StatCard } from '../../components/ui/primitives';
import { formatDate, formatDateTime, formatNumber, PLAN_LABELS, STATUS_LABELS, timeAgo } from '../../lib/format';
import NotFoundPage from '../dashboard/NotFoundPage';
import CredentialsResult from './CredentialsResult';

/** Ficha de un colegio, resuelto por la URL: /:tenantSlug */
function TenantDetailPage({ slug }) {
  const toast = useToast();
  const [tenant, setTenant] = useState(null);
  const [error, setError] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  const [resendResult, setResendResult] = useState(null);

  const load = useCallback(async () => {
    try {
      setTenant(await tenantsApi.get(slug));
      setError(null);
    } catch (err) {
      setError({ status: err.response?.status, message: errorMessage(err, 'No se pudo cargar el colegio.') });
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (error?.status === 404) return <NotFoundPage title="Colegio no encontrado" message={`No existe un colegio con la URL "/${slug}".`} />;
  if (error && !tenant) return <Alert variant="danger">{error.message}</Alert>;
  if (!tenant) return <Spinner />;

  const isActive = tenant.status === 'active';
  const status = STATUS_LABELS[tenant.status] || { label: tenant.status, variant: 'neutral' };
  const m = tenant.metrics;

  const changeStatus = async (next) => {
    setStatusBusy(true);
    try {
      await tenantsApi.setStatus(slug, next);
      toast.success(next === 'active' ? 'Colegio activado.' : 'Colegio desactivado: ya no podrán iniciar sesión.');
      setConfirmSuspend(false);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cambiar el estado.'));
    } finally {
      setStatusBusy(false);
    }
  };

  const openResend = () => {
    setResendEmail(tenant.admin.email || '');
    setResendOpen(true);
  };

  const resend = async (e) => {
    e.preventDefault();
    setResendBusy(true);
    try {
      const result = await tenantsApi.resendCredentials(slug, resendEmail.trim() || undefined);
      setResendResult(result);
      setResendOpen(false);
      if (result.email.sent) toast.success(`Credenciales enviadas a ${result.recipient}.`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudieron reenviar las credenciales.'));
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        back={
          <Link to="/tenants" className="back-link">
            <Icon name="arrowLeft" size={15} /> Colegios
          </Link>
        }
        title={
          <span className="title-with-badge">
            {tenant.name} <Badge variant={status.variant}>{status.label}</Badge>
          </span>
        }
        subtitle={
          <>
            <code className="slug">/{tenant.slug}</code> · Plan {PLAN_LABELS[tenant.plan] || tenant.plan} · Alta el {formatDate(tenant.createdAt)}
          </>
        }
        actions={
          <>
            <a className="btn btn--secondary" href={tenant.loginUrl} target="_blank" rel="noreferrer">
              <Icon name="link" size={17} /> Abrir login del colegio
            </a>
            {isActive ? (
              <Button variant="danger" icon="power" onClick={() => setConfirmSuspend(true)}>
                Desactivar
              </Button>
            ) : (
              <Button icon="power" onClick={() => changeStatus('active')} loading={statusBusy} loadingText="Activando…">
                Activar
              </Button>
            )}
          </>
        }
      />

      {!isActive && (
        <Alert variant="warning" title="Colegio inactivo">
          Sus usuarios no pueden iniciar sesión en el sistema escolar hasta que se active de nuevo.
        </Alert>
      )}
      {resendResult && <CredentialsResult result={resendResult} onClose={() => setResendResult(null)} />}

      <div className="stat-grid">
        <StatCard label="Alumnos matriculados" icon="graduation" tone="info" value={formatNumber(m.studentsEnrolled)} footer={`${formatNumber(m.studentsActive)} con ficha activa`} />
        <StatCard label="Representantes" icon="users" tone="success" value={formatNumber(m.guardians)} />
        <StatCard label="Personal" icon="briefcase" tone="warning" value={formatNumber(m.staff)} footer={`${formatNumber(m.teachers)} docentes`} />
        <StatCard label="Usuarios" icon="lock" value={formatNumber(m.users)} footer={`Última actividad: ${timeAgo(m.lastLoginAt)}`} />
      </div>

      <div className="grid-2">
        <Card
          title="Administrador principal"
          actions={
            <Button variant="secondary" size="sm" icon="mail" onClick={openResend}>
              Reenviar credenciales
            </Button>
          }
        >
          <dl className="detail-list">
            <dt>Nombre</dt>
            <dd>{tenant.admin.fullName || '—'}</dd>
            <dt>Correo</dt>
            <dd>{tenant.admin.email || <span className="text-warning">Sin correo registrado</span>}</dd>
            <dt>Usuario</dt>
            <dd>{tenant.admin.username ? <code>{tenant.admin.username}</code> : '—'}</dd>
            <dt>Teléfono</dt>
            <dd>{tenant.admin.phone || '—'}</dd>
            <dt>Último acceso</dt>
            <dd>{tenant.admin.lastLoginAt ? formatDateTime(tenant.admin.lastLoginAt) : 'Nunca ha iniciado sesión'}</dd>
            <dt>Contraseña</dt>
            <dd>
              {tenant.admin.mustChangePassword === null ? (
                '—'
              ) : tenant.admin.mustChangePassword ? (
                <Badge variant="warning">Temporal: debe cambiarla</Badge>
              ) : (
                <Badge variant="success">Personalizada</Badge>
              )}
            </dd>
          </dl>
        </Card>

        <Card title="Contacto y notas">
          <dl className="detail-list">
            <dt>Correo del colegio</dt>
            <dd>{tenant.contact.email || '—'}</dd>
            <dt>Teléfono</dt>
            <dd>{tenant.contact.phone || '—'}</dd>
            <dt>Notas internas</dt>
            <dd className="pre-wrap">{tenant.notes || '—'}</dd>
          </dl>
        </Card>
      </div>

      <Card title="Envíos de credenciales" subtitle="Últimos 10 correos de acceso enviados al administrador" flush>
        {tenant.deliveries.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Destinatario</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {tenant.deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{formatDateTime(d.createdAt)}</td>
                  <td>{d.kind === 'welcome' ? 'Bienvenida' : 'Reenvío'}</td>
                  <td>{d.recipient}</td>
                  <td>
                    {d.status === 'sent' ? (
                      <Badge variant="success">Enviado</Badge>
                    ) : (
                      <span title={d.error || ''}>
                        <Badge variant="danger">Falló</Badge>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="card__empty">Todavía no se han enviado credenciales desde el Tenant Manager.</p>
        )}
      </Card>

      <Modal
        open={confirmSuspend}
        onClose={() => setConfirmSuspend(false)}
        busy={statusBusy}
        title={`¿Desactivar ${tenant.name}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSuspend(false)} disabled={statusBusy}>
              Cancelar
            </Button>
            <Button variant="danger-solid" icon="power" onClick={() => changeStatus('suspended')} loading={statusBusy} loadingText="Desactivando…">
              Desactivar colegio
            </Button>
          </>
        }
      >
        <p>
          Nadie del colegio podrá iniciar sesión mientras esté inactivo. Sus datos se conservan y se puede volver a activar
          en cualquier momento.
        </p>
      </Modal>

      <Modal
        open={resendOpen}
        onClose={() => setResendOpen(false)}
        busy={resendBusy}
        title="Reenviar credenciales"
        subtitle="Se generará una NUEVA contraseña temporal; la anterior dejará de funcionar."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResendOpen(false)} disabled={resendBusy}>
              Cancelar
            </Button>
            <Button type="submit" form="resend-form" icon="mail" loading={resendBusy} loadingText="Enviando…" disabled={!resendEmail.trim()}>
              Generar y enviar
            </Button>
          </>
        }
      >
        <form id="resend-form" onSubmit={resend}>
          <Field label="Enviar a" htmlFor="resend-email" hint="Si cambias el correo, quedará como el del administrador principal.">
            <input id="resend-email" type="email" className="input" value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </>
  );
}

export default TenantDetailPage;
