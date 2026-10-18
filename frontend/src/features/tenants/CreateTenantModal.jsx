import { useEffect, useRef, useState } from 'react';
import { tenantsApi } from '../../api/endpoints';
import { errorMessage, fieldErrors } from '../../api/client';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import { Alert, Field } from '../../components/ui/primitives';
import PriceInput, { parsePrice, priceProblem } from '../../components/ui/PriceInput';
import { isReservedSlug, isValidSlug, normalizeSlug, slugify } from '../../lib/slug';

const EMPTY = {
  name: '',
  slug: '',
  plan: 'standard',
  pricePerStudent: '1,00',
  contactPhone: '',
  notes: '',
  admin: { fullName: '', email: '', phone: '' },
};

function localSlugProblem(slug) {
  if (!slug) return null;
  if (slug.length < 3) return 'Mínimo 3 caracteres.';
  if (!isValidSlug(slug) || slug.includes('--')) return 'Solo minúsculas, números y guiones (sin guion al inicio o al final).';
  if (isReservedSlug(slug)) return 'Es una palabra reservada de la plataforma.';
  return null;
}

/** Disponibilidad del slug en vivo (con espera de 350 ms al escribir). */
function useSlugAvailability(slug) {
  const [state, setState] = useState({ status: 'idle', reason: null });
  const seq = useRef(0);

  useEffect(() => {
    const problem = localSlugProblem(slug);
    if (!slug || problem) {
      setState({ status: problem ? 'invalid' : 'idle', reason: problem });
      return undefined;
    }
    setState({ status: 'checking', reason: null });
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await tenantsApi.checkSlug(slug);
        if (id !== seq.current) return;
        setState({ status: res.available ? 'available' : 'taken', reason: res.reason });
      } catch {
        if (id === seq.current) setState({ status: 'idle', reason: null });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [slug]);

  return state;
}

function CreateTenantModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const availability = useSlugAvailability(form.slug);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setSlugTouched(false);
      setErrors({});
      setFormError('');
    }
  }, [open]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setAdmin = (key, value) => setForm((f) => ({ ...f, admin: { ...f.admin, [key]: value } }));

  const onNameChange = (value) => {
    setForm((f) => ({ ...f, name: value, slug: slugTouched ? f.slug : slugify(value) }));
  };

  const onSlugChange = (value) => {
    setSlugTouched(true);
    // Mientras escribe se permite un guion final; se limpia al enviar.
    set('slug', normalizeSlug(value).replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').slice(0, 60));
  };

  const slugBlocked = ['invalid', 'taken', 'checking'].includes(availability.status);
  const priceError = priceProblem(form.pricePerStudent);
  const canSubmit =
    form.name.trim() && form.slug && form.admin.fullName.trim() && form.admin.email.trim() && !slugBlocked && !priceError;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErrors({});
    setFormError('');
    try {
      const result = await tenantsApi.create({
        ...form,
        slug: form.slug.replace(/^-+|-+$/g, ''),
        pricePerStudent: parsePrice(form.pricePerStudent),
      });
      onCreated(result);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err, 'No se pudo crear el colegio.'));
    } finally {
      setSubmitting(false);
    }
  };

  const slugHint = {
    checking: 'Verificando disponibilidad…',
    available: (
      <span className="text-success">
        <Icon name="check" size={13} /> Disponible
      </span>
    ),
  }[availability.status];

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={submitting}
      size="lg"
      title="Nuevo colegio"
      subtitle="Se crearán el colegio, sus roles base y el administrador principal, y se le enviarán sus accesos por correo."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="create-tenant-form" icon="sparkles" loading={submitting} loadingText="Creando colegio…" disabled={!canSubmit}>
            Crear y enviar accesos
          </Button>
        </>
      }
    >
      <form id="create-tenant-form" onSubmit={onSubmit} noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}

        <h4 className="form-section">Colegio</h4>
        <div className="form-grid">
          <Field label="Nombre del colegio" htmlFor="t-name" required error={errors.name} full>
            <input id="t-name" className="input" value={form.name} onChange={(e) => onNameChange(e.target.value)} maxLength={150} placeholder="Ej.: Colegio San José" />
          </Field>

          <Field
            label="URL del colegio"
            htmlFor="t-slug"
            required
            error={errors.slug || (['invalid', 'taken'].includes(availability.status) ? availability.reason : null)}
            hint={slugHint || 'Identificador único en la dirección. No se puede cambiar después.'}
          >
            <div className="input-group input-group--prefix">
              <span className="input-group__prefix">/</span>
              <input
                id="t-slug"
                className={`input ${availability.status === 'available' ? 'input--success' : ''} ${['invalid', 'taken'].includes(availability.status) ? 'input--error' : ''}`}
                value={form.slug}
                onChange={(e) => onSlugChange(e.target.value)}
                placeholder="colegio-san-jose"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
          </Field>

          <Field label="Plan" htmlFor="t-plan">
            <select id="t-plan" className="input" value={form.plan} onChange={(e) => set('plan', e.target.value)}>
              <option value="trial">Prueba</option>
              <option value="standard">Estándar</option>
              <option value="premium">Premium</option>
            </select>
          </Field>

          <Field
            label="Valor por alumno ($)"
            htmlFor="t-price"
            required
            error={errors.pricePerStudent || priceError}
            hint="Tarifa mensual en USD por cada alumno registrado."
          >
            <PriceInput
              id="t-price"
              value={form.pricePerStudent}
              onChange={(v) => set('pricePerStudent', v)}
              invalid={Boolean(errors.pricePerStudent || priceError)}
            />
          </Field>

          <Field label="Teléfono del colegio" htmlFor="t-phone" error={errors.contactPhone}>
            <input id="t-phone" className="input" value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} maxLength={30} />
          </Field>
        </div>

        <h4 className="form-section">Administrador principal</h4>
        <div className="form-grid">
          <Field label="Nombre completo" htmlFor="a-name" required error={errors['admin.fullName']} full>
            <input id="a-name" className="input" value={form.admin.fullName} onChange={(e) => setAdmin('fullName', e.target.value)} maxLength={150} />
          </Field>
          <Field
            label="Correo electrónico"
            htmlFor="a-email"
            required
            error={errors['admin.email']}
            hint="Será su usuario de acceso y ahí recibirá la contraseña temporal."
          >
            <input id="a-email" type="email" className="input" value={form.admin.email} onChange={(e) => setAdmin('email', e.target.value)} maxLength={150} />
          </Field>
          <Field label="Teléfono" htmlFor="a-phone" error={errors['admin.phone']}>
            <input id="a-phone" className="input" value={form.admin.phone} onChange={(e) => setAdmin('phone', e.target.value)} maxLength={30} />
          </Field>
          <Field label="Notas internas" htmlFor="t-notes" hint="Solo visibles para los superadministradores." full>
            <textarea id="t-notes" className="input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={1000} />
          </Field>
        </div>

        <div className="info-box">
          <Icon name="lock" size={16} />
          <span>
            Se generará una contraseña temporal segura. El sistema escolar le exigirá cambiarla en su primer inicio de sesión.
          </span>
        </div>
      </form>
    </Modal>
  );
}

export default CreateTenantModal;
