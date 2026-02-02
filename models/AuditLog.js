const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    action: {
        type: String,
        required: true,
        enum: [
            'user_created',
            'user_updated',
            'user_deleted',
            'user_login',
            'user_logout',
            'wallet_created',
            'wallet_updated',
            'wallet_deleted',
            'campaign_created',
            'campaign_started',
            'campaign_paused',
            'campaign_resumed',
            'campaign_stopped',
            'campaign_deleted',
            'emergency_stop',
            'settings_updated',
        ],
    },
    resource: {
        type: String, // Resource ID
    },
    resourceType: {
        type: String,
        enum: ['user', 'wallet', 'campaign', 'settings'],
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
    },
    ipAddress: {
        type: String,
    },
}, {
    timestamps: true,
});

// Index for faster queries
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resource: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
