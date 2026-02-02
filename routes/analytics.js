const express = require('express');
const router = express.Router();
const { authenticate, requireOperator } = require('../middleware/auth');
const {
    getCampaignAnalytics,
    getOverviewAnalytics,
} = require('../controllers/analyticsController');

router.use(authenticate);
router.use(requireOperator);

router.get('/campaigns/:id', getCampaignAnalytics);
router.get('/overview', getOverviewAnalytics);

module.exports = router;
