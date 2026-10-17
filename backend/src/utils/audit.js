/** Registra una acción del superadmin en platform.audit_logs (con `db` o una transacción). */
async function audit(conn, { superadminId, tenantId = null, action, details = {}, ip = null }) {
  await conn('platform.audit_logs').insert({
    superadmin_id: superadminId,
    tenant_id: tenantId,
    action,
    details,
    ip,
  });
}

module.exports = { audit };
