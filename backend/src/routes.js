const router = require('express').Router();
const { requireSuperadmin } = require('./middlewares/auth.middleware');

router.use('/auth', require('./modules/auth/auth.routes'));

// Todo lo demás exige sesión de superadmin.
router.use(requireSuperadmin);
router.use('/tenants', require('./modules/tenants/tenant.routes'));
router.use('/stats', require('./modules/stats/stats.routes'));
router.use('/support', require('./modules/support/support.routes'));

module.exports = router;
