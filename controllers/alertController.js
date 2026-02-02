const Alert = require('../models/Alert');

/**
 * Get all alerts
 */
const getAlerts = async (req, res) => {
    try {
        const { type, isRead } = req.query;

        const filter = {};
        if (type) filter.type = type;
        if (isRead !== undefined) filter.isRead = isRead === 'true';

        const alerts = await Alert.find(filter)
            .populate('campaign', 'name')
            .populate('wallet', 'name address')
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ alerts });
    } catch (error) {
        console.error('Get alerts error:', error);
        res.status(500).json({ error: 'Failed to get alerts' });
    }
};

/**
 * Mark alert as read
 */
const markAsRead = async (req, res) => {
    try {
        const alert = await Alert.findByIdAndUpdate(
            req.params.id,
            { isRead: true },
            { new: true }
        );

        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        res.json({ alert });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ error: 'Failed to mark alert as read' });
    }
};

/**
 * Delete alert
 */
const deleteAlert = async (req, res) => {
    try {
        const alert = await Alert.findByIdAndDelete(req.params.id);

        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        res.json({ message: 'Alert deleted successfully' });
    } catch (error) {
        console.error('Delete alert error:', error);
        res.status(500).json({ error: 'Failed to delete alert' });
    }
};

/**
 * Get unread count
 */
const getUnreadCount = async (req, res) => {
    try {
        const count = await Alert.countDocuments({ isRead: false });
        res.json({ count });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ error: 'Failed to get unread count' });
    }
};

module.exports = {
    getAlerts,
    markAsRead,
    deleteAlert,
    getUnreadCount,
};
