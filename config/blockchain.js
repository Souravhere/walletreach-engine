const { ethers } = require('ethers');
const { getCurrentRPCEndpoint, rotateRPCEndpoint, getRandomRPCEndpoint, markEndpointFailed } = require('./rpcEndpoints');

// Use free RPC endpoints with automatic failover
let currentRPCUrl = process.env.BSC_RPC_URL || getCurrentRPCEndpoint().url;

// BSC Chain ID
const BSC_CHAIN_ID = 56; // Mainnet (use 97 for testnet)

// Initialize provider with proper configuration
let provider = null;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 5;

/**
 * Initialize provider with retry logic and automatic failover
 */
const initializeProvider = async () => {
    if (initializationAttempts >= MAX_INIT_ATTEMPTS) {
        console.error('❌ Failed to initialize provider after maximum attempts');
        // Return a basic provider anyway
        provider = new ethers.JsonRpcProvider(currentRPCUrl, {
            chainId: BSC_CHAIN_ID,
            name: 'bsc',
        });
        return provider;
    }

    const endpoint = typeof currentRPCUrl === 'string' ? { url: currentRPCUrl, name: 'Custom' } : getCurrentRPCEndpoint();
    const rpcUrl = endpoint.url;

    const newProvider = new ethers.JsonRpcProvider(rpcUrl, {
        chainId: BSC_CHAIN_ID,
        name: 'bsc',
        staticNetwork: true, // Faster initialization
    });

    try {
        // Test connection with timeout
        const blockNumberPromise = newProvider.getBlockNumber();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 5000)
        );

        await Promise.race([blockNumberPromise, timeoutPromise]);

        console.log(`✅ Connected to BSC via ${endpoint.name}: ${rpcUrl}`);
        provider = newProvider;
        initializationAttempts = 0; // Reset on success
        return newProvider;
    } catch (error) {
        console.error(`❌ Failed to connect to ${rpcUrl}:`, error.message);

        // Mark this endpoint as failed
        markEndpointFailed(rpcUrl);

        // Try rotating to next endpoint
        initializationAttempts++;
        currentRPCUrl = rotateRPCEndpoint();

        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));

        return initializeProvider(); // Recursive retry
    }
};

// Initialize on module load
initializeProvider().catch(err => {
    console.error('⚠️  Provider initialization error:', err.message);
    // Create fallback provider
    provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org', {
        chainId: BSC_CHAIN_ID,
        name: 'bsc',
    });
});

/**
 * Get provider with automatic failover
 */
const getProvider = () => {
    if (!provider) {
        // Fallback: create synchronous provider if not initialized
        console.log('⚠️  Creating fallback provider...');
        provider = new ethers.JsonRpcProvider(
            typeof currentRPCUrl === 'string' ? currentRPCUrl : getCurrentRPCEndpoint().url,
            {
                chainId: BSC_CHAIN_ID,
                name: 'bsc',
            }
        );
    }
    return provider;
};

/**
 * Create a new provider instance (useful for parallel processing)
 * Uses random RPC endpoint to distribute load
 */
const createNewProvider = () => {
    const rpcUrl = getRandomRPCEndpoint();
    return new ethers.JsonRpcProvider(rpcUrl, {
        chainId: BSC_CHAIN_ID,
        name: 'bsc',
        staticNetwork: true,
    });
};

/**
 * Rotate provider to next RPC endpoint (with failover)
 */
const rotateProvider = async () => {
    currentRPCUrl = rotateRPCEndpoint();
    initializationAttempts = 0;
    return await initializeProvider();
};

/**
 * Execute RPC call with automatic retry and failover
 */
const executeWithRetry = async (fn, maxRetries = 3) => {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const currentProvider = getProvider();
            return await fn(currentProvider);
        } catch (error) {
            lastError = error;
            console.error(`Attempt ${i + 1} failed:`, error.message);

            // Rotate to next provider on error
            if (i < maxRetries - 1) {
                await rotateProvider();
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    throw lastError;
};

// ERC20 ABI (minimal)
const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)',
    'function totalSupply() view returns (uint256)',
];

module.exports = {
    BSC_CHAIN_ID,
    getProvider,
    createNewProvider,
    rotateProvider,
    executeWithRetry,
    ERC20_ABI,
};
