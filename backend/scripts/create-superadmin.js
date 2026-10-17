/**
 * Crea (o actualiza la clave de) un superadministrador.
 *
 * Uso:
 *   npm run superadmin:create -- --email yo@modoeduca.com --name "Mi Nombre" --password "ClaveSegura123!"
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db } = require('../src/config/database');
const { saltRounds } = require('../src/config/env');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = String(arg('email') || '').trim().toLowerCase();
  const fullName = String(arg('name') || '').trim();
  const password = String(arg('password') || '');

  if (!email.includes('@') || !fullName || password.length < 10) {
    throw new Error('Uso: --email <correo> --name "<nombre>" --password "<mínimo 10 caracteres>"');
  }

  const passwordHash = await bcrypt.hash(password, saltRounds);
  const existing = await db('platform.superadmins').whereRaw('lower(email) = ?', [email]).first();

  if (existing) {
    await db('platform.superadmins')
      .where({ id: existing.id })
      .update({ full_name: fullName, password_hash: passwordHash, status: 'active', updated_at: db.fn.now() });
    console.log(`[ok] Superadmin ${email} actualizado.`);
  } else {
    await db('platform.superadmins').insert({ email, full_name: fullName, password_hash: passwordHash });
    console.log(`[ok] Superadmin ${email} creado.`);
  }
}

main()
  .catch((err) => {
    console.error('[error]', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
