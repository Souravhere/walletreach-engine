const { ethers } = require('ethers');
const Campaign = require('../models/Campaign');
const Wallet = require('../models/Wallet');
const AuditLog = require('../models/AuditLog');
const { getProvider, ERC20_ABI } = require('../config/blockchain');
const { validateRewardConfig } = require('../services/rewardCalculator');
const { estimateEligibleWallets } = require('../services/walletSelector');
const campaignEngine = require('../services/campaignEngine');

/**
 * Create campaign
 */
const createCampaign = async (req, res) => {
    try {
        const {
            name,
            tokenAddress,
            senderWallets,
            targetHolders,
            timeRange,
            filters,
            rewardConfig,
        } = req.body;

        // Validation
        if (!name || !tokenAddress || !senderWallets || !targetHolders || !timeRange || !rewardConfig) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate token address
        if (!ethers.isAddress(tokenAddress)) {
            return res.status(400).json({ error: 'Invalid token address' });
        }

        // Validate sender wallets exist
        const wallets = await Wallet.find({ _id: { $in: senderWallets } });
        if (wallets.length !== senderWallets.length) {
            return res.status(400).json({ error: 'One or more sender wallets not found' });
        }

        // Validate reward config
        const rewardValidation = validateRewardConfig(rewardConfig);
        if (!rewardValidation.valid) {
            return res.status(400).json({ error: rewardValidation.error });
        }

        // Get token info
        let tokenInfo = {};
        try {
            const provider = getProvider();
            const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

            const [symbol, name, decimals] = await Promise.all([
                tokenContract.symbol(),
                tokenContract.name(),
                tokenContract.decimals(),
            ]);

            tokenInfo = { symbol, name, decimals: Number(decimals) };
        } catch (error) {
            console.error('Error fetching token info:', error);
        }

        // Create campaign
        const campaign = await Campaign.create({
            name,
            tokenAddress: tokenAddress.toLowerCase(),
            tokenInfo,
            senderWallets,
            targetHolders,
            timeRange,
            filters: filters || {},
            rewardConfig,
            status: 'draft',
            createdBy: req.user._id,
        });

        // Create audit log
        await AuditLog.create({
            user: req.user._id,
            action: 'campaign_created',
            resourceType: 'campaign',
            resource: campaign._id.toString(),
            details: { name, tokenAddress, targetHolders },
            ipAddress: req.ip,
        });

        res.status(201).json({ campaign });
    } catch (error) {
        console.error('Create campaign error:', error);
        res.status(500).json({ error: 'Failed to create campaign' });
    }
};

/**
 * Get all campaigns
 */
const getCampaigns = async (req, res) => {
    try {
        const { status } = req.query;

        const filter = {};
        if (status) {
            filter.status = status;
        }

        const campaigns = await Campaign.find(filter)
            .populate('senderWallets', 'name address status')
            .populate('createdBy', 'username')
            .sort({ createdAt: -1 });

        res.json({ campaigns });
    } catch (error) {
        console.error('Get campaigns error:', error);
        res.status(500).json({ error: 'Failed to get campaigns' });
    }
};

/**
 * Get campaign by ID
 */
const getCampaignById = async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id)
            .populate('senderWallets', 'name address status')
            .populate('createdBy', 'username');

        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        res.json({ campaign });
    } catch (error) {
        console.error('Get campaign error:', error);
        res.status(500).json({ error: 'Failed to get campaign' });
    }
};

/**
 * Simulate campaign (dry run)
 */
