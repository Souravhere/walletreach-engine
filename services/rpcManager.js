const { getProviderWithRetry } = require('../config/blockchain');

/**
 * RPC Manager with rotation and failure handling
 */
class RPCManager {
    constructor() {
        this.providers = [];
        this.currentIndex = 0;
        this.failureCounts = new Map();
    }

    /**
     * Get a provider instance
     */
    async getProvider() {
        return await getProviderWithRetry();
    }

    /**
     * Mark RPC as failed
     */
    markFailure(rpcUrl) {
        const count = this.failureCounts.get(rpcUrl) || 0;
        this.failureCounts.set(rpcUrl, count + 1);

        if (count > 10) {
            console.warn(`⚠️  RPC ${rpcUrl} has excessive failures: ${count}`);
        }
    }

    /**
     * Reset failure count for RPC
     */
    resetFailure(rpcUrl) {
        this.failureCounts.set(rpcUrl, 0);
    }

    /**
     * Get failure statistics
     */
    getStats() {
        return {
            totalFailures: Array.from(this.failureCounts.values()).reduce((a, b) => a + b, 0),
            failuresByRPC: Object.fromEntries(this.failureCounts),
        };
    }
}

module.exports = new RPCManager();
