const campaignEngine = require('../services/campaignEngine');
const AuditLog = require('../models/AuditLog');

/**
 * Emergency stop all campaigns (Super Admin only)
 */
const emergencyStop = async (req, res) => {
    try {
        await campaignEngine.emergencyStopAll();

        // Create audit log
        await AuditLog.create({
            user: req.user._id,
            action: 'emergency_stop',
            resourceType: 'settings',
            details: { reason: req.body.reason || 'Emergency stop activated' },
            ipAddress: req.ip,
        });

        res.json({ message: 'Emergency stop activated - all campaigns stopped' });
    } catch (error) {
        console.error('Emergency stop error:', error);
        res.status(500).json({ error: 'Failed to execute emergency stop' });
    }
};

/**
 * Get system status
 */
const getStatus = async (req, res) => {
    try {
        const Campaign = require('../models/Campaign');

        const runningCampaigns = await Campaign.countDocuments({ status: 'running' });
        const pausedCampaigns = await Campaign.countDocuments({ status: 'paused' });

        res.json({
            status: {
                emergencyStop: campaignEngine.emergencyStop,
                runningCampaigns,
                pausedCampaigns,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                nodeVersion: process.version,
            },
        });
    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ error: 'Failed to get system status' });
    }
};

module.exports = {
    emergencyStop,
    getStatus,
};
