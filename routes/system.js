const express = require('express');
const router = express.Router();
const { getSystemStats, getRealTimeMetrics } = require('../controllers/systemController');
const { authenticate } = require('../middleware/auth');

// Get comprehensive system stats
router.get('/stats', authenticate, getSystemStats);

// Get real-time metrics (lighter, for polling)
router.get('/realtime', authenticate, getRealTimeMetrics);

module.exports = router;
