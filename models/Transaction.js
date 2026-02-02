const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    campaign: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign',
        required: true,
    },
    senderWallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet',
        required: true,
    },
    recipientAddress: {
        type: String,
        required: true,
        lowercase: true,
    },
    amount: {
        type: String,
        required: true, // Stored as string to handle large numbers
    },
    txHash: {
        type: String,
        lowercase: true,
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'failed'],
        default: 'pending',
    },
    nonce: {
        type: Number,
    },
    gasUsed: {
        type: String, // In wei
    },
    gasPrice: {
        type: String, // In wei
    },
    error: {
        type: String,
    },
    retryCount: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});

// Index for faster queries
transactionSchema.index({ campaign: 1, status: 1 });
transactionSchema.index({ senderWallet: 1, createdAt: -1 });
transactionSchema.index({ txHash: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
