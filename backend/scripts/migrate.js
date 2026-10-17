/**
 * Aplica migrations/*.sql del Tenant Manager, en orden, registrándolas en
 * `platform.schema_migrations` (separada de la `schema_migrations` del
 * sistema escolar, que vive en `public`).
 *
 * Uso: npm run migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { connectionConfig } = require('../src/config/database');

async function assertSchoolSchema(client) {
  const { rows } = await client.query(`
    SELECT
      to_regclass('public.tenants') IS NOT NULL AS has_tenants,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'must_change_password'
      ) AS has_must_change
  `);
  if (!rows[0].has_tenants || !rows[0].has_must_change) {
    throw new Error(
      'La base no tiene el esquema del sistema escolar al día (faltan public.tenants o users.must_change_password). ' +
        'Corre primero `npm run migrate` en sistema-escolar/backend.'
    );
  }
}

async function main() {
  const client = new Client(connectionConfig());
  await client.connect();

  try {
    await assertSchoolSchema(client);
    await client.query('CREATE SCHEMA IF NOT EXISTS platform');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform.schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const dir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      const { rowCount } = await client.query('SELECT 1 FROM platform.schema_migrations WHERE filename = $1', [file]);
      if (rowCount > 0) {
        console.log(`[skip]  ${file}`);
        continue;
      }
      console.log(`[apply] ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
        await client.query('INSERT INTO platform.schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    console.log('[ok] Migraciones del Tenant Manager al día.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[error]', err.message);
  process.exit(1);
});