const simulateCampaign = async (req, res) => {
    try {
        const { tokenAddress, senderWallets, targetHolders, filters, rewardConfig } = req.body;

        // Create temporary campaign object for simulation
        const tempCampaign = {
            tokenAddress: tokenAddress.toLowerCase(),
            targetHolders,
            filters: filters || {},
            rewardConfig,
        };

        // Estimate eligible wallets
        const estimatedWallets = await estimateEligibleWallets(tempCampaign, tokenAddress);

        // Estimate gas (rough calculation)
        const avgGasPerTx = 65000; // Average gas for ERC20 transfer
        const gasPrice = ethers.parseUnits('3', 'gwei'); // Assume 3 Gwei
        const estimatedGas = BigInt(estimatedWallets) * BigInt(avgGasPerTx) * gasPrice;

        // Estimate total tokens
        let estimatedTokens = 0n;
        if (rewardConfig.mode === 'random_range') {
            const avg = (BigInt(rewardConfig.randomRange.min) + BigInt(rewardConfig.randomRange.max)) / 2n;
            estimatedTokens = avg * BigInt(estimatedWallets);
        } else if (rewardConfig.mode === 'random_list') {
            const sum = rewardConfig.fixedList.reduce((a, b) => a + BigInt(b), 0n);
            const avg = sum / BigInt(rewardConfig.fixedList.length);
            estimatedTokens = avg * BigInt(estimatedWallets);
        }

        // Estimate duration (30-45 seconds per tx, distributed across wallets)
        const avgTimePerTx = 37.5; // seconds
        const totalWallets = senderWallets.length || 1;
        const estimatedDuration = (estimatedWallets * avgTimePerTx) / totalWallets / 60; // minutes

        res.json({
            simulation: {
                estimatedWallets,
                estimatedGas: estimatedGas.toString(),
                estimatedGasFormatted: ethers.formatEther(estimatedGas),
                estimatedTokens: estimatedTokens.toString(),
                estimatedDuration: Math.ceil(estimatedDuration),
            },
        });
    } catch (error) {
        console.error('Simulate campaign error:', error);
        res.status(500).json({ error: 'Failed to simulate campaign' });
    }
};

/**
 * Start campaign
 */
const startCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        if (campaign.status === 'running') {
            return res.status(400).json({ error: 'Campaign is already running' });
        }

        // Start campaign via engine
        const result = await campaignEngine.startCampaign(req.params.id);

        // Create audit log
        await AuditLog.create({
            user: req.user._id,
            action: 'campaign_started',
            resourceType: 'campaign',
            resource: campaign._id.toString(),
            ipAddress: req.ip,
        });

        res.json({ message: 'Campaign started', result });
    } catch (error) {
        console.error('Start campaign error:', error);
        res.status(500).json({ error: error.message || 'Failed to start campaign' });
    }
};

/**
 * Pause campaign
 */
const pauseCampaign = async (req, res) => {
    try {
        await campaignEngine.pauseCampaign(req.params.id);

        await AuditLog.create({
            user: req.user._id,
            action: 'campaign_paused',
            resourceType: 'campaign',
            resource: req.params.id,
            ipAddress: req.ip,
        });

        res.json({ message: 'Campaign paused' });
    } catch (error) {
        console.error('Pause campaign error:', error);
        res.status(500).json({ error: 'Failed to pause campaign' });
    }
};

/**
 * Resume campaign
 */
const resumeCampaign = async (req, res) => {
    try {
        await campaignEngine.resumeCampaign(req.params.id);

        await AuditLog.create({
            user: req.user._id,
            action: 'campaign_resumed',
            resourceType: 'campaign',
            resource: req.params.id,
            ipAddress: req.ip,
        });

        res.json({ message: 'Campaign resumed' });
    } catch (error) {
        console.error('Resume campaign error:', error);
        res.status(500).json({ error: 'Failed to resume campaign' });
    }
};

/**
 * Stop campaign
 */
const stopCampaign = async (req, res) => {
    try {
        await campaignEngine.stopCampaign(req.params.id);

        await AuditLog.create({
            user: req.user._id,
            action: 'campaign_stopped',
            resourceType: 'campaign',
            resource: req.params.id,
            ipAddress: req.ip,
        });

        res.json({ message: 'Campaign stopped' });
    } catch (error) {
        console.error('Stop campaign error:', error);
        res.status(500).json({ error: 'Failed to stop campaign' });
    }
};

/**
 * Delete campaign
 */
const deleteCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        if (campaign.status === 'running') {
            return res.status(400).json({ error: 'Cannot delete running campaign. Stop it first.' });
        }

        await Campaign.findByIdAndDelete(req.params.id);

        await AuditLog.create({
            user: req.user._id,
            action: 'campaign_deleted',
            resourceType: 'campaign',
            resource: req.params.id,
            details: { name: campaign.name },
            ipAddress: req.ip,
        });

        res.json({ message: 'Campaign deleted successfully' });
    } catch (error) {
        console.error('Delete campaign error:', error);
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
};

