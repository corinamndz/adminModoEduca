const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../../config/database');
const { jwtSecret, jwtExpiresIn } = require('../../config/env');
const { ApiError } = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');

// Hash fijo para comparar aunque el correo no exista: misma latencia en ambos casos.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const toDto = (row) => ({ id: row.id, email: row.email, fullName: row.full_name, lastLoginAt: row.last_login_at });

async function login({ email, password }, { ip } = {}) {
  const normalized = String(email || '').trim().toLowerCase();
  const admin = await db('platform.superadmins').whereRaw('lower(email) = ?', [normalized]).first();

  const ok = await bcrypt.compare(String(password || ''), admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !ok || admin.status !== 'active') {
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

module.exports = { login, getMe };
