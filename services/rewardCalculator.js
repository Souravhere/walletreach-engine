const { ethers } = require('ethers');

/**
 * Validate reward configuration
 */
const validateRewardConfig = (rewardConfig) => {
    if (!rewardConfig || !rewardConfig.mode) {
        return { valid: false, error: 'Reward configuration is required' };
    }

    if (rewardConfig.mode === 'random_range') {
        const { min, max } = rewardConfig.randomRange || {};

        if (!min || !max) {
            return { valid: false, error: 'Min and max values are required for random range' };
        }

        // Enforce minimum 10 tokens (2 digits)
        if (min < 10) {
            return { valid: false, error: 'Minimum amount must be at least 10 tokens (no single digits)' };
        }

        if (max <= min) {
            return { valid: false, error: 'Max must be greater than min' };
        }

        if (max > 1000000000) {
            return { valid: false, error: 'Max amount is too large' };
        }

        return { valid: true };
    }

    if (rewardConfig.mode === 'discrete_list') {
        const amounts = rewardConfig.discreteAmounts || [];

        if (amounts.length === 0) {
            return { valid: false, error: 'At least one amount is required for discrete list' };
        }

        // Validate each amount
        for (let i = 0; i < amounts.length; i++) {
            const amount = amounts[i];

            if (typeof amount !== 'number' || amount < 10) {
                return {
                    valid: false,
                    error: `Amount at position ${i + 1} must be at least 10 tokens (no single digits)`
                };
            }

            if (amount > 1000000000) {
                return {
                    valid: false,
                    error: `Amount at position ${i + 1} is too large`
                };
            }
        }

        // Check for duplicates
        const uniqueAmounts = [...new Set(amounts)];
        if (uniqueAmounts.length !== amounts.length) {
            return { valid: false, error: 'Duplicate amounts detected in discrete list' };
        }

        return { valid: true };
    }

    return { valid: false, error: 'Invalid reward mode' };
};

/**
 * Generate smart random amount (no floats, minimum 10 tokens)
 * @param {number} min - Minimum amount (already validated >= 10)
 * @param {number} max - Maximum amount
 * @param {number} decimals - Token decimals
 * @returns {bigint} Amount in token's smallest unit
 */
const generateRandomAmount = (min, max, decimals) => {
    // Generate random integer (no floats at display level)
    const randomInt = Math.floor(Math.random() * (max - min + 1)) + min;

    // Convert to token's smallest unit (e.g., wei for 18 decimals)
    const amountInSmallestUnit = BigInt(randomInt) * BigInt(10 ** decimals);

    return amountInSmallestUnit;
};

/**
 * Pick random amount from discrete list
 * @param {number[]} amounts - Array of amounts
 * @param {number} decimals - Token decimals
 * @returns {bigint} Selected amount in token's smallest unit
 */
const pickDiscreteAmount = (amounts, decimals) => {
    const randomIndex = Math.floor(Math.random() * amounts.length);
    const selectedAmount = amounts[randomIndex];

    // Convert to token's smallest unit
    const amountInSmallestUnit = BigInt(selectedAmount) * BigInt(10 ** decimals);

    return amountInSmallestUnit;
};

/**
 * Calculate reward amount based on configuration
 * @param {object} rewardConfig - Reward configuration
 * @param {number} decimals - Token decimals
 * @returns {bigint} Reward amount in token's smallest unit
 */
const calculateRewardAmount = (rewardConfig, decimals) => {
    if (rewardConfig.mode === 'random_range') {
        return generateRandomAmount(
            rewardConfig.randomRange.min,
            rewardConfig.randomRange.max,
            decimals
        );
    }

    if (rewardConfig.mode === 'discrete_list') {
        return pickDiscreteAmount(rewardConfig.discreteAmounts, decimals);
    }

    throw new Error('Invalid reward configuration mode');
};

/**
 * Estimate total tokens needed for campaign
 * @param {object} rewardConfig - Reward configuration
 * @param {number} targetWallets - Number of target wallets
 * @param {number} decimals - Token decimals
 * @returns {bigint} Estimated total tokens in smallest unit
 */
const estimateTotalTokens = (rewardConfig, targetWallets, decimals) => {
    let avgAmount;

    if (rewardConfig.mode === 'random_range') {
        // Use average of min and max
        avgAmount = (rewardConfig.randomRange.min + rewardConfig.randomRange.max) / 2;
    } else if (rewardConfig.mode === 'discrete_list') {
        // Use average of all amounts
        const sum = rewardConfig.discreteAmounts.reduce((a, b) => a + b, 0);
        avgAmount = sum / rewardConfig.discreteAmounts.length;
    } else {
        throw new Error('Invalid reward mode');
    }

    const totalTokens = BigInt(Math.ceil(avgAmount)) * BigInt(targetWallets) * BigInt(10 ** decimals);
    return totalTokens;
};

// Legacy function for backward compatibility
const calculateReward = (rewardConfig, recipientAddress) => {
    const decimals = 18; // Default decimals
    const amount = calculateRewardAmount(rewardConfig, decimals);
    return amount.toString();
};

module.exports = {
    validateRewardConfig,
    generateRandomAmount,
    pickDiscreteAmount,
    calculateRewardAmount,
    estimateTotalTokens,
    calculateReward, // Legacy
};
