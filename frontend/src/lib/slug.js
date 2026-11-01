/**
 * Reglas del identificador del colegio en la URL. Mantener sincronizado con
 * backend/src/utils/slug.js (mismo formato que el sistema escolar).
 */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

export const RESERVED_SLUGS = new Set([
  // plataforma / panel superadmin
  'admin', 'api', 'app', 'assets', 'auth', 'dashboard', 'health', 'login', 'logout',
  'portal', 'public', 'static', 'storage', 'superadmin', 'tenants', 'www', 'mail',
  'settings', 'help', 'soporte', 'support', 'status', 'slug-availability',
  // rutas de primer nivel del sistema escolar (su lib/tenantPath.js)
  'tenant', 'roles', 'staff', 'students', 'guardians', 'academics', 'schedules', 'discipline',
  'clubs', 'events', 'evaluation-plans', 'programmatic-content', 'grading', 'payments', 'src',
  'appointments', 'notifications', 'configuracion-inicial', 'secciones-academicas', 'audit',
  'recognitions', 'support',
]);

export const normalizeSlug = (value) => String(value || '').trim().toLowerCase();
export const isValidSlug = (value) => SLUG_RE.test(normalizeSlug(value));
export const isReservedSlug = (value) => RESERVED_SLUGS.has(normalizeSlug(value));

/**
 * Vista previa del esquema de PostgreSQL que recibirá el colegio
 * ("Colegio San Ignacio" → colegio_san_ignacio). Misma regla que
 * backend/src/utils/schemaName.js; el backend asigna el definitivo
 * (agrega _2, _3… si ya existe).
 */
export function schemaPreview(name) {
  let base = String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50)
    .replace(/_+$/g, '');
  if (!base) return '';
  if (!/^[a-z]/.test(base) || ['public', 'platform', 'information_schema'].includes(base) || base.startsWith('pg_')) {
    base = `c_${base}`.slice(0, 50);
  }
  return base;
}

/** "Colegio San José de Calasanz" → "colegio-san-jose-de-calasanz" */
export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}
