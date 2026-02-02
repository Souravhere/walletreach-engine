const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');

/**
 * Get transaction logs
 */
const getTransactionLogs = async (req, res) => {
    try {
        const { campaign, wallet, status, limit = 100 } = req.query;

        const filter = {};
        if (campaign) filter.campaign = campaign;
        if (wallet) filter.senderWallet = wallet;
        if (status) filter.status = status;

        const transactions = await Transaction.find(filter)
            .populate('campaign', 'name')
            .populate('senderWallet', 'name address')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json({ transactions });
    } catch (error) {
        console.error('Get transaction logs error:', error);
        res.status(500).json({ error: 'Failed to get transaction logs' });
    }
};

/**
 * Get audit logs
 */
const getAuditLogs = async (req, res) => {
    try {
        const { user, action, resourceType, limit = 100 } = req.query;

        const filter = {};
        if (user) filter.user = user;
        if (action) filter.action = action;
        if (resourceType) filter.resourceType = resourceType;

        const logs = await AuditLog.find(filter)
            .populate('user', 'username email')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json({ logs });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ error: 'Failed to get audit logs' });
    }
};

/**
 * Get transaction statistics
 */
const getTransactionStats = async (req, res) => {
    try {
        const { campaign } = req.query;

        const filter = {};
        if (campaign) filter.campaign = campaign;

        const stats = await Transaction.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const statsMap = {
            pending: 0,
            success: 0,
            failed: 0,
        };

        stats.forEach(({ _id, count }) => {
            statsMap[_id] = count;
        });

        res.json({ stats: statsMap });
    } catch (error) {
        console.error('Get transaction stats error:', error);
        res.status(500).json({ error: 'Failed to get transaction stats' });
    }
};

module.exports = {
    getTransactionLogs,
    getAuditLogs,
    getTransactionStats,
};
