const { ethers } = require('ethers');
const Campaign = require('../models/Campaign');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Alert = require('../models/Alert');
const { getProvider, createNewProvider, ERC20_ABI } = require('../config/blockchain');
const { decryptPrivateKey } = require('../utils/encryption');
const { calculateReward } = require('./rewardCalculator');
const { getEligibleWallets } = require('./walletSelector');
const filterCampaignDuplicatesOnly = require('./filterCampaignDuplicatesOnly');
const nonceManager = require('./nonceManager');
const logger = require('../utils/logger');
// telegramBot will be lazy-loaded to prevent circular dependency

/**
 * Campaign Execution Engine
 * Handles running campaigns with multi-wallet support
 */
class CampaignEngine {
    constructor() {
        this.runningCampaigns = new Map(); // campaignId -> execution state
        this.walletQueues = new Map(); // walletId -> queue
        this.walletNonces = new Map(); // walletId -> current nonce
        this.emergencyStop = false;
    }

    /**
     * Start a campaign
     */
    async startCampaign(campaignId) {
        try {
            const campaign = await Campaign.findById(campaignId)
                .populate('senderWallets');

            if (!campaign) {
                throw new Error('Campaign not found');
            }

            if (campaign.status === 'running') {
                throw new Error('Campaign is already running');
            }

            let recipients = [];

            // Check if using uploaded CSV wallets
            if (campaign.walletSource === 'csv_upload' && campaign.uploadedWallets && campaign.uploadedWallets.length > 0) {
                logger.info(`Using ${campaign.uploadedWallets.length} uploaded CSV wallets for campaign ${campaignId}`);

                // Use uploaded wallets directly, apply minimal filtering
                recipients = campaign.uploadedWallets.slice(0, campaign.targetHolders);

                // Only filter for duplicates (wallets already processed in this campaign)
                recipients = await filterCampaignDuplicatesOnly(recipients, campaignId);

                if (recipients.length === 0) {
                    throw new Error('All uploaded wallets have already been processed');
                }
            } else {
                // Get eligible wallets using existing filters
                logger.info(`Getting eligible wallets for campaign ${campaignId}`);
                const eligibleWallets = await getEligibleWallets(
                    campaign,
                    campaign.tokenAddress,
                    campaign.targetHolders
                );

                if (eligibleWallets.length === 0) {
                    throw new Error('No eligible wallets found');
                }

                // Limit to target holders
                recipients = eligibleWallets.slice(0, campaign.targetHolders);
            }

            // Update campaign
            campaign.status = 'running';
            campaign.progress.totalWallets = recipients.length;
            campaign.progress.startedAt = new Date();
            await campaign.save();

            // Create campaign state
            this.runningCampaigns.set(campaignId, {
                campaign,
                recipients,
                currentIndex: 0,
                isRunning: true,
                isPaused: false,
            });

            // Start processing
            this.processCampaign(campaignId);

            logger.info(`Campaign ${campaignId} started with ${recipients.length} recipients`);

            // Notify via Telegram (Disabled per user request)
            // try {
            //     const telegramBot = require('./telegramBot');
            //     telegramBot.notifyCampaignStarted(campaign).catch(err =>
            //         logger.error('Telegram notification error:', err)
            //     );
            // } catch (err) {
            //     logger.warn('Telegram bot not available for start notification');
            // }

            return { success: true, totalRecipients: recipients.length };
        } catch (error) {
            logger.error('Failed to start campaign', { campaignId, error: error.message });
            throw error;
        }
    }

    /**
     * Process campaign (main execution loop)
     */
    async processCampaign(campaignId) {
        const state = this.runningCampaigns.get(campaignId);

        if (!state || !state.isRunning) {
            return;
        }

        const { campaign, recipients } = state;

        // ROUTING: Use dedicated processor for Drip Mode
        if (campaign.mode === 'human_drip') {
            return this.processDripCampaign(campaignId);
        }

        // STANDARD MODE: Parallel execution
        // Distribute recipients across sender wallets
        const walletsCount = campaign.senderWallets.length;
        const recipientsPerWallet = Math.ceil(recipients.length / walletsCount);

        // Process each wallet in parallel
        const walletPromises = campaign.senderWallets.map(async (walletDoc, index) => {
            const start = index * recipientsPerWallet;
            const end = Math.min(start + recipientsPerWallet, recipients.length);
            const walletRecipients = recipients.slice(start, end);

            return this.processWallet(campaign, walletDoc, walletRecipients);
        });

        try {
            const results = await Promise.all(walletPromises);

            // Check if any wallet processed transactions
            const anyProcessed = results.some(r => r && r.processed > 0);

            if (!anyProcessed && campaign.progress.successfulTx === 0) {
                throw new Error('No transactions could be processed. Check wallet limits and balances.');
            }

            // Campaign completed
            await this.completeCampaign(campaignId);
        } catch (error) {
            logger.error('Campaign processing error', { campaignId, error: error.message });
            await this.failCampaign(campaignId, error.message);
        }
    }