/**
 * Upload wallet CSV
 */
const uploadWalletCSV = async (req, res) => {
    try {
        const { csvData } = req.body;

        if (!csvData || typeof csvData !== 'string') {
            return res.status(400).json({ error: 'CSV data is required' });
        }

        // Parse CSV/TSV - support comma, tab, or newline separated
        // Handle multi-column format like: WALLET_ADDRESS\tTRANSFER_COUNT\tLAST_ACTIVITY\tACTIVE_DAYS
        const lines = csvData.split('\n').map(line => line.trim()).filter(line => line);

        const validAddresses = [];
        const invalidAddresses = [];
        let headerSkipped = false;

        // Process each line
        for (const line of lines) {
            // Split by tab or comma (TSV or CSV)
            const columns = line.split(/[\t,]/).map(col => col.trim()).filter(col => col);

            if (columns.length === 0) continue;

            // Skip header row if it contains text like "WALLET" or "ADDRESS"
            if (!headerSkipped && columns[0].toUpperCase().includes('WALLET') || columns[0].toUpperCase().includes('ADDRESS')) {
                headerSkipped = true;
                continue;
            }

            // SMART EXTRACTION: Try to find wallet address in any column
            let foundAddress = null;

            // First, try the first column (most common case)
            if (ethers.isAddress(columns[0])) {
                foundAddress = columns[0];
            } else {
                // Search other columns for a valid address
                for (const col of columns) {
                    if (ethers.isAddress(col)) {
                        foundAddress = col;
                        break;
                    }
                }
            }

            if (foundAddress) {
                validAddresses.push(foundAddress.toLowerCase());
            } else if (columns[0]) {
                // Only track as invalid if it's not a header
                invalidAddresses.push(columns[0]);
            }
        }

        // Remove duplicates
        const uniqueAddresses = [...new Set(validAddresses)];

        // Check maximum limit
        const MAX_ADDRESSES = 10000;
        if (uniqueAddresses.length > MAX_ADDRESSES) {
            return res.status(400).json({
                error: `Maximum ${MAX_ADDRESSES} addresses allowed. Found ${uniqueAddresses.length}`
            });
        }

        res.json({
            success: true,
            data: {
                validAddresses: uniqueAddresses,
                totalValid: uniqueAddresses.length,
                totalInvalid: invalidAddresses.length,
                invalidAddresses: invalidAddresses.slice(0, 10), // Return first 10 invalid
                duplicatesRemoved: validAddresses.length - uniqueAddresses.length,
            },
        });
    } catch (error) {
        console.error('Upload wallet CSV error:', error);
        res.status(500).json({ error: 'Failed to process CSV file' });
    }
};

/**
 * Restart campaign
 */
const restartCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        // Only allow restarting completed or stopped campaigns
        if (!['completed', 'stopped', 'failed'].includes(campaign.status)) {
            return res.status(400).json({ error: 'Can only restart completed, stopped, or failed campaigns' });
        }

        // Reset progress
        campaign.progress = {
            totalWallets: 0,
            processedWallets: 0,
            successfulTx: 0,
            failedTx: 0,
            startedAt: null,
            completedAt: null,
            lastTxAt: null,
            averageTxTime: 0,
        };

        // Update restart tracking
        campaign.restartCount = (campaign.restartCount || 0) + 1;
        campaign.lastRestartedAt = new Date();

        // Set status to draft
        campaign.status = 'draft';

        await campaign.save();

        // Create audit log
        await AuditLog.create({
            user: req.user._id,
            action: 'campaign_restarted',
            resourceType: 'campaign',
            resource: campaign._id.toString(),
            details: { restartCount: campaign.restartCount },
            ipAddress: req.ip,
        });

        res.json({
            message: 'Campaign restarted successfully',
            campaign,
            restartCount: campaign.restartCount
        });
    } catch (error) {
        console.error('Restart campaign error:', error);
        res.status(500).json({ error: 'Failed to restart campaign' });
    }
};


module.exports = {
    createCampaign,
    getCampaigns,
    getCampaignById,
    simulateCampaign,
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    stopCampaign,
    deleteCampaign,
    uploadWalletCSV,
    restartCampaign,
};

