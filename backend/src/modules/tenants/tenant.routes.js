const router = require('express').Router();
const { z } = require('zod');
const service = require('./tenant.service');
const { provisionTenant } = require('./provisioning.service');
const { asyncHandler } = require('../../utils/asyncHandler');
const { tenantResolver } = require('../../middlewares/tenantResolver.middleware');

const optionalText = (max) => z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().trim().max(max).optional());

const createSchema = z.object({
  name: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres.').max(150),
  slug: z.string().trim().min(1, 'Escribe la URL del colegio.').max(60),
  plan: z.enum(['trial', 'standard', 'premium']).default('standard'),
  contactEmail: optionalText(150).pipe(z.string().email('Correo de contacto inválido.').optional()),
  contactPhone: optionalText(30),
  notes: optionalText(1000),
  admin: z.object({
    fullName: z.string().trim().min(3, 'Escribe el nombre completo del administrador.').max(150),
    email: z.string().trim().email('Correo del administrador inválido.').max(150),
    phone: optionalText(30),
  }),
});

const ctx = (req) => ({ superadminId: req.superadmin.id, ip: req.ip });

// ---- Colección -------------------------------------------------------------

/** GET /api/tenants?search=&status= */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, status } = z
      .object({ search: z.string().max(100).optional(), status: z.enum(['active', 'suspended', 'trial']).optional() })
      .parse(req.query);
    res.json(await service.listTenants({ search, status }));
  })
);

/** GET /api/tenants/slug-availability?slug= (antes de /:tenantSlug para no confundirse con un colegio) */
router.get(
  '/slug-availability',
  asyncHandler(async (req, res) => {
    res.json(await service.checkSlug(String(req.query.slug || '')));
  })
);

/** POST /api/tenants — alta del colegio + admin principal + correo de bienvenida. */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json(await provisionTenant(createSchema.parse(req.body), ctx(req)));
  })
);

// ---- Un colegio, resuelto por su URL: /api/tenants/:tenantSlug/... ---------

const scoped = require('express').Router({ mergeParams: true });
router.use('/:tenantSlug', tenantResolver({ allowInactive: true }), scoped);

/** GET /api/tenants/:tenantSlug */
scoped.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.getTenantDetail(req.db, req.tenant));
  })
);

/** PATCH /api/tenants/:tenantSlug/status — { status: 'active' | 'suspended' } */
scoped.patch(
  '/status',
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['active', 'suspended']) }).parse(req.body);
    res.json(await service.setTenantStatus(req.db, req.tenant, status, ctx(req)));
  })
);

/** POST /api/tenants/:tenantSlug/resend-credentials — { email? } */
scoped.post(
  '/resend-credentials',
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: optionalText(150).pipe(z.string().email('Correo inválido.').optional()) }).parse(req.body || {});
    res.json(await service.resendCredentials(req.db, req.tenant, { email }, ctx(req)));
  })
);

module.exports = router;
