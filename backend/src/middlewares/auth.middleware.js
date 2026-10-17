const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { ApiError } = require('../utils/ApiError');

/**
 * Exige un JWT de superadmin (`Authorization: Bearer …`). El token lleva
 * `scope: 'platform'` y se firma con un secreto distinto al del sistema
 * escolar, así que un token de un usuario de colegio nunca sirve aquí.
 */
function requireSuperadmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(ApiError.unauthorized('Inicia sesión para continuar.'));

  try {
    const payload = jwt.verify(token, jwtSecret);
    if (payload.scope !== 'platform') throw new Error('scope');
    req.superadmin = { id: payload.sub, email: payload.email, fullName: payload.name };
    return next();
  } catch {
    return next(ApiError.unauthorized('Sesión inválida o expirada.'));
  }
}

module.exports = { requireSuperadmin };
