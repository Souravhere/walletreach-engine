const cron = require('node-cron');
const Campaign = require('../models/Campaign');
const campaignEngine = require('./campaignEngine');
const logger = require('../utils/logger');

/**
 * Scheduler Service
 * Handles automated campaign execution based on scheduled times
 */
class SchedulerService {
    constructor() {
        this.task = null;
    }

    /**
     * Initialize and start the scheduler
     */
    start() {
        logger.info('Scheduler service started');

        // Run every minute
        this.task = cron.schedule('* * * * *', async () => {
            await this.checkScheduledCampaigns();
        });
    }

    /**
     * Stop the scheduler
     */
    stop() {
        if (this.task) {
            this.task.stop();
            logger.info('Scheduler service stopped');
        }
    }

    /**
     * Check for campaigns ready to start
     */
    async checkScheduledCampaigns() {
        try {
            const now = new Date();

            // Find campaigns scheduled for now or in the past that aren't running yet
            const scheduledCampaigns = await Campaign.find({
                status: 'scheduled',
                scheduledFor: { $lte: now }
            });

            if (scheduledCampaigns.length > 0) {
                logger.info(`Found ${scheduledCampaigns.length} scheduled campaigns ready to start`);

                for (const campaign of scheduledCampaigns) {
                    await this.startScheduledCampaign(campaign);
                }
            }
        } catch (error) {
            logger.error('Error checking scheduled campaigns:', error);
        }
    }

    /**
     * Start a single scheduled campaign
     */
    async startScheduledCampaign(campaign) {
        try {
            logger.info(`Starting scheduled campaign: ${campaign.name} (${campaign._id})`);

            await campaignEngine.startCampaign(campaign._id);

            logger.info(`Successfully started scheduled campaign ${campaign._id}`);
        } catch (error) {
            logger.error(`Failed to start scheduled campaign ${campaign._id}:`, error);

            // Mark as failed if start fails
            campaign.status = 'failed';
            await campaign.save();

            // Create alert
            try {
                await campaignEngine.createAlert(
                    'critical',
                    'Scheduled Start Failed',
                    `Failed to auto-start campaign: ${error.message}`,
                    campaign._id
                );
            } catch (alertError) {
                // Ignore alert error
            }
        }
    }
}

module.exports = new SchedulerService();
