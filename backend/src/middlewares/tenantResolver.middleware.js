const { db, scopeToTenant } = require('../config/database');
const { ApiError } = require('../utils/ApiError');
const { SLUG_RE, normalizeSlug } = require('../utils/slug');

/**
 * Resolución de tenant por URL: `/:tenantSlug/...`
 * ------------------------------------------------
 * 1. Lee el slug del parámetro de ruta (por defecto `tenantSlug`).
 * 2. Lo busca en la tabla maestra `public.tenants` (con caché corta en memoria).
 * 3. Abre UNA transacción por request con `app.tenant_id` fijado, que es lo que
 *    las políticas RLS del sistema escolar usan para aislar los datos.
 * 4. Deja `req.tenant` y `req.db` (la transacción) para el resto del pipeline.
 *
 * La transacción se confirma ANTES de enviar la respuesta (si el status < 400)
 * y se revierte si hubo error o se cortó la conexión: igual que
 * sistema-escolar/backend/src/middlewares/tenant.middleware.js, del que este
 * es la variante "por URL" (allá el tenant sale del JWT).
 *
 * Solo depende de `db`, `ApiError` y las reglas de slug (nada del panel
 * superadmin): se puede llevar al sistema escolar para servir
 * `localhost/nombre-del-colegio/...` sin cambios de lógica.
 *
 * Opciones:
 *   param          nombre del parámetro de ruta con el slug.
 *   allowInactive  true para el superadmin (debe poder ver colegios suspendidos).
 */

const CACHE_TTL_MS = 30_000;
const cache = new Map(); // slug → { tenant, expiresAt }

async function findTenantBySlug(slug) {
  const hit = cache.get(slug);
  if (hit && hit.expiresAt > Date.now()) return hit.tenant;

  const tenant = await db('tenants').where({ slug }).first('id', 'name', 'slug', 'status', 'created_at', 'schema_name');
  // También se cachea el "no existe" para no martillar la base con URLs inventadas.
  cache.set(slug, { tenant: tenant || null, expiresAt: Date.now() + CACHE_TTL_MS });
  return tenant || null;
}

/** Llamar al crear un colegio o cambiar su estado/slug. */
function invalidateTenantCache(slug) {
  if (slug) cache.delete(normalizeSlug(slug));
  else cache.clear();
}

function tenantResolver({ param = 'tenantSlug', allowInactive = false } = {}) {
  return async function resolveTenant(req, res, next) {
    const slug = normalizeSlug(req.params[param]);
    if (!SLUG_RE.test(slug)) return next(ApiError.badRequest('La URL del colegio no es válida.'));

    let tenant;
    try {
      tenant = await findTenantBySlug(slug);
    } catch (err) {
      return next(err);
    }
    if (!tenant) return next(ApiError.notFound(`No existe un colegio con la URL "/${slug}".`));
    if (!allowInactive && tenant.status !== 'active') {
      return next(ApiError.forbidden('Este colegio está inactivo. Contacta al soporte de la plataforma.'));
    }

    let trx;
    try {
      trx = await db.transaction();
      // RLS por app.tenant_id y, si el colegio tiene esquema propio, search_path a ese esquema.
      await scopeToTenant(trx, { id: tenant.id, schemaName: tenant.schema_name });
    } catch (err) {
      if (trx && !trx.isCompleted()) await trx.rollback().catch(() => {});
      return next(err);
    }

    req.tenant = tenant;
    req.tenantId = tenant.id;
    req.db = trx;

    let settled = false;
    const finalize = async (commit) => {
      if (settled) return true;
      settled = true;
      try {
        if (trx.isCompleted()) return true;
        if (commit) await trx.commit();
        else await trx.rollback();
        return true;
      } catch (err) {
        console.error('[tenantResolver] Error cerrando la transacción:', err.message);
        if (!trx.isCompleted()) await trx.rollback().catch(() => {});
        return !commit;
      }
    };

    const originalEnd = res.end.bind(res);
    res.end = function endAfterCommit(...args) {
      if (settled) return originalEnd(...args);
      finalize(res.statusCode < 400).then((ok) => {
        if (ok || res.headersSent) return originalEnd(...args);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.removeHeader('Content-Length');
        return originalEnd(JSON.stringify({ error: { message: 'No se pudieron guardar los cambios. Inténtalo de nuevo.' } }));
      });
      return res;
    };
    res.on('close', () => finalize(false));

    return next();
  };
}

module.exports = { tenantResolver, invalidateTenantCache, findTenantBySlug };
