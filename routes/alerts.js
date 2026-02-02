const express = require('express');
const router = express.Router();
const { authenticate, requireOperator } = require('../middleware/auth');
const {
    getAlerts,
    markAsRead,
    deleteAlert,
    getUnreadCount,
} = require('../controllers/alertController');

router.use(authenticate);
router.use(requireOperator);

router.get('/', getAlerts);
router.get('/unread-count', getUnreadCount);
router.put('/:id/read', markAsRead);
router.delete('/:id', deleteAlert);

module.exports = router;
