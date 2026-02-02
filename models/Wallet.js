const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    address: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
    },
    encryptedPrivateKey: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['active', 'paused', 'disabled'],
        default: 'active',
    },
    // Per-wallet limits
    limits: {
        maxTxPerDay: {
            type: Number,
            default: 500,
        },
        maxAmountPerDay: {
            type: Number,
            default: 1000000, // In token base units
        },
        maxPendingTx: {
            type: Number,
            default: 3,
        },
    },
    // Usage tracking
    usage: {
        txToday: {
            type: Number,
            default: 0,
        },
        amountToday: {
            type: Number,
            default: 0,
        },
        lastResetDate: {
            type: Date,
            default: Date.now,
        },
    },
    // Failure tracking
    failures: {
        count: {
            type: Number,
            default: 0,
        },
        lastFailure: {
            type: Date,
        },
        consecutiveFailures: {
            type: Number,
            default: 0,
        },
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {
    timestamps: true,
});

// Reset daily usage if needed
walletSchema.methods.checkAndResetDailyUsage = function () {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastReset = new Date(this.usage.lastResetDate);
    lastReset.setHours(0, 0, 0, 0);

    if (today > lastReset) {
        this.usage.txToday = 0;
        this.usage.amountToday = 0;
        this.usage.lastResetDate = new Date();
    }
};

// Check if wallet can send transaction
walletSchema.methods.canSendTransaction = function (amount) {
    this.checkAndResetDailyUsage();

    if (this.status !== 'active') {
        return { canSend: false, reason: 'Wallet is not active' };
    }

    // WALLET LIMITS DISABLED - Always allow transactions
    // Original limits kept in schema but not enforced
    // if (this.usage.txToday >= this.limits.maxTxPerDay) {
    //     return { canSend: false, reason: 'Daily transaction limit reached' };
    // }

    // if (this.usage.amountToday + amount > this.limits.maxAmountPerDay) {
    //     return { canSend: false, reason: 'Daily amount limit reached' };
    // }

    return { canSend: true };
};

// Record transaction
walletSchema.methods.recordTransaction = function (amount, success = true) {
    this.checkAndResetDailyUsage();

    if (success) {
        this.usage.txToday += 1;
        this.usage.amountToday += amount;
        this.failures.consecutiveFailures = 0;
    } else {
        this.failures.count += 1;
        this.failures.consecutiveFailures += 1;
        this.failures.lastFailure = new Date();

        // Auto-disable after 10 consecutive failures
        if (this.failures.consecutiveFailures >= 10) {
            this.status = 'disabled';
        }
    }
};

// Don't expose private key in JSON
walletSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.encryptedPrivateKey;
    return obj;
};

module.exports = mongoose.model('Wallet', walletSchema);
