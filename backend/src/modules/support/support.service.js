const { db, withTenantTransaction } = require('../../config/database');
const { ApiError } = require('../../utils/ApiError');
const { audit } = require('../../utils/audit');

/**
 * Soporte técnico (superadmin): todos los tickets que envían los colegios
 * desde su sistema escolar (platform.support_tickets, migración 004).
 *
 *   - Lista consolidada con filtros (estado, colegio, categoría, prioridad, texto).
 *   - Cambiar estado / prioridad y responder: en UNA transacción (ticket +
 *     mensaje + auditoría). Si la respuesta lleva un cambio de estado, queda en
 *     la conversación.
 *   - Al responder o cambiar el estado se avisa a quien reportó, en la campana
 *     de su colegio (notificación personal; mejor esfuerzo: si falla, el ticket
 *     igual se actualiza).
 */

const CATEGORIES = {
  bug: 'Falla del sistema',
  access: 'Acceso y usuarios',
  payments: 'Pagos y tasas',
  academic: 'Académico y calificaciones',
  notifications: 'Notificaciones y correos',
  data: 'Datos e importaciones',
  suggestion: 'Sugerencia o mejora',
  other: 'Otro',
};
const PRIORITIES = { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const STATUSES = { open: 'Abierto', in_progress: 'En progreso', resolved: 'Resuelto', closed: 'Cerrado' };
const PRIORITY_ORDER = "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END";

const code = (n) => `SOP-${String(n).padStart(6, '0')}`;
const shape = (t) => ({
  id: t.id,
  code: code(t.number),
  tenant: { id: t.tenant_id, name: t.tenant_name, slug: t.tenant_slug },
  category: t.category,
  category_label: CATEGORIES[t.category] || t.category,
  priority: t.priority,
  priority_label: PRIORITIES[t.priority],
  subject: t.subject,
  description: t.description,
  status: t.status,
  status_label: STATUSES[t.status],
  reporter_name: t.reporter_name,
  reporter_email: t.reporter_email,
  page_url: t.page_url,
  user_agent: t.user_agent,
  has_attachment: Boolean(t.attachment_name),
  attachment_name: t.attachment_name,
  attachment_mime: t.attachment_mime,
  attachment_size: t.attachment_size,
  assigned_to_name: t.assigned_to_name || null,
  message_count: Number(t.message_count || 0),
  awaiting_platform: t.last_author !== 'platform' && ['open', 'in_progress'].includes(t.status),
  resolved_at: t.resolved_at,
  last_activity_at: t.last_activity_at,
  created_at: t.created_at,
});

function baseQuery(conn) {
  return conn('platform.support_tickets as t')
    .join('public.tenants as tn', 'tn.id', 't.tenant_id')
    .leftJoin('platform.superadmins as sa', 'sa.id', 't.assigned_to')
    .select(
      't.id', 't.number', 't.tenant_id', 't.category', 't.priority', 't.subject', 't.description', 't.status',
      't.reporter_name', 't.reporter_email', 't.page_url', 't.user_agent', 't.attachment_name', 't.attachment_mime', 't.attachment_size',
      't.resolved_at', 't.last_activity_at', 't.created_at',
      'tn.name as tenant_name', 'tn.slug as tenant_slug', 'sa.full_name as assigned_to_name',
      conn.raw('(SELECT count(*) FROM platform.support_ticket_messages m WHERE m.ticket_id = t.id) AS message_count'),
      conn.raw('(SELECT m.author_type FROM platform.support_ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_author')
    );
}

/** Lista consolidada: { items, summary: { open, in_progress, resolved, closed, awaiting } }. */
async function listTickets({ status, tenantId, category, priority, q } = {}) {
  const rows = await baseQuery(db)
    .modify((query) => {
      if (status === 'active') query.whereIn('t.status', ['open', 'in_progress']);
      else if (status) query.where('t.status', status);
      if (tenantId) query.where('t.tenant_id', tenantId);
      if (category) query.where('t.category', category);
      if (priority) query.where('t.priority', priority);
      if (q) {
        const like = `%${q}%`;
        query.where((w) =>
          w.whereILike('t.subject', like).orWhereILike('t.description', like).orWhereILike('tn.name', like).orWhereILike('t.reporter_name', like).orWhereRaw("'SOP-' || lpad(t.number::text, 6, '0') ILIKE ?", [like])
        );
      }
    })
    .orderByRaw(`CASE WHEN t.status IN ('open', 'in_progress') THEN 0 ELSE 1 END, ${PRIORITY_ORDER}, t.last_activity_at DESC`)
    .limit(500);
  const counts = await db('platform.support_tickets').select('status').count('* as n').groupBy('status');
  const summary = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
  counts.forEach((c) => (summary[c.status] = Number(c.n)));
  const items = rows.map(shape);
  return { items, summary: { ...summary, awaiting: items.filter((t) => t.awaiting_platform).length } };
}

async function getTicket(id, conn = db) {
  const t = await baseQuery(conn).where('t.id', id).first();
  if (!t) throw ApiError.notFound('Ticket no encontrado.');
  const messages = await conn('platform.support_ticket_messages').where({ ticket_id: id }).orderBy('created_at').select('id', 'author_type', 'author_name', 'body', 'status_change', 'created_at');
  return { ...shape(t), messages: messages.map((m) => ({ ...m, status_change_label: m.status_change ? STATUSES[m.status_change] : null })) };
}

/**
 * Responder y/o cambiar estado o prioridad: { body?, status?, priority?, assignToMe? }.
 * Todo en una transacción; después del COMMIT se avisa al colegio.
 */
async function updateTicket(id, superadmin, { body, status, priority, assignToMe }, ip = null) {
  const result = await db.transaction(async (trx) => {
    const current = await trx('platform.support_tickets').where({ id }).forUpdate().first();
    if (!current) throw ApiError.notFound('Ticket no encontrado.');
    const statusChanged = status && status !== current.status;
    if (!body && !statusChanged && !priority && !assignToMe) throw ApiError.badRequest('Escribe una respuesta o cambia el estado.');

    const patch = { updated_at: trx.fn.now(), last_activity_at: trx.fn.now() };
    if (statusChanged) {
      patch.status = status;
      patch.resolved_at = status === 'resolved' || status === 'closed' ? trx.fn.now() : null;
    }
    if (priority) patch.priority = priority;
    if (assignToMe || (body && !current.assigned_to)) patch.assigned_to = superadmin.id;
    // Primera respuesta a un ticket abierto: pasa a "En progreso" (salvo que se indique otro estado).
    if (body && !status && current.status === 'open') {
      patch.status = 'in_progress';
    }
    await trx('platform.support_tickets').where({ id }).update(patch);
    if (body || statusChanged) {
      await trx('platform.support_ticket_messages').insert({
        ticket_id: id,
        author_type: 'platform',
        author_superadmin_id: superadmin.id,
        author_name: `${superadmin.fullName || 'Soporte'} · Soporte MoDo Educa`,
        body: body?.trim() || `Estado actualizado a «${STATUSES[status]}».`,
        status_change: patch.status && patch.status !== current.status ? patch.status : null,
      });
    }
    await audit(trx, {
      superadminId: superadmin.id,
      tenantId: current.tenant_id,
      action: 'support.ticket_updated',
      details: { ticket: code(current.number), status: patch.status || current.status, priority: patch.priority || current.priority, replied: Boolean(body) },
      ip,
    });
    return { current, newStatus: patch.status || current.status, replied: Boolean(body) };
  });

  await notifySchool(result.current, { status: result.newStatus, replied: result.replied, statusChanged: result.newStatus !== result.current.status });
  return getTicket(id);
}

/**
 * Aviso en la campana del colegio para quien reportó (personal: audience 'users').
 * Mejor esfuerzo: un fallo aquí no deshace la respuesta al ticket.
 */
async function notifySchool(ticket, { status, replied, statusChanged }) {
  if (!ticket.reported_by || (!replied && !statusChanged)) return;
  const label = STATUSES[status];
  const body = replied
    ? `Soporte respondió tu ticket ${code(ticket.number)} «${ticket.subject}»${statusChanged ? `. Estado: ${label}` : ''}.`
    : `Tu ticket ${code(ticket.number)} «${ticket.subject}» pasó a «${label}».`;
  try {
    await withTenantTransaction(ticket.tenant_id, async (trx) => {
      await trx('notifications').insert({
        tenant_id: ticket.tenant_id,
        type: 'support_ticket',
        title: replied ? 'Respuesta de Soporte técnico' : 'Ticket de soporte actualizado',
        body: body.slice(0, 500),
        data: JSON.stringify({ ticket_id: ticket.id, status, links: { users: `/support?ticket=${ticket.id}` }, link_label: 'Ver el ticket' }),
        audience: ['users'],
        target_user_ids: [ticket.reported_by],
      });
    });
  } catch (err) {
    console.error(`[soporte] No se pudo avisar al colegio del ticket ${code(ticket.number)}:`, err.message);
  }
}

async function getAttachment(id) {
  const t = await db('platform.support_tickets').where({ id }).first('attachment_name', 'attachment_mime', 'attachment_data');
  if (!t?.attachment_data) throw ApiError.notFound('El ticket no tiene adjunto.');
  return { name: t.attachment_name, mime: t.attachment_mime, data: t.attachment_data };
}

module.exports = { CATEGORIES, PRIORITIES, STATUSES, listTickets, getTicket, updateTicket, getAttachment };
