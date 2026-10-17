const crypto = require('crypto');

// Sin caracteres ambiguos (0/O, 1/l/I): la clave se copia a mano desde un correo.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%*?-_';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

const pick = (alphabet) => alphabet[crypto.randomInt(alphabet.length)];

/**
 * Contraseña temporal criptográficamente aleatoria con al menos una
 * mayúscula, minúscula, dígito y símbolo (≈ 74 bits con 12 caracteres).
 */
function generateTemporaryPassword(length = 12) {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  // Fisher–Yates con randomInt para no dejar los obligatorios al inicio.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { generateTemporaryPassword };
