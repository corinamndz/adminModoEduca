/**
 * Nombre del esquema de PostgreSQL de cada colegio, derivado de su nombre:
 *   "Colegio San Ignacio"      → colegio_san_ignacio
 *   "U.E. Nuestra Señora (II)" → u_e_nuestra_senora_ii
 *   "123 Escuela"              → c_123_escuela   (debe empezar con letra)
 *
 * Solo minúsculas ASCII, dígitos y "_": nunca necesita comillas ni puede
 * inyectar SQL. Igual se usa SIEMPRE como identificador citado (`??` / %I).
 */
const SCHEMA_RE = /^[a-z][a-z0-9_]{0,62}$/;
const RESERVED = new Set(['public', 'platform', 'information_schema']);
const MAX_BASE = 50; // deja lugar para el sufijo _2, _3… dentro de los 63 bytes de PostgreSQL

function schemaBaseFromName(name) {
  let base = String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tildes y diéresis
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_BASE)
    .replace(/_+$/g, '');
  if (!base) base = 'colegio';
  if (!/^[a-z]/.test(base)) base = `c_${base}`.slice(0, MAX_BASE);
  if (RESERVED.has(base) || base.startsWith('pg_')) base = `c_${base}`.slice(0, MAX_BASE);
  return base;
}

const isValidSchemaName = (s) => SCHEMA_RE.test(s) && !RESERVED.has(s) && !s.startsWith('pg_');

/**
 * Primer nombre libre: colegio_san_ignacio, colegio_san_ignacio_2, …
 * Libre = no existe el esquema en la base NI está asignado a otro colegio.
 * (La carrera entre dos altas simultáneas la resuelven CREATE SCHEMA y el
 * índice único de tenants.schema_name: una de las dos falla y se revierte.)
 */
async function allocateSchemaName(conn, name) {
  const base = schemaBaseFromName(name);
  for (let i = 1; i < 1000; i += 1) {
    const candidate = i === 1 ? base : `${base}_${i}`;
    const { rows } = await conn.raw(
      `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = :s)
           OR EXISTS (SELECT 1 FROM public.tenants WHERE schema_name = :s) AS taken`,
      { s: candidate }
    );
    if (!rows[0].taken) return candidate;
  }
  throw new Error(`No se encontró un nombre de esquema libre para "${name}".`);
}

module.exports = { schemaBaseFromName, isValidSchemaName, allocateSchemaName, SCHEMA_RE };
