const router = require('express').Router();
const service = require('./stats.service');
const { asyncHandler } = require('../../utils/asyncHandler');

/** GET /api/stats/overview — métricas agregadas de toda la red. */
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    res.json(await service.getOverview());
  })
);

module.exports = router;
