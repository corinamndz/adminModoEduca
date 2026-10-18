import { useEffect, useState } from 'react';
import { tenantsApi } from '../../api/endpoints';
import { errorMessage, fieldErrors } from '../../api/client';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import PriceInput, { parsePrice, priceProblem } from '../../components/ui/PriceInput';
import { Alert, Field } from '../../components/ui/primitives';
import { formatMoney, formatNumber, formatPrice } from '../../lib/format';

const toForm = (tenant) => ({
  name: tenant.name,
  plan: tenant.plan,
  pricePerStudent: tenant.pricePerStudent.toFixed(2).replace('.', ','),
  notes: tenant.notes || '',
});

/**
 * Configuración del colegio: nombre, plan, tarifa por alumno y notas.
 * Muestra en vivo el ingreso mensual que resultaría con los alumnos actuales.
 * Solo envía los campos que cambiaron.
 */
function EditTenantModal({ open, tenant, onClose, onSaved }) {
  const [form, setForm] = useState(() => toForm(tenant));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(toForm(tenant));
      setErrors({});
      setFormError('');
    }
  }, [open, tenant]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const priceError = priceProblem(form.pricePerStudent);
  const price = parsePrice(form.pricePerStudent);
  const students = tenant.metrics.studentsActive;
  const nameError = form.name.trim().length < 3 ? 'El nombre debe tener al menos 3 caracteres.' : null;

  const patch = {};
  if (form.name.trim() !== tenant.name) patch.name = form.name.trim();
  if (form.plan !== tenant.plan) patch.plan = form.plan;
  if (price !== null && price !== tenant.pricePerStudent) patch.pricePerStudent = price;
  if (form.notes.trim() !== (tenant.notes || '')) patch.notes = form.notes.trim();
  const hasChanges = Object.keys(patch).length > 0;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!hasChanges || priceError || nameError) return;
    setSaving(true);
    setErrors({});
    setFormError('');
    try {
      onSaved(await tenantsApi.update(tenant.slug, patch));
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err, 'No se pudieron guardar los cambios.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="lg"
      title="Editar colegio"
      subtitle={`/${tenant.slug} · la URL no se puede cambiar.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-tenant-form" icon="check" loading={saving} disabled={!hasChanges || Boolean(priceError || nameError)}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <form id="edit-tenant-form" onSubmit={onSubmit} noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}

        <div className="form-grid">
          <Field label="Nombre del colegio" htmlFor="e-name" required error={errors.name || nameError} full>
            <input id="e-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={150} />
          </Field>

          <Field label="Plan" htmlFor="e-plan" hint={form.plan === 'trial' ? 'En prueba no se factura: su ingreso cuenta como potencial.' : undefined}>
            <select id="e-plan" className="input" value={form.plan} onChange={(e) => set('plan', e.target.value)}>
              <option value="trial">Prueba</option>
              <option value="standard">Estándar</option>
              <option value="premium">Premium</option>
            </select>
          </Field>

          <Field label="Valor por alumno ($)" htmlFor="e-price" required error={errors.pricePerStudent || priceError}>
            <PriceInput id="e-price" value={form.pricePerStudent} onChange={(v) => set('pricePerStudent', v)} invalid={Boolean(errors.pricePerStudent || priceError)} />
          </Field>

          <Field label="Notas internas" htmlFor="e-notes" hint="Solo visibles para los superadministradores." full>
            <textarea id="e-notes" className="input" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={1000} />
          </Field>
        </div>

        {/* Vista previa del contrato con la tarifa escrita */}
        <div className="price-preview" aria-live="polite">
          <div>
            <span className="price-preview__label">Ingreso mensual estimado</span>
            <span className="price-preview__formula">
              {formatNumber(students)} alumnos registrados × {price !== null ? formatPrice(price) : '—'}
            </span>
          </div>
          <strong className="price-preview__value">{price !== null ? formatMoney(Math.round(students * price * 100) / 100) : '—'}</strong>
        </div>
      </form>
    </Modal>
  );
}

export default EditTenantModal;
