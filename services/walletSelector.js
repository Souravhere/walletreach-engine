const { ethers } = require('ethers');
const { getProvider, ERC20_ABI } = require('../config/blockchain');
const Transaction = require('../models/Transaction');

/**
 * Get list of eligible wallets based on filters
 */
const getEligibleWallets = async (campaign, tokenAddress, limit = 1000) => {
    const { filters } = campaign;

    // This is a placeholder that returns sample wallet addresses
    // You would replace this with actual wallet selection logic

    const wallets = await generateSampleWallets(limit);

    // Apply filters
    let filtered = wallets;

    // SKIP expensive RPC filters for auto-generated wallets to avoid rate limits
    // Only apply them if explicitly needed and wallets are from a real source

    // Filter: Exclude existing holders (SKIPPED for generated wallets - too slow)
    // if (filters.excludeExistingHolders) {
    //     filtered = await filterExistingHolders(filtered, tokenAddress);
    // }

    // Filter: Exclude contracts (SKIPPED for generated wallets - they're guaranteed EOAs)
    // if (filters.excludeContracts) {
    //     filtered = await filterContracts(filtered);
    // }

    // Filter: Minimum BNB balance (SKIPPED for generated wallets - they have 0 balance)
    // if (filters.minBNBBalance > 0) {
    //     filtered = await filterByBNBBalance(filtered, filters.minBNBBalance);
    // }

    // Filter: Cooldown (wallets not rewarded recently) - KEEP THIS ONE (no RPC)
    if (filters.cooldownPeriod > 0) {
        filtered = await filterByCooldown(filtered, filters.cooldownPeriod);
    }

    // De-duplication: Remove wallets already in this campaign - KEEP THIS ONE (no RPC)
    filtered = await filterCampaignDuplicates(filtered, campaign._id);

    return filtered;
};

/**
 * Generate sample wallet addresses (placeholder)
 * In production, replace with actual wallet source
 */
const generateSampleWallets = async (count) => {
    // This is just a placeholder
    // In real implementation, you'd fetch from a database or service
    const wallets = [];
    for (let i = 0; i < count; i++) {
        const wallet = ethers.Wallet.createRandom();
        wallets.push(wallet.address.toLowerCase());
    }
    return wallets;
};

/**
 * Filter out wallets that already hold the token
 */
const filterExistingHolders = async (wallets, tokenAddress) => {
    try {
        const provider = getProvider();
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

        const filtered = [];

        // Reduce batch size to avoid rate limits
        const batchSize = 5;
        for (let i = 0; i < wallets.length; i += batchSize) {
            const batch = wallets.slice(i, i + batchSize);

            const balanceChecks = await Promise.all(
                batch.map(async (address) => {
                    try {
                        const balance = await tokenContract.balanceOf(address);
                        return { address, balance: balance.toString() };
                    } catch (error) {
                        console.error(`Error checking balance for ${address}:`, error.message);
                        // On rate limit or error, assume wallet doesn't have tokens
                        return { address, balance: '0' };
                    }
                })
            );

            // Only include wallets with 0 balance
            balanceChecks.forEach(({ address, balance }) => {
                if (balance === '0') {
                    filtered.push(address);
                }
            });

            // Longer delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return filtered;
    } catch (error) {
        console.error('Error filtering existing holders:', error);
        return wallets; // Return all if filtering fails
    }
};

/**
 * Filter out contract addresses
 */
const filterContracts = async (wallets) => {
    try {
        const provider = getProvider();
        const filtered = [];

        const batchSize = 5;
        for (let i = 0; i < wallets.length; i += batchSize) {
            const batch = wallets.slice(i, i + batchSize);

            const codeChecks = await Promise.all(
                batch.map(async (address) => {
                    try {
                        const code = await provider.getCode(address);
                        return { address, isContract: code !== '0x' };
                    } catch (error) {
                        return { address, isContract: false };
                    }
                })
            );

            codeChecks.forEach(({ address, isContract }) => {
                if (!isContract) {
                    filtered.push(address);
                }
            });

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return filtered;
    } catch (error) {
        console.error('Error filtering contracts:', error);
        return wallets;
    }
};

/**
 * Filter by minimum BNB balance
 */
const filterByBNBBalance = async (wallets, minBalance) => {
    try {
        const provider = getProvider();
        const filtered = [];

        // Convert minBalance from BNB to Wei (BigInt)
        const minBalanceWei = ethers.parseEther(minBalance.toString());

        const batchSize = 5;
        for (let i = 0; i < wallets.length; i += batchSize) {
            const batch = wallets.slice(i, i + batchSize);

            const balanceChecks = await Promise.all(
                batch.map(async (address) => {
                    try {
                        const balance = await provider.getBalance(address);
                        return { address, balance };
                    } catch (error) {
                        return { address, balance: 0n };
                    }
                })
            );

            balanceChecks.forEach(({ address, balance }) => {
                if (balance >= minBalanceWei) {
                    filtered.push(address);
                }
            });

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return filtered;
    } catch (error) {
        console.error('Error filtering by BNB balance:', error);
        return wallets;
    }
};

/**
 * Filter wallets by cooldown period
 */
const filterByCooldown = async (wallets, cooldownDays) => {
    try {
        const cooldownDate = new Date();
        cooldownDate.setDate(cooldownDate.getDate() - cooldownDays);

        // Find wallets that received tokens recently
        const recentRecipients = await Transaction.find({
            recipientAddress: { $in: wallets },
            status: 'success',
            createdAt: { $gte: cooldownDate },
        }).distinct('recipientAddress');

        // Filter out recent recipients
        const filtered = wallets.filter(
            address => !recentRecipients.includes(address.toLowerCase())
        );

        return filtered;
    } catch (error) {
        console.error('Error filtering by cooldown:', error);
        return wallets;
    }
};

/**
 * Remove wallets already processed in this campaign
 */
const filterCampaignDuplicates = async (wallets, campaignId) => {
    try {
        const processed = await Transaction.find({
            campaign: campaignId,
        }).distinct('recipientAddress');

        const filtered = wallets.filter(
            address => !processed.includes(address.toLowerCase())
        );

        return filtered;
    } catch (error) {
        console.error('Error filtering campaign duplicates:', error);
        return wallets;
    }
};

/**
 * Estimate number of eligible wallets (for simulation)
 */
const estimateEligibleWallets = async (campaign, tokenAddress) => {
    // Get a sample to estimate
    const sample = await getEligibleWallets(campaign, tokenAddress, 100);

    // In real implementation, you'd have better estimation logic
    return sample.length * 10; // Rough estimate
};

module.exports = {
    getEligibleWallets,
    estimateEligibleWallets,
};
