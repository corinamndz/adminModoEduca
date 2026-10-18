const router = require('express').Router();
const { z } = require('zod');
const service = require('./tenant.service');
const { provisionTenant } = require('./provisioning.service');
const { asyncHandler } = require('../../utils/asyncHandler');
const { tenantResolver } = require('../../middlewares/tenantResolver.middleware');

const optionalText = (max) => z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().trim().max(max).optional());

// Tarifa mensual por alumno en USD: 0 a 10.000, máximo 2 decimales (acepta "1,50" o 1.5).
const pricePerStudent = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().replace(',', '.') || undefined : v),
  z.coerce
    .number({ invalid_type_error: 'Indica un monto válido.' })
    .min(0, 'El valor por alumno no puede ser negativo.')
    .max(10000, 'El valor por alumno no puede superar $10.000.')
    .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'Usa como máximo 2 decimales.')
);

const name = z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres.').max(150);
const plan = z.enum(['trial', 'standard', 'premium']);

const createSchema = z.object({
  name,
  slug: z.string().trim().min(1, 'Escribe la URL del colegio.').max(60),
  plan: plan.default('standard'),
  pricePerStudent: pricePerStudent.default(1),
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

const updateSchema = z
  .object({ name: name.optional(), plan: plan.optional(), pricePerStudent: pricePerStudent.optional(), notes: z.string().trim().max(1000).optional() })
  .refine((o) => Object.keys(o).length > 0, 'No hay cambios para guardar.');

/** PATCH /api/tenants/:tenantSlug — { name?, plan?, pricePerStudent?, notes? } → ficha actualizada */
scoped.patch(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.updateTenant(req.db, req.tenant, updateSchema.parse(req.body || {}), ctx(req)));
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
