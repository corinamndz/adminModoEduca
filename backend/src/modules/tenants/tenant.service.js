const bcrypt = require('bcryptjs');
const { db } = require('../../config/database');
const { saltRounds } = require('../../config/env');
const { ApiError } = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');
const { slugProblem, normalizeSlug } = require('../../utils/slug');
const { generateTemporaryPassword } = require('../../utils/password');
const { invalidateTenantCache } = require('../../middlewares/tenantResolver.middleware');
const { loginUrlFor } = require('../../services/email/welcomeEmail');
const { metricsByTenant, metricsForTenant } = require('../stats/metrics.service');
const { deliverCredentials } = require('./provisioning.service');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Listado general con métricas rápidas por colegio. */
async function listTenants({ search, status } = {}) {
  const query = db('tenants as t')
    .leftJoin('platform.tenant_accounts as a', 'a.tenant_id', 't.id')
    .select(
      't.id',
      't.name',
      't.slug',
      't.status',
      't.created_at',
      'a.admin_full_name',
      'a.admin_email',
      'a.plan'
    )
    .orderBy('t.created_at', 'desc');

  if (status) query.where('t.status', status);
  if (search) {
    const term = `%${search.trim()}%`;
    query.where((w) => w.whereILike('t.name', term).orWhereILike('t.slug', term).orWhereILike('a.admin_email', term));
  }

  const rows = await query;
  const metrics = await metricsByTenant(rows.map((r) => r.id));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    createdAt: r.created_at,
    plan: r.plan || 'standard',
    admin: { fullName: r.admin_full_name, email: r.admin_email },
    loginUrl: loginUrlFor(r.slug),
    metrics: metrics.get(r.id),
  }));
}

/** ¿Está libre esta URL? Para validar en vivo desde el modal de creación. */
async function checkSlug(rawSlug) {
  const slug = normalizeSlug(rawSlug);
  const problem = slugProblem(slug);
  if (problem) return { slug, available: false, reason: problem };
  const taken = await db('tenants').where({ slug }).first('id');
  return taken
    ? { slug, available: false, reason: `"/${slug}" ya está en uso.` }
    : { slug, available: true, reason: null };
}

/** Ficha completa. `trx` es la transacción del tenantResolver (acotada al colegio). */
async function getTenantDetail(trx, tenant) {
  const [settings, account, metrics, deliveries] = await Promise.all([
    trx('tenant_settings').where({ tenant_id: tenant.id }).first('contact_email', 'contact_phone', 'logo_url', 'primary_color'),
    trx('platform.tenant_accounts').where({ tenant_id: tenant.id }).first(),
    metricsForTenant(trx, tenant.id),
    trx('platform.credential_deliveries')
      .where({ tenant_id: tenant.id })
      .orderBy('created_at', 'desc')
      .limit(10)
      .select('id', 'recipient', 'kind', 'status', 'error', 'created_at'),
  ]);

  let adminUser = null;
  if (account?.primary_admin_user_id) {
    adminUser = await trx('users')
      .where({ id: account.primary_admin_user_id, tenant_id: tenant.id })
      .first('id', 'username', 'full_name', 'status', 'last_login_at', 'must_change_password');
  }

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    createdAt: tenant.created_at,
    loginUrl: loginUrlFor(tenant.slug),
    plan: account?.plan || 'standard',
    notes: account?.notes || null,
    contact: { email: settings?.contact_email || null, phone: settings?.contact_phone || null },
    admin: {
      fullName: account?.admin_full_name || null,
      email: account?.admin_email || null,
      phone: account?.admin_phone || null,
      username: adminUser?.username || null,
      status: adminUser?.status || null,
      lastLoginAt: adminUser?.last_login_at || null,
      mustChangePassword: adminUser ? Boolean(adminUser.must_change_password) : null,
    },
    metrics,
    deliveries: deliveries.map((d) => ({
      id: d.id,
      recipient: d.recipient,
      kind: d.kind,
      status: d.status,
      error: d.error,
      createdAt: d.created_at,
    })),
  };
}

/**
 * Activa o suspende un colegio. El login del sistema escolar solo admite
 * colegios `active`, así que suspender corta los inicios de sesión nuevos.
 */
async function setTenantStatus(trx, tenant, status, { superadminId, ip }) {
  if (tenant.status === status) return { id: tenant.id, status };

  await trx('tenants').where({ id: tenant.id }).update({ status, updated_at: trx.fn.now() });
  await trx('platform.tenant_accounts')
    .where({ tenant_id: tenant.id })
    .update({ status_changed_at: trx.fn.now(), status_changed_by: superadminId, updated_at: trx.fn.now() });
  await audit(trx, {
    superadminId,
    tenantId: tenant.id,
    action: 'tenant.status',
    details: { from: tenant.status, to: status },
    ip,
  });

  invalidateTenantCache(tenant.slug);
  return { id: tenant.id, status };
}

/**
 * Genera una nueva clave temporal para el admin principal, vuelve a exigir el
 * cambio de clave y reenvía el correo. `email` opcional: corrige el destinatario
 * (útil en colegios creados antes del Tenant Manager, que no tienen correo).
 *
 * La clave se guarda en la transacción del request y el correo sale antes del
 * COMMIT: si el commit fallara (muy raro), el request responde 500 y basta con
 * reintentar; el correo con la clave anterior simplemente no servirá.
 */
async function resendCredentials(trx, tenant, { email } = {}, { superadminId, ip }) {
  const account = await trx('platform.tenant_accounts').where({ tenant_id: tenant.id }).first();
  if (!account?.primary_admin_user_id) {
    throw ApiError.unprocessable('Este colegio no tiene un administrador principal asignado.');
  }

  const recipient = (email || account.admin_email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(recipient)) {
    throw ApiError.unprocessable('Indica un correo válido para el administrador principal.', [
      { path: 'email', message: 'Correo inválido.' },
    ]);
  }

  const user = await trx('users')
    .where({ id: account.primary_admin_user_id, tenant_id: tenant.id })
    .first('id', 'username', 'full_name');
  if (!user) throw ApiError.notFound('El usuario administrador ya no existe en el colegio.');

  const temporaryPassword = generateTemporaryPassword();
  await trx('users')
    .where({ id: user.id, tenant_id: tenant.id })
    .update({
      password_hash: await bcrypt.hash(temporaryPassword, saltRounds),
      must_change_password: true,
      status: 'active',
      updated_at: trx.fn.now(),
    });

  if (recipient !== account.admin_email) {
    await trx('platform.tenant_accounts').where({ tenant_id: tenant.id }).update({ admin_email: recipient, updated_at: trx.fn.now() });
  }

  const delivery = await deliverCredentials({
    tenant,
    user,
    email: recipient,
    fullName: user.full_name,
    temporaryPassword,
    kind: 'resend',
    superadminId,
    conn: trx,
  });

  await audit(trx, {
    superadminId,
    tenantId: tenant.id,
    action: 'tenant.resend_credentials',
    details: { recipient, emailSent: delivery.sent },
    ip,
  });

  return {
    email: delivery,
    recipient,
    username: user.username,
    temporaryPassword: delivery.sent ? undefined : temporaryPassword,
  };
}

module.exports = { listTenants, checkSlug, getTenantDetail, setTenantStatus, resendCredentials };
