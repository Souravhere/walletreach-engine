const Campaign = require('../models/Campaign');
const Transaction = require('../models/Transaction');
const { ethers } = require('ethers');

/**
 * Get campaign analytics
 */
const getCampaignAnalytics = async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        // Get transaction data
        const transactions = await Transaction.find({ campaign: campaign._id });

        // Calculate metrics
        const successfulTx = transactions.filter(tx => tx.status === 'success');
        const failedTx = transactions.filter(tx => tx.status === 'failed');

        // Calculate total gas spent
        let totalGasSpent = 0n;
        successfulTx.forEach(tx => {
            if (tx.gasUsed && tx.gasPrice) {
                totalGasSpent += BigInt(tx.gasUsed) * BigInt(tx.gasPrice);
            }
        });

        // Calculate cost per holder
        const costPerHolder = successfulTx.length > 0
            ? Number(totalGasSpent) / successfulTx.length
            : 0;

        // Progress over time (grouped by hour)
        const progressOverTime = await Transaction.aggregate([
            { $match: { campaign: campaign._id, status: 'success' } },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d %H:00',
                            date: '$createdAt',
                        },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            analytics: {
                totalWallets: campaign.progress.totalWallets,
                processedWallets: campaign.progress.processedWallets,
                successfulTx: successfulTx.length,
                failedTx: failedTx.length,
                successRate: campaign.progress.processedWallets > 0
                    ? (successfulTx.length / campaign.progress.processedWallets) * 100
                    : 0,
                totalGasSpent: totalGasSpent.toString(),
                totalGasSpentFormatted: ethers.formatEther(totalGasSpent),
                costPerHolder,
                costPerHolderFormatted: ethers.formatEther(BigInt(Math.floor(costPerHolder))),
                progressOverTime,
                ...campaign.metrics,
            },
        });
    } catch (error) {
        console.error('Get campaign analytics error:', error);
        res.status(500).json({ error: 'Failed to get campaign analytics' });
    }
};

/**
 * Get overview analytics
 */
const getOverviewAnalytics = async (req, res) => {
    try {
        // Total campaigns
        const totalCampaigns = await Campaign.countDocuments();
        const activeCampaigns = await Campaign.countDocuments({ status: 'running' });
        const completedCampaigns = await Campaign.countDocuments({ status: 'completed' });

        // Total transactions
        const totalTransactions = await Transaction.countDocuments();
        const successfulTransactions = await Transaction.countDocuments({ status: 'success' });
        const failedTransactions = await Transaction.countDocuments({ status: 'failed' });

        // Calculate total holders added
        const campaigns = await Campaign.find({ status: 'completed' });
        const totalHoldersAdded = campaigns.reduce((sum, c) => sum + (c.metrics.netNewHolders || 0), 0);

        // Recent activity (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentActivity = await Transaction.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    status: 'success',
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$createdAt',
                        },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            overview: {
                totalCampaigns,
                activeCampaigns,
                completedCampaigns,
                totalTransactions,
                successfulTransactions,
                failedTransactions,
                successRate: totalTransactions > 0
                    ? (successfulTransactions / totalTransactions) * 100
                    : 0,
                totalHoldersAdded,
                recentActivity,
            },
        });
    } catch (error) {
        console.error('Get overview analytics error:', error);
        res.status(500).json({ error: 'Failed to get overview analytics' });
    }
};

module.exports = {
    getCampaignAnalytics,
    getOverviewAnalytics,
};
