/**
 * Variables de entorno leídas en un solo lugar, con valores por defecto de
 * desarrollo. En producción, las críticas (secreto JWT) son obligatorias.
 */
const isProduction = process.env.NODE_ENV === 'production';

function required(name, devFallback) {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) throw new Error(`Falta la variable de entorno ${name}.`);
  return devFallback;
}

const trimSlash = (url) => String(url).replace(/\/$/, '');

module.exports = {
  isProduction,
  jwtSecret: required('SUPERADMIN_JWT_SECRET', 'dev-only-superadmin-secret'),
  jwtExpiresIn: process.env.SUPERADMIN_JWT_EXPIRES_IN || '8h',
  // true = la consola del backend dice POR QUÉ se rechaza cada login (nunca en producción).
  authDebug: process.env.AUTH_DEBUG === 'true' && !isProduction,
  saltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  // Rol de BD del sistema escolar, si es distinto al del Tenant Manager: recibe
  // permisos sobre cada esquema nuevo. Vacío = mismo rol (no hace falta).
  schoolDbRole: process.env.SCHOOL_DB_ROLE || null,
  adminFrontendUrl: trimSlash(process.env.ADMIN_FRONTEND_URL || 'http://localhost:5174'),
  schoolAppUrl: trimSlash(process.env.SCHOOL_APP_URL || 'http://localhost:5173'),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'MoDo Educa <no-reply@modoeduca.com>',
    debug: process.env.SMTP_DEBUG === 'true',
  },
};