    /**
     * Process Drip / Human Mode Campaign
     * Executes transactions SEQUENTIALLY to ensure true "slow" speed.
     * Picks a random wallet for each transaction.
     */
    async processDripCampaign(campaignId) {
        const state = this.runningCampaigns.get(campaignId);
        if (!state || !state.isRunning) return;

        const { campaign, recipients } = state;
        let processedCount = 0;

        try {
            logger.info(`Starting Drip Campaign ${campaignId} - Sequential Mode`);

            // Initialize providers/signers pool logic could go here, 
            // but for simplicity we'll setup per transaction or reuse if optimized later.

            for (let i = 0; i < recipients.length; i++) {
                const recipientAddress = recipients[i];

                // Check state on every iteration
                const currentState = this.runningCampaigns.get(campaignId);
                if (!currentState || !currentState.isRunning || currentState.isPaused || this.emergencyStop) {
                    logger.info(`Drip Campaign ${campaignId} paused or stopped`);
                    // Update index to resume later
                    state.currentIndex = i;
                    return;
                }

                // 1. Pick a random sender wallet
                const randomWalletIndex = Math.floor(Math.random() * campaign.senderWallets.length);
                const walletDoc = campaign.senderWallets[randomWalletIndex];

                // 2. Check if wallet can send
                const canSend = walletDoc.canSendTransaction(0);
                if (!canSend.canSend) {
                    logger.warn(`Wallet ${walletDoc.address} skipped in drip: ${canSend.reason}`);
                    // Try to find another wallet? For now just skip this turn or retry?
                    // Let's just skip to keep it simple, or retry loop could be added.
                    continue;
                }

                try {
                    // 3. Setup signer and contract
                    const privateKey = decryptPrivateKey(walletDoc.encryptedPrivateKey);
                    const provider = getProvider();
                    const signer = new ethers.Wallet(privateKey, provider);
                    const tokenContract = new ethers.Contract(campaign.tokenAddress, ERC20_ABI, signer);

                    // 4. Calculate Amount
                    const amount = calculateReward(campaign.rewardConfig, recipientAddress);

                    // 5. Get Nonce
                    const nonce = await nonceManager.getNextNonce(walletDoc.address);

                    // 6. Send Transaction
                    await this.sendTransaction(
                        campaign,
                        walletDoc,
                        tokenContract,
                        recipientAddress,
                        amount,
                        nonce
                    );

                    nonceManager.confirmNonce(walletDoc.address, nonce);
                    processedCount++;

                } catch (error) {
                    logger.error(`Drip transaction failed for ${recipientAddress}:`, error.message);
                    await nonceManager.resetNonce(walletDoc.address);
                    // Don't throw entire campaign, just log and continue to next recipient
                }

                // 7. DELAY: Wait randomly (Min/Max intervals)
                // Only wait if it's not the last transaction
                if (i < recipients.length - 1) {
                    const minMs = (campaign.dripConfig?.minInterval || 2) * 60 * 1000;
                    const maxMs = (campaign.dripConfig?.maxInterval || 5) * 60 * 1000;
                    // Random delay
                    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

                    logger.info(`Drip Mode: Sleeping for ${(delay / 1000 / 60).toFixed(2)} mins before next tx`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // Completed
            await this.completeCampaign(campaignId);

        } catch (error) {
            logger.error('Drip campaign processing error', { campaignId, error: error.message });
            await this.failCampaign(campaignId, error.message);
        }
    }

    /**
     * Process transactions for a single wallet (Standard Mode Helper)
     */
    async processWallet(campaign, walletDoc, recipients) {
        const walletId = walletDoc._id.toString();
        let processedCount = 0;
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 5; // Pause wallet after 5 consecutive failures

        try {
            // Check if wallet can send
            const canSend = walletDoc.canSendTransaction(0);
            if (!canSend.canSend) {
                logger.warn(`Wallet ${walletId} cannot send: ${canSend.reason}`);
                await this.createAlert('warning', 'Wallet Cannot Send', canSend.reason, campaign._id, walletDoc._id);
                return { processed: 0, failed: 0, skipped: recipients.length };
            }

            // Get decrypted private key
            let privateKey = decryptPrivateKey(walletDoc.encryptedPrivateKey);
            let provider = getProvider();
            let signer = new ethers.Wallet(privateKey, provider);

            // Get token contract
            let tokenContract = new ethers.Contract(campaign.tokenAddress, ERC20_ABI, signer);

            let failedCount = 0;

            // Process each recipient sequentially
            for (const recipientAddress of recipients) {
                // Check for pause or emergency stop
                const state = this.runningCampaigns.get(campaign._id.toString());
                if (!state || !state.isRunning || state.isPaused || this.emergencyStop) {
                    logger.info(`Campaign ${campaign._id} paused or stopped`);
                    break;
                }

                // If too many consecutive failures, try refreshing the provider connection
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    logger.warn(`Wallet ${walletId}: ${MAX_CONSECUTIVE_FAILURES} consecutive failures, refreshing provider...`);
                    await this.createAlert('warning', 'Wallet Reconnecting', 
                        `${MAX_CONSECUTIVE_FAILURES} consecutive failures detected. Refreshing provider connection.`,
                        campaign._id, walletDoc._id);

                    try {
                        provider = createNewProvider();
                        signer = new ethers.Wallet(privateKey, provider);
                        tokenContract = new ethers.Contract(campaign.tokenAddress, ERC20_ABI, signer);
                        consecutiveFailures = 0; // Reset counter after refresh
                        logger.info(`Wallet ${walletId}: Provider refreshed successfully`);
                    } catch (refreshError) {
                        logger.error(`Wallet ${walletId}: Failed to refresh provider, stopping this wallet`, refreshError.message);
                        break; // Only stop THIS wallet, not the whole campaign
                    }
                }

                // Calculate reward amount
                const amount = calculateReward(campaign.rewardConfig, recipientAddress);

                // USE NONCE MANAGER: Get next available nonce (prevents conflicts)
                const nonce = await nonceManager.getNextNonce(walletDoc.address);

                try {
                    // Send transaction
                    await this.sendTransaction(
                        campaign,
                        walletDoc,
                        tokenContract,
                        recipientAddress,
                        amount,
                        nonce
                    );

                    // Mark nonce as confirmed
                    nonceManager.confirmNonce(walletDoc.address, nonce);
                    processedCount++;
                    consecutiveFailures = 0; // Reset on success
                } catch (error) {
                    logger.error(`Transaction failed for ${recipientAddress} (nonce ${nonce}):`, error.message);
                    // Reset nonce on error
                    await nonceManager.resetNonce(walletDoc.address);
                    failedCount++;
                    consecutiveFailures++;

                    // Check auto-pause conditions (high failure rate)
                    await this.checkAutoPause(campaign._id.toString());

                    // Don't throw — continue to next recipient
                    // The failed tx is already recorded inside sendTransaction
                    continue;
                }

                // Standard Mode: Use transferDelay (fast)
                const delay = (campaign.transferDelay || 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            if (failedCount > 0) {
                logger.warn(`Wallet ${walletId} completed with ${failedCount} failed transactions out of ${processedCount + failedCount} attempts`);
            }

            return { processed: processedCount, failed: failedCount };
        } catch (error) {
            logger.error(`Wallet ${walletId} processing error`, { error: error.message });
            walletDoc.recordTransaction(0, false);
            await walletDoc.save();

            await this.createAlert('critical', 'Wallet Processing Failed', error.message, campaign._id, walletDoc._id);
            return { processed: processedCount };
        }
    }

    /**
     * Send a single transaction
     */
    async sendTransaction(campaign, walletDoc, tokenContract, recipientAddress, amount, nonce) {
        const maxRetries = 2;
        let retryCount = 0;

        // Create transaction record
        const txRecord = await Transaction.create({
            campaign: campaign._id,
            senderWallet: walletDoc._id,
            recipientAddress: recipientAddress.toLowerCase(),
            amount: amount.toString(),
            status: 'pending',
            nonce,
        });

        while (retryCount <= maxRetries) {
            try {
                // Send transaction
                const tx = await tokenContract.transfer(recipientAddress, amount, { nonce });

                // Update transaction record with hash
                txRecord.txHash = tx.hash;
                await txRecord.save();

                logger.info(`Transaction sent: ${tx.hash}`);

                // Wait for confirmation
                const receipt = await tx.wait();

                // ===== TRANSACTION CONFIRMED - Everything below is non-critical =====
                // If anything fails below, the TX was still successful.

                // Update transaction record
                try {
                    txRecord.status = 'success';
                    txRecord.gasUsed = receipt.gasUsed.toString();
                    txRecord.gasPrice = receipt.gasPrice ? receipt.gasPrice.toString() : '0';
                    await txRecord.save();
                } catch (saveErr) {
                    logger.error(`Failed to save tx record for ${tx.hash}:`, saveErr.message);
                }

                // Update wallet usage
                try {
                    walletDoc.recordTransaction(Number(amount), true);
                    await walletDoc.save();
                } catch (walletErr) {
                    logger.error(`Failed to update wallet usage:`, walletErr.message);
                }

                // Update campaign progress
                try {
                    campaign.progress.successfulTx += 1;
                    campaign.progress.processedWallets += 1;
                    campaign.metrics.totalTokensDistributed = (
                        BigInt(campaign.metrics.totalTokensDistributed) + BigInt(amount)
                    ).toString();
                    campaign.metrics.totalGasSpent = (
                        BigInt(campaign.metrics.totalGasSpent) +
                        (BigInt(receipt.gasUsed) * (receipt.gasPrice || 0n))
                    ).toString();
                    await campaign.save();
                } catch (progressErr) {
                    logger.error(`Failed to update campaign progress:`, progressErr.message);
                }

                logger.info(`Transaction confirmed: ${tx.hash}`);

                // Check for progress milestones (25%, 50%, 75%) — fully isolated
                try {
                    const total = campaign.progress.totalWallets;
                    if (total > 0) {
                        const processed = campaign.progress.processedWallets;
                        const percent = Math.round((processed / total) * 100);
                        const prevPercent = Math.round(((processed - 1) / total) * 100);

                        const milestones = [25, 50, 75];

                        for (const milestone of milestones) {
                            if (prevPercent < milestone && percent >= milestone) {
                                // Lazy-load telegramBot to prevent circular dependency
                                // try {
                                //     const telegramBot = require('./telegramBot');
                                //     telegramBot.notifyCampaignProgress(campaign, milestone).catch(err =>
                                //         logger.error('Telegram progress notification error:', err.message)
                                //     );
                                // } catch (tgErr) {
                                //     logger.warn('Telegram bot not available for progress notification');
                                // }
                                break;
                            }
                        }
                    }
                } catch (milestoneErr) {
                    // Milestone notification failure should NEVER affect the campaign
                    logger.error('Milestone check error (non-critical):', milestoneErr.message);
                }

                // Transaction successful — return
                return;

            } catch (error) {
                retryCount++;
                logger.error(`Transaction failed (attempt ${retryCount}/${maxRetries + 1})`, {
                    error: error.message,
                    recipient: recipientAddress,
                });

                if (retryCount > maxRetries) {
                    // Max retries exceeded — record failure but DON'T crash the campaign
                    try {
                        txRecord.status = 'failed';
                        txRecord.error = error.message;
                        txRecord.retryCount = retryCount;
                        await txRecord.save();
                    } catch (saveErr) {
                        logger.error('Failed to save failed tx record:', saveErr.message);
                    }

                    // Update wallet and campaign failure counters
                    try {
                        walletDoc.recordTransaction(Number(amount), false);
                        await walletDoc.save();
                    } catch (walletErr) {
                        logger.error('Failed to update wallet failure:', walletErr.message);
                    }

                    try {
                        campaign.progress.failedTx += 1;
                        campaign.progress.processedWallets += 1;
                        await campaign.save();
                    } catch (progressErr) {
                        logger.error('Failed to update campaign failure stats:', progressErr.message);
                    }

                    // Check if we should auto-pause (not auto-STOP)
                    try {
                        await this.checkAutoPause(campaign._id);
                    } catch (pauseErr) {
                        logger.error('Auto-pause check error:', pauseErr.message);
                    }

                    throw error;
                }

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    /**
     * Check auto-pause conditions
     */
    async checkAutoPause(campaignId) {
        const campaign = await Campaign.findById(campaignId);

        if (!campaign) return;

        // Calculate failure rate
        const total = campaign.progress.successfulTx + campaign.progress.failedTx;
        if (total === 0) return;

        const failureRate = campaign.progress.failedTx / total;

        // Auto-pause if failure rate > 50%
        if (failureRate > 0.5 && total >= 10) {
            await this.pauseCampaign(campaignId);
            await this.createAlert(
                'critical',
                'Campaign Auto-Paused',
                `High failure rate: ${(failureRate * 100).toFixed(1)}%`,
                campaign._id
            );
        }
    }

    /**
     * Pause campaign
     */
    async pauseCampaign(campaignId) {
        const state = this.runningCampaigns.get(campaignId);
        if (state) {
            state.isPaused = true;
        }

        const campaign = await Campaign.findById(campaignId);
        if (campaign) {
            campaign.status = 'paused';
            await campaign.save();
        }

        logger.info(`Campaign ${campaignId} paused`);
    }

    /**
     * Resume campaign
     */
    async resumeCampaign(campaignId) {
        const state = this.runningCampaigns.get(campaignId);
        if (state) {
            state.isPaused = false;
            this.processCampaign(campaignId);
        }

        const campaign = await Campaign.findById(campaignId);
        if (campaign) {
            campaign.status = 'running';
            await campaign.save();
        }

        logger.info(`Campaign ${campaignId} resumed`);
    }

    /**
     * Stop campaign
     */
    async stopCampaign(campaignId) {
        const state = this.runningCampaigns.get(campaignId);
        if (state) {
            state.isRunning = false;
        }

        this.runningCampaigns.delete(campaignId);

        const campaign = await Campaign.findById(campaignId);
        if (campaign) {
            campaign.status = 'stopped';
            await campaign.save();
        }

        logger.info(`Campaign ${campaignId} stopped`);
    }

    /**
     * Complete campaign
     */
    async completeCampaign(campaignId) {
        this.runningCampaigns.delete(campaignId);

        const campaign = await Campaign.findById(campaignId);
        if (campaign) {
            campaign.status = 'completed';
            campaign.progress.completedAt = new Date();

            // Calculate timing metrics
            if (campaign.progress.startedAt && campaign.progress.completedAt) {
                const totalDurationMs = campaign.progress.completedAt - campaign.progress.startedAt;
                const totalDurationSec = totalDurationMs / 1000;

                // Calculate average time per transaction
                if (campaign.progress.successfulTx > 0) {
                    campaign.progress.averageTxTime = totalDurationSec / campaign.progress.successfulTx;
                }
            }

            // Calculate metrics
            campaign.metrics.netNewHolders = campaign.progress.successfulTx;

            // Calculate success rate
            const totalTx = campaign.progress.successfulTx + campaign.progress.failedTx;
            if (totalTx > 0) {
                campaign.metrics.successRate = (campaign.progress.successfulTx / totalTx) * 100;
            }

            await campaign.save();

            // Notify via Telegram (Disabled per user request)
            // try {
            //     const telegramBot = require('./telegramBot');
            //     telegramBot.notifyCampaignCompleted(campaign).catch(err =>
            //         logger.error('Telegram notification error:', err)
            //     );
            // } catch (err) {
            //     // Ignore
            // }

            await this.createAlert(
                'info',
                'Campaign Completed',
                `Successfully distributed to ${campaign.progress.successfulTx} wallets`,
                campaign._id
            );
        }

        logger.info(`Campaign ${campaignId} completed`);
    }

    /**
     * Fail campaign
     */
    async failCampaign(campaignId, reason) {
        this.runningCampaigns.delete(campaignId);

        const campaign = await Campaign.findById(campaignId);
        if (campaign) {
            campaign.status = 'failed';
            await campaign.save();

            await this.createAlert('critical', 'Campaign Failed', reason, campaign._id);
        }

        logger.error(`Campaign ${campaignId} failed: ${reason}`);
    }

    /**
     * Create alert
     */
    async createAlert(type, title, message, campaignId, walletId = null) {
        await Alert.create({
            type,
            title,
            message,
            campaign: campaignId,
            wallet: walletId,
        });
    }

    /**
     * Emergency stop all campaigns
     */
    async emergencyStopAll() {
        this.emergencyStop = true;

        for (const campaignId of this.runningCampaigns.keys()) {
            await this.stopCampaign(campaignId);
        }

        logger.warn('EMERGENCY STOP ACTIVATED - All campaigns stopped');
    }
}

module.exports = new CampaignEngine();
