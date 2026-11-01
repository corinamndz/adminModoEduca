const router = require('express').Router();
const { z } = require('zod');
const service = require('./support.service');
const { asyncHandler } = require('../../utils/asyncHandler');

const uuid = z.string().uuid();
const optional = (schema) => z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

// GET /support/tickets?status=active|open|in_progress|resolved|closed&tenantId=&category=&priority=&q=
router.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        status: optional(z.enum(['active', ...Object.keys(service.STATUSES)])),
        tenantId: optional(uuid),
        category: optional(z.enum(Object.keys(service.CATEGORIES))),
        priority: optional(z.enum(Object.keys(service.PRIORITIES))),
        q: optional(z.string().trim().max(100)),
      })
      .parse(req.query);
    res.json(await service.listTickets(query));
  })
);

router.get(
  '/options',
  asyncHandler(async (req, res) => {
    const list = (obj) => Object.entries(obj).map(([key, label]) => ({ key, label }));
    res.json({ categories: list(service.CATEGORIES), priorities: list(service.PRIORITIES), statuses: list(service.STATUSES) });
  })
);

router.get(
  '/tickets/:id',
  asyncHandler(async (req, res) => res.json(await service.getTicket(uuid.parse(req.params.id))))
);

// PATCH /support/tickets/:id — { body?, status?, priority?, assignToMe? }: responder y/o cambiar estado o prioridad.
router.patch(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        body: optional(z.string().trim().min(2, 'Escribe la respuesta.').max(5000)),
        status: optional(z.enum(Object.keys(service.STATUSES))),
        priority: optional(z.enum(Object.keys(service.PRIORITIES))),
        assignToMe: z.boolean().optional(),
      })
      .parse(req.body || {});
    res.json(await service.updateTicket(uuid.parse(req.params.id), req.superadmin, data, req.ip));
  })
);

router.get(
  '/tickets/:id/attachment',
  asyncHandler(async (req, res) => {
    const file = await service.getAttachment(uuid.parse(req.params.id));
    res.set({ 'Content-Type': file.mime, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'Cache-Control': 'private, no-store' });
    res.send(file.data);
  })
);

module.exports = router;
