const Transaction = require('../models/Transaction');

/**
 * Helper function to filter only campaign duplicates
 * Used for CSV uploaded wallets to skip heavy RPC filtering
 */
const filterCampaignDuplicatesOnly = async (wallets, campaignId) => {
    try {
        const processed = await Transaction.find({
            campaign: campaignId,
        }).distinct('recipientAddress');

        const filtered = wallets.filter(
            address => !processed.includes(address.toLowerCase())
        );

        return filtered;
    } catch (error) {
        console.error('Error filtering campaign duplicates:', error);
        return wallets;
    }
};

module.exports = filterCampaignDuplicatesOnly;
