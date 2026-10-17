/**
 * Reglas del identificador del colegio en la URL. Mantener sincronizado con
 * backend/src/utils/slug.js (mismo formato que el sistema escolar).
 */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'assets', 'auth', 'dashboard', 'health', 'login', 'logout',
  'portal', 'public', 'static', 'storage', 'superadmin', 'tenants', 'www', 'mail',
  'settings', 'help', 'soporte', 'support', 'status', 'slug-availability',
]);

export const normalizeSlug = (value) => String(value || '').trim().toLowerCase();
export const isValidSlug = (value) => SLUG_RE.test(normalizeSlug(value));
export const isReservedSlug = (value) => RESERVED_SLUGS.has(normalizeSlug(value));

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
