const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin, requireOperator } = require('../middleware/auth');
const {
    emergencyStop,
    getStatus,
} = require('../controllers/settingsController');

router.use(authenticate);

// Super Admin only
router.post('/emergency-stop', requireSuperAdmin, emergencyStop);

// Operator can view status
router.get('/status', requireOperator, getStatus);

module.exports = router;
