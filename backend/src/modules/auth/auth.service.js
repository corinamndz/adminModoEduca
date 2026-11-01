const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../../config/database');
const { jwtSecret, jwtExpiresIn, authDebug } = require('../../config/env');
const { ApiError } = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');

// Hash fijo para comparar aunque el correo no exista: misma latencia en ambos casos.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const toDto = (row) => ({ id: row.id, email: row.email, fullName: row.full_name, lastLoginAt: row.last_login_at });

/**
 * Por qué se rechaza un login (null = credenciales correctas). El cliente
 * SIEMPRE recibe el mismo mensaje genérico; el motivo solo sirve para
 * diagnosticar (AUTH_DEBUG=true en desarrollo, o `npm run superadmin:check`).
 */
async function loginFailureReason(admin, password) {
  if (!admin) {
    await bcrypt.compare(password, DUMMY_HASH); // misma latencia que un correo existente
    return 'no existe un superadmin con ese correo';
  }
  const hash = String(admin.password_hash ?? '').trim();
  if (!BCRYPT_RE.test(hash)) {
    // Típico al crear el usuario a mano: se guardó la clave en texto plano u otro tipo de hash.
    return `password_hash no es un hash bcrypt (empieza con "${hash.slice(0, 4)}…", ${hash.length} caracteres)`;
  }
  if (!(await bcrypt.compare(password, hash))) return 'la contraseña no coincide con password_hash';
  if (admin.status !== 'active') return `la cuenta está en estado "${admin.status}"`;
  return null;
}

async function login({ email, password }, { ip } = {}) {
  const normalized = String(email || '').trim().toLowerCase();
  const admin = await db('platform.superadmins').whereRaw('lower(btrim(email)) = ?', [normalized]).first();

  const reason = await loginFailureReason(admin, String(password || ''));
  if (reason) {
    if (authDebug) console.warn(`[auth] Login rechazado para "${normalized}": ${reason}.`);
    throw ApiError.unauthorized('Correo o contraseña incorrectos.');
  }

  await db('platform.superadmins').where({ id: admin.id }).update({ last_login_at: db.fn.now() });
  await audit(db, { superadminId: admin.id, action: 'auth.login', ip });

  const accessToken = jwt.sign(
    { sub: admin.id, email: admin.email, name: admin.full_name, scope: 'platform' },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
  return { accessToken, user: toDto(admin) };
}

async function getMe(id) {
  const admin = await db('platform.superadmins').where({ id, status: 'active' }).first();
  if (!admin) throw ApiError.unauthorized('Tu cuenta ya no está activa.');
  return toDto(admin);
}

module.exports = { login, getMe, loginFailureReason };
