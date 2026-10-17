const router = require('express').Router();
const { z } = require('zod');
const service = require('./auth.service');
const { asyncHandler } = require('../../utils/asyncHandler');
const { requireSuperadmin } = require('../../middlewares/auth.middleware');

const loginSchema = z.object({
  email: z.string().trim().email('Correo inválido.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    res.json(await service.login(loginSchema.parse(req.body), { ip: req.ip }));
  })
);

router.get(
  '/me',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    res.json(await service.getMe(req.superadmin.id));
  })
);

module.exports = router;
