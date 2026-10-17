/**
 * Reglas del identificador del colegio en la URL (`/nombre-del-colegio`).
 * Mismo formato que valida el sistema escolar (frontend/src/lib/tenantSlug.js):
 * minúsculas, números y guiones; 1–60 caracteres; sin guion al inicio o final.
 */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

/**
 * Palabras que no pueden ser slug porque chocarían con rutas propias de la
 * plataforma (`/login`, `/api`, `/tenants`…) al usar el slug como primer
 * segmento de la URL. Mantener sincronizado con frontend/src/lib/slug.js.
 */
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'assets', 'auth', 'dashboard', 'health', 'login', 'logout',
  'portal', 'public', 'static', 'storage', 'superadmin', 'tenants', 'www', 'mail',
  'settings', 'help', 'soporte', 'support', 'status', 'slug-availability',
]);

const normalizeSlug = (value) => String(value || '').trim().toLowerCase();

/** null si es válido; si no, el motivo para mostrar al usuario. */
function slugProblem(value) {
  const slug = normalizeSlug(value);
  if (!slug) return 'Escribe la URL del colegio.';
  if (slug.length < 3) return 'La URL debe tener al menos 3 caracteres.';
  if (!SLUG_RE.test(slug)) return 'Usa solo minúsculas, números y guiones (sin guion al inicio o al final).';
  if (slug.includes('--')) return 'No uses dos guiones seguidos.';
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" es una palabra reservada de la plataforma.`;
  return null;
}

module.exports = { SLUG_RE, RESERVED_SLUGS, normalizeSlug, slugProblem };
