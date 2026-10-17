require('dotenv').config();
const app = require('./src/app');
const { db, detectRlsBypass } = require('./src/config/database');
const { verifyMailer } = require('./src/services/email/mailer');

const PORT = Number(process.env.PORT) || 4000;

async function start() {
  try {
    await db.raw('SELECT 1');
    const bypass = await detectRlsBypass();
    console.log(
      bypass
        ? '[db] Conectado. El rol puede leer todos los colegios (estadísticas en una sola consulta).'
        : '[db] Conectado. El rol NO salta RLS: las estadísticas se calcularán colegio por colegio (ver docs/db-role.sql).'
    );
  } catch (err) {
    console.error('[db] No se pudo conectar a PostgreSQL:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => console.log(`[api] Tenant Manager escuchando en http://localhost:${PORT}`));
  // No bloquea el arranque: solo informa si el correo saldrá de verdad.
  verifyMailer();
}

start();
