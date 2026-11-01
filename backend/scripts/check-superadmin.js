/**
 * Diagnostica por qué un superadmin no puede iniciar sesión, con la MISMA
 * lógica que el login (src/modules/auth/auth.service.js). Solo lee la base.
 *
 * Uso:
 *   npm run superadmin:check -- --email yo@correo.com --password "MiClave"
 *   npm run superadmin:check                       (lista los superadmins y el estado de su hash)
 */
require('dotenv').config();
const { db } = require('../src/config/database');
const { loginFailureReason } = require('../src/modules/auth/auth.service');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  const all = await db('platform.superadmins').select('email', 'full_name', 'status', 'password_hash').orderBy('email');
  console.log(`Base: ${process.env.DB_NAME} · superadmins: ${all.length}`);
  console.table(
    all.map((a) => ({
      email: a.email,
      nombre: a.full_name,
      estado: a.status,
      hash: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(a.password_hash).trim()) ? 'bcrypt válido' : 'NO es bcrypt',
    }))
  );

  const email = String(arg('email') || '').trim().toLowerCase();
  if (!email) return;
  const password = arg('password');
  if (password === undefined) throw new Error('Falta --password "<clave>".');

  const admin = await db('platform.superadmins').whereRaw('lower(btrim(email)) = ?', [email]).first();
  const reason = await loginFailureReason(admin, String(password));
  if (!reason) {
    console.log(`\n✔ Las credenciales de ${email} son correctas: el login debería funcionar.`);
    console.log('  Si el panel igual responde 401, revisa que el backend apunte a esta misma base (DB_NAME) y que esté reiniciado.');
    return;
  }
  console.log(`\n✘ Login rechazado para ${email}: ${reason}.`);
  if (!admin) {
    const similar = all.filter((a) => a.email.toLowerCase().split('@')[0].replace(/\W/g, '').slice(0, 6) === email.split('@')[0].replace(/\W/g, '').slice(0, 6));
    if (similar.length) console.log(`  ¿Quisiste decir: ${similar.map((a) => a.email).join(', ')}?`);
  }
  console.log('  Para fijar una clave nueva (con bcrypt):');
  console.log(`  npm run superadmin:create -- --email ${admin?.email || email} --name "${admin?.full_name || 'Tu Nombre'}" --password "<clave de 10+ caracteres>"`);
}

main()
  .catch((err) => {
    console.error('[error]', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
