/**
 * BSC RPC Endpoints with API Key Support and Automatic Failover
 * Priority: API keys first (faster), then public endpoints (fallback)
 */

// Build endpoints array with API keys taking priority
const buildRPCEndpoints = () => {
    const endpoints = [];

    // PRIORITY 1: API Key endpoints (fastest, highest limits)

    // Ankr API Key
    if (process.env.ANKR_API_KEY) {
        endpoints.push({
            url: `https://rpc.ankr.com/bsc/${process.env.ANKR_API_KEY}`,
            name: 'Ankr (API Key)',
            type: 'api_key'
        });
    }

    // GetBlock URL (this is what QuickNode URL actually is from user's data)
    if (process.env.QUICKNODE_URL) {
        endpoints.push({
            url: process.env.QUICKNODE_URL,
            name: 'GetBlock',
            type: 'api_key'
        });
    }

    // PRIORITY 2: Official Binance endpoints (free, no auth, reliable)
    const binanceEndpoints = [
        'https://bsc-dataseed.binance.org',
        'https://bsc-dataseed1.binance.org',
        'https://bsc-dataseed2.binance.org',
        'https://bsc-dataseed3.binance.org',
        'https://bsc-dataseed4.binance.org'
    ];

    binanceEndpoints.forEach(url => {
        endpoints.push({ url, name: 'Binance Official', type: 'public' });
    });

    // PRIORITY 3: Community endpoints (free, no auth)
    const communityEndpoints = [
        'https://bsc-dataseed1.defibit.io',
        'https://bsc-dataseed2.defibit.io',
        'https://bsc-dataseed3.defibit.io',
        'https://bsc-dataseed4.defibit.io',
        'https://bsc-dataseed1.ninicoin.io',
        'https://bsc-dataseed2.ninicoin.io',
        'https://bsc-dataseed.bnbchain.org'
    ];

    communityEndpoints.forEach(url => {
        endpoints.push({ url, name: 'Community', type: 'public' });
    });

    return endpoints;
};

const BSC_RPC_ENDPOINTS = buildRPCEndpoints();

// Track API key status for alerts
const apiKeyStatus = {
    ankr: !!process.env.ANKR_API_KEY,
    getblock: !!process.env.QUICKNODE_URL,
};

// Log which API keys are configured
console.log('\n🔌 RPC Configuration:');
if (process.env.ANKR_API_KEY) {
    console.log('  ✅ Ankr API key configured');
} else {
    console.log('  ⚠️  Ankr API key NOT configured (slower speeds)');
}

if (process.env.QUICKNODE_URL) {
    console.log('  ✅ GetBlock URL configured');
} else {
    console.log('  ⚠️  GetBlock URL NOT configured');
}

console.log(`  📊 Total endpoints available: ${BSC_RPC_ENDPOINTS.length}`);
console.log('');

let currentEndpointIndex = 0;
const failedEndpoints = new Set();

/**
 * Get current RPC endpoint
 */
const getCurrentRPCEndpoint = () => {
    return BSC_RPC_ENDPOINTS[currentEndpointIndex];
};

/**
 * Mark endpoint as failed (temporary)
 */
const markEndpointFailed = (url) => {
    failedEndpoints.add(url);
    console.log(`❌ Marked endpoint as failed: ${url}`);

    // Auto-clear after 5 minutes
    setTimeout(() => {
        failedEndpoints.delete(url);
        console.log(`♻️  Re-enabled endpoint: ${url}`);
    }, 5 * 60 * 1000);
};

/**
 * Get next working RPC endpoint (skip failed ones)
 */
const getNextWorkingEndpoint = () => {
    let attempts = 0;
    const maxAttempts = BSC_RPC_ENDPOINTS.length;

    while (attempts < maxAttempts) {
        currentEndpointIndex = (currentEndpointIndex + 1) % BSC_RPC_ENDPOINTS.length;
        const endpoint = BSC_RPC_ENDPOINTS[currentEndpointIndex];

        if (!failedEndpoints.has(endpoint.url)) {
            return endpoint;
        }

        attempts++;
    }

    // All endpoints failed, clear failed list and start fresh
    console.log('⚠️  All endpoints were marked failed, resetting...');
    failedEndpoints.clear();
    return BSC_RPC_ENDPOINTS[0];
};

/**
 * Rotate to next RPC endpoint (for load balancing and failover)
 */
const rotateRPCEndpoint = () => {
    const endpoint = getNextWorkingEndpoint();
    console.log(`🔄 Rotated to: ${endpoint.name} - ${endpoint.url}`);
    return endpoint.url;
};

/**
 * Get random RPC endpoint (for parallel requests)
 */
const getRandomRPCEndpoint = () => {
    // Filter out failed endpoints
    const workingEndpoints = BSC_RPC_ENDPOINTS.filter(ep => !failedEndpoints.has(ep.url));

    if (workingEndpoints.length === 0) {
        // All failed, return any
        const randomIndex = Math.floor(Math.random() * BSC_RPC_ENDPOINTS.length);
        return BSC_RPC_ENDPOINTS[randomIndex].url;
    }

    const randomIndex = Math.floor(Math.random() * workingEndpoints.length);
    return workingEndpoints[randomIndex].url;
};

/**
 * Get all RPC endpoints
 */
const getAllRPCEndpoints = () => {
    return BSC_RPC_ENDPOINTS.map(ep => ep.url);
};

/**
 * Get API key status for alerts/dashboard
 */
const getAPIKeyStatus = () => {
    return {
        ...apiKeyStatus,
        totalEndpoints: BSC_RPC_ENDPOINTS.length,
        apiKeyEndpoints: BSC_RPC_ENDPOINTS.filter(ep => ep.type === 'api_key').length,
        publicEndpoints: BSC_RPC_ENDPOINTS.filter(ep => ep.type === 'public').length,
        failedEndpoints: failedEndpoints.size
    };
};

module.exports = {
    getCurrentRPCEndpoint,
    rotateRPCEndpoint,
    getRandomRPCEndpoint,
    getAllRPCEndpoints,
    markEndpointFailed,
    getAPIKeyStatus,
    BSC_RPC_ENDPOINTS,
};
