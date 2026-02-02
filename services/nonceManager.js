const { getProvider } = require('../config/blockchain');
const logger = require('../utils/logger');

/**
 * Centralized Nonce Manager
 * Tracks and manages nonces for each wallet to prevent conflicts in parallel processing
 */
class NonceManager {
    constructor() {
        this.walletNonces = new Map(); // walletAddress -> { current: number, pending: Set<number> }
        this.nonceLocks = new Map(); // walletAddress -> Promise (for sequential nonce allocation)
    }

    /**
     * Get next available nonce for a wallet
     * This ensures no two transactions get the same nonce
     */
    async getNextNonce(walletAddress) {
        walletAddress = walletAddress.toLowerCase();

        // Wait for any pending nonce allocation for this wallet
        while (this.nonceLocks.has(walletAddress)) {
            await this.nonceLocks.get(walletAddress);
        }

        // Create a lock promise
        let releaseLock;
        const lockPromise = new Promise(resolve => {
            releaseLock = resolve;
        });
        this.nonceLocks.set(walletAddress, lockPromise);

        try {
            const provider = getProvider();

            // Get wallet nonce info
            let walletNonceInfo = this.walletNonces.get(walletAddress);

            if (!walletNonceInfo) {
                // First time seeing this wallet - fetch from chain
                const chainNonce = await provider.getTransactionCount(walletAddress, 'latest');
                const pendingNonce = await provider.getTransactionCount(walletAddress, 'pending');

                walletNonceInfo = {
                    current: Math.max(chainNonce, pendingNonce),
                    pending: new Set()
                };
                this.walletNonces.set(walletAddress, walletNonceInfo);
            }

            // Allocate next nonce
            const nonce = walletNonceInfo.current;
            walletNonceInfo.pending.add(nonce);
            walletNonceInfo.current++;

            logger.info(`Allocated nonce ${nonce} for wallet ${walletAddress}`);

            return nonce;
        } catch (error) {
            logger.error(`Error getting nonce for ${walletAddress}:`, error);
            throw error;
        } finally {
            // Release lock
            this.nonceLocks.delete(walletAddress);
            releaseLock();
        }
    }

    /**
     * Mark nonce as confirmed (transaction mined)
     */
    confirmNonce(walletAddress, nonce) {
        walletAddress = walletAddress.toLowerCase();
        const walletNonceInfo = this.walletNonces.get(walletAddress);

        if (walletNonceInfo) {
            walletNonceInfo.pending.delete(nonce);
            logger.info(`Confirmed nonce ${nonce} for wallet ${walletAddress}`);
        }
    }

    /**
     * Reset nonce for wallet (in case of errors)
     */
    async resetNonce(walletAddress) {
        walletAddress = walletAddress.toLowerCase();

        try {
            const provider = getProvider();
            const chainNonce = await provider.getTransactionCount(walletAddress, 'latest');
            const pendingNonce = await provider.getTransactionCount(walletAddress, 'pending');

            this.walletNonces.set(walletAddress, {
                current: Math.max(chainNonce, pendingNonce),
                pending: new Set()
            });

            logger.info(`Reset nonce for wallet ${walletAddress} to ${Math.max(chainNonce, pendingNonce)}`);
        } catch (error) {
            logger.error(`Error resetting nonce for ${walletAddress}:`, error);
        }
    }

    /**
     * Clear all nonces (useful for testing or resets)
     */
    clearAll() {
        this.walletNonces.clear();
        this.nonceLocks.clear();
        logger.info('Cleared all nonces');
    }
}

module.exports = new NonceManager();
