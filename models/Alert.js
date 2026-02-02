const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['critical', 'warning', 'info'],
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    campaign: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign',
    },
    wallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet',
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
    },
}, {
    timestamps: true,
});

// Index for faster queries
alertSchema.index({ isRead: 1, createdAt: -1 });
alertSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);
