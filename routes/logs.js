const express = require('express');
const router = express.Router();
const { authenticate, requireOperator } = require('../middleware/auth');
const {
    getTransactionLogs,
    getAuditLogs,
    getTransactionStats,
} = require('../controllers/logController');

router.use(authenticate);
router.use(requireOperator);

router.get('/transactions', getTransactionLogs);
router.get('/transactions/stats', getTransactionStats);
router.get('/audit', getAuditLogs);

module.exports = router;
