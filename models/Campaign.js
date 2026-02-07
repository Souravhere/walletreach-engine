const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    blockchain: {
        type: String,
        default: 'BSC',
    },
    tokenAddress: {
        type: String,
        required: true,
        lowercase: true,
    },
    tokenInfo: {
        symbol: String,
        name: String,
        decimals: Number,
    },
    senderWallets: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet',
    }],
    targetHolders: {
        type: Number,
        required: true,
    },
    timeRange: {
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
    },
    // Wallet filters
    filters: {
        excludeContracts: {
            type: Boolean,
            default: true,
        },
        excludeExistingHolders: {
            type: Boolean,
            default: true,
        },
        minWalletAge: {
            type: Number,
            default: 0, // days
        },
        minBNBBalance: {
            type: Number,
            default: 0, // in wei
        },
        cooldownDays: {
            type: Number,
            default: 30,
        },
    },
    // Wallet source
    walletSource: {
        type: String,
        enum: ['generated', 'csv_upload'],
        default: 'generated',
    },
    uploadedWallets: [{
        type: String,
        lowercase: true,
        trim: true,
    }],
    // Reward configuration
    rewardConfig: {
        mode: {
            type: String,
            enum: ['random_range', 'discrete_list'],
            required: true,
        },
        randomRange: {
            min: {
                type: Number,
                min: 10, // Minimum 10 tokens (2 digits)
            },
            max: Number,
        },
        discreteAmounts: [{
            type: Number,
            min: 10, // Minimum 10 tokens per amount
        }],
    },
    transferDelay: {
        type: Number,
        default: 1, // seconds between transfers (ultra-fast: 1s)
        min: 0.5, // Allow as low as 0.5 second for maximum speed
        max: 120,
    },
    parallelInstances: {
        type: Number,
        default: 1, // number of parallel processing instances
        min: 1,
        max: 10, // limit to prevent overwhelming the system
    },
    status: {
        type: String,
        enum: ['draft', 'ready', 'running', 'paused', 'completed', 'stopped', 'failed', 'scheduled'],
        default: 'draft',
    },
    // Campaign Mode (Standard vs Human/Drip)
    mode: {
        type: String,
        enum: ['standard', 'human_drip'],
        default: 'standard',
    },
    dripConfig: {
        minInterval: {
            type: Number,
            default: 2, // Minutes
        },
        maxInterval: {
            type: Number,
            default: 5, // Minutes
        },
    },
    // Progress tracking
    progress: {
        totalWallets: {
            type: Number,
            default: 0,
        },
        processedWallets: {
            type: Number,
            default: 0,
        },
        successfulTx: {
            type: Number,
            default: 0,
        },
        failedTx: {
            type: Number,
            default: 0,
        },
        startedAt: Date,
        scheduledFor: Date,
        completedAt: Date,
        lastTxAt: Date, // Last transaction timestamp
        averageTxTime: { type: Number, default: 0 }, // Average time per transaction in seconds
    },
    // Restart tracking
    restartCount: {
        type: Number,
        default: 0,
    },
    lastRestartedAt: Date,
    originalCampaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign',
    },
    // Metrics
    metrics: {
        holdersBefore: Number,
        holdersAfter: Number,
        netNewHolders: Number,
        totalGasSpent: {
            type: String,
            default: '0', // In wei (stored as string to handle large numbers)
        },
        totalTokensDistributed: {
            type: String,
            default: '0',
        },
        costPerHolder: Number,
        successRate: {
            type: Number,
            default: 0,
        },
    },
    // Simulation data
    simulation: {
        estimatedWallets: Number,
        estimatedGas: String,
        estimatedTokens: String,
        estimatedDuration: Number, // minutes
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {
    timestamps: true,
});

// Calculate progress percentage
campaignSchema.methods.getProgressPercentage = function () {
    if (this.progress.totalWallets === 0) return 0;
    return (this.progress.processedWallets / this.progress.totalWallets) * 100;
};

// Check if campaign is active
campaignSchema.methods.isActive = function () {
    return this.status === 'running';
};

// Check if campaign time is valid
campaignSchema.methods.isInTimeRange = function () {
    const now = new Date();
    return now >= this.timeRange.startDate && now <= this.timeRange.endDate;
};

module.exports = mongoose.model('Campaign', campaignSchema);
