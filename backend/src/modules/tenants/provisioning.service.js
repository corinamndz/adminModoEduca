const bcrypt = require('bcryptjs');
const { db } = require('../../config/database');
const { saltRounds } = require('../../config/env');
const { ApiError } = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');
const { slugProblem, normalizeSlug } = require('../../utils/slug');
const { generateTemporaryPassword } = require('../../utils/password');
const { invalidateTenantCache } = require('../../middlewares/tenantResolver.middleware');
const { sendAdminCredentialsEmail } = require('../../services/email/welcomeEmail');
const { ROLE_TEMPLATES, EXTRA_ACTIONS, ADMIN_ROLE } = require('./roleTemplates');

async function assertSlugAvailable(conn, slug) {
  const problem = slugProblem(slug);
  if (problem) throw ApiError.unprocessable(problem, [{ path: 'slug', message: problem }]);
  const taken = await conn('tenants').where({ slug }).first('id');
  if (taken) {
    const message = `La URL "/${slug}" ya está en uso por otro colegio.`;
    throw ApiError.conflict(message, [{ path: 'slug', message }]);
  }
}

/** Roles base + matriz de permisos, dentro de la transacción del alta. */
async function createBaseRoles(trx, tenantId) {
  const modules = await trx('modules').select('id', 'code');
  if (!modules.length) {
    throw ApiError.unprocessable(
      'La tabla de módulos está vacía. Corre `npm run seed` en sistema-escolar/backend antes de crear colegios.'
    );
  }

  const roleIdByName = {};
  for (const [name, template] of Object.entries(ROLE_TEMPLATES)) {
    const [role] = await trx('roles').insert({ tenant_id: tenantId, name, is_system: true }).returning('id');
    roleIdByName[name] = role.id;

    const permissions = modules
      .map((mod) => {
        const perm = template.allModules || template.byModule?.[mod.code];
        if (!perm) return null;
        const extraActions = {};
        if (template.extraActionsAllTrue) {
          (EXTRA_ACTIONS[mod.code] || []).forEach((action) => {
            extraActions[action] = true;
          });
        }
        return {
          tenant_id: tenantId,
          role_id: role.id,
          module_id: mod.id,
          can_create: Boolean(perm.can_create),
          can_read: Boolean(perm.can_read),
          can_update: Boolean(perm.can_update),
          can_delete: Boolean(perm.can_delete),
          extra_actions: extraActions,
        };
      })
      .filter(Boolean);

    if (permissions.length) await trx('role_permissions').insert(permissions);
  }
  return roleIdByName;
}

/**
 * Envía las credenciales y deja constancia en platform.credential_deliveries.
 * Nunca lanza: un SMTP caído no debe deshacer un alta ya confirmada.
 */
async function deliverCredentials({ tenant, user, email, fullName, temporaryPassword, kind, superadminId, conn = db }) {
  let sent = false;
  let error = null;
  try {
    await sendAdminCredentialsEmail({
      kind,
      to: email,
      schoolName: tenant.name,
      slug: tenant.slug,
      fullName,
      username: user.username,
      temporaryPassword,
    });
    sent = true;
  } catch (err) {
    // El detalle técnico ya lo imprimió mailer.js; aquí se guarda mensaje + sugerencia para el panel.
    error = [err.message || 'Error desconocido al enviar el correo.', err.hint].filter(Boolean).join(' — ');
  }

  await conn('platform.credential_deliveries').insert({
    tenant_id: tenant.id,
    user_id: user.id,
    recipient: email,
    kind,
    status: sent ? 'sent' : 'failed',
    error: error ? error.slice(0, 500) : null,
    sent_by: superadminId,
  });

  return { sent, error };
}

/**
 * Alta completa de un colegio:
 *   1. (transacción) tenants → tenant_settings → roles base y permisos →
 *      usuario admin principal con clave temporal y `must_change_password` →
 *      ficha en platform.tenant_accounts → auditoría.
 *   2. (después del COMMIT) correo de bienvenida por SMTP.
 *
 * El correo va después a propósito: si fallara dentro de la transacción no se
 * podría "desenviar", y si el SMTP está caído el colegio igual queda creado.
 * En ese caso la respuesta trae la clave temporal UNA vez para entregarla a
 * mano, y siempre se puede usar "Reenviar credenciales" (genera otra).
 */
async function provisionTenant(input, { superadminId, ip }) {
  const slug = normalizeSlug(input.slug);
  const adminEmail = input.admin.email.trim().toLowerCase();
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, saltRounds);

  await assertSlugAvailable(db, slug);

  let created;
  try {
    created = await db.transaction(async (trx) => {
      const [tenant] = await trx('tenants')
        .insert({ name: input.name.trim(), slug, status: 'active' })
        .returning(['id', 'name', 'slug', 'status', 'created_at']);

      // A partir de aquí, toda tabla con RLS queda acotada a este colegio.
      await trx.raw("SELECT set_config('app.tenant_id', ?, true)", [tenant.id]);

      await trx('tenant_settings').insert({
        tenant_id: tenant.id,
        contact_email: input.contactEmail || adminEmail,
        contact_phone: input.contactPhone || null,
      });

      const roleIdByName = await createBaseRoles(trx, tenant.id);

      // Mismo criterio que el portal: si el usuario es un correo, va en minúsculas
      // (el login del colegio normaliza igual los usuarios con "@").
      const [user] = await trx('users')
        .insert({
          tenant_id: tenant.id,
          username: adminEmail,
          password_hash: passwordHash,
          full_name: input.admin.fullName.trim(),
          must_change_password: true,
        })
        .returning(['id', 'username', 'full_name']);
      await trx('user_roles').insert({ user_id: user.id, role_id: roleIdByName[ADMIN_ROLE] });

      await trx('platform.tenant_accounts').insert({
        tenant_id: tenant.id,
        primary_admin_user_id: user.id,
        admin_full_name: user.full_name,
        admin_email: adminEmail,
        admin_phone: input.admin.phone || null,
        plan: input.plan || 'standard',
        notes: input.notes || null,
        created_by: superadminId,
      });

      await audit(trx, {
        superadminId,
        tenantId: tenant.id,
        action: 'tenant.create',
        details: { name: tenant.name, slug, adminEmail, plan: input.plan || 'standard' },
        ip,
      });

      return { tenant, user };
    });
  } catch (err) {
    // Dos altas simultáneas con el mismo slug: la base es la que decide.
    if (err.code === '23505' && String(err.constraint || '').includes('slug')) {
      const message = `La URL "/${slug}" ya está en uso por otro colegio.`;
      throw ApiError.conflict(message, [{ path: 'slug', message }]);
    }
    throw err;
  }

  invalidateTenantCache(slug);

  const delivery = await deliverCredentials({
    tenant: created.tenant,
    user: created.user,
    email: adminEmail,
    fullName: created.user.full_name,
    temporaryPassword,
    kind: 'welcome',
    superadminId,
  });

  return {
    tenant: {
      id: created.tenant.id,
      name: created.tenant.name,
      slug: created.tenant.slug,
      status: created.tenant.status,
      createdAt: created.tenant.created_at,
    },
    admin: { id: created.user.id, fullName: created.user.full_name, email: adminEmail, username: created.user.username },
    email: delivery,
    // Solo si el correo NO salió: es la única forma de entregar el acceso.
    temporaryPassword: delivery.sent ? undefined : temporaryPassword,
  };
}

module.exports = { provisionTenant, deliverCredentials, assertSlugAvailable };
