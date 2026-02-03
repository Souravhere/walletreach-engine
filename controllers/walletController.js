const { ethers } = require('ethers');
const Wallet = require('../models/Wallet');
const AuditLog = require('../models/AuditLog');
const { encryptPrivateKey, decryptPrivateKey } = require('../utils/encryption');
const { getProvider } = require('../config/blockchain');

/**
 * Add wallet
 */
const addWallet = async (req, res) => {
    try {
        const { name, privateKey, limits } = req.body;

        if (!name || !privateKey) {
            return res.status(400).json({ error: 'Name and private key are required' });
        }

        // Validate private key format
        let ethersWallet;
        try {
            ethersWallet = new ethers.Wallet(privateKey);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid private key format' });
        }

        const address = ethersWallet.address.toLowerCase();

        // Check if wallet already exists
        const existing = await Wallet.findOne({ address });
        if (existing) {
            return res.status(400).json({ error: 'Wallet already exists' });
        }

        // Encrypt private key
        const encryptedKey = encryptPrivateKey(privateKey);

        // Create wallet
        const wallet = await Wallet.create({
            name,
            address,
            encryptedPrivateKey: encryptedKey,
            limits: limits || {},
            createdBy: req.user._id,
        });

        // Create audit log
        await AuditLog.create({
            user: req.user._id,
            action: 'wallet_created',
            resourceType: 'wallet',
            resource: wallet._id.toString(),
            details: { name, address },
            ipAddress: req.ip,
        });

        res.status(201).json({ wallet });
    } catch (error) {
        console.error('Add wallet error:', error);
        res.status(500).json({ error: 'Failed to add wallet' });
    }
};

/**
 * Get all wallets
 */
const getWallets = async (req, res) => {
    try {
        const wallets = await Wallet.find()
            .populate('createdBy', 'username')
            .sort({ createdAt: -1 });

        res.json({ wallets });
    } catch (error) {
        console.error('Get wallets error:', error);
        res.status(500).json({ error: 'Failed to get wallets' });
    }
};

/**
 * Get wallet by ID
 */
const getWalletById = async (req, res) => {
    try {
        const wallet = await Wallet.findById(req.params.id)
            .populate('createdBy', 'username');

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        res.json({ wallet });
    } catch (error) {
        console.error('Get wallet error:', error);
        res.status(500).json({ error: 'Failed to get wallet' });
    }
};

/**
 * Update wallet
 */
const updateWallet = async (req, res) => {
    try {
        const { name, status, limits } = req.body;

        const wallet = await Wallet.findById(req.params.id);

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // Update fields
        if (name) wallet.name = name;
        if (status) wallet.status = status;
        if (limits) wallet.limits = { ...wallet.limits, ...limits };

        await wallet.save();

        // Create audit log
        await AuditLog.create({
            user: req.user._id,
            action: 'wallet_updated',
            resourceType: 'wallet',
            resource: wallet._id.toString(),
            details: { name, status, limits },
            ipAddress: req.ip,
        });

        res.json({ wallet });
    } catch (error) {
        console.error('Update wallet error:', error);
        res.status(500).json({ error: 'Failed to update wallet' });
    }
};

/**
 * Delete wallet
 */
const deleteWallet = async (req, res) => {
    try {
        const wallet = await Wallet.findById(req.params.id);

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // TODO: Check if wallet is being used in active campaigns

        await Wallet.findByIdAndDelete(req.params.id);

        // Create audit log
        await AuditLog.create({
            user: req.user._id,
            action: 'wallet_deleted',
            resourceType: 'wallet',
            resource: wallet._id.toString(),
            details: { name: wallet.name, address: wallet.address },
            ipAddress: req.ip,
        });

        res.json({ message: 'Wallet deleted successfully' });
    } catch (error) {
        console.error('Delete wallet error:', error);
        res.status(500).json({ error: 'Failed to delete wallet' });
    }
};

/**
 * Get wallet balance (BNB and token)
 */
const getWalletBalance = async (req, res) => {
    try {
        const { tokenAddress } = req.query;

        const wallet = await Wallet.findById(req.params.id);

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const provider = getProvider();

        // Get BNB balance
        const bnbBalance = await provider.getBalance(wallet.address);

        let tokenBalance = '0';
        let tokenDecimals = 18;
        let tokenSymbol = '';

        if (tokenAddress) {
            // Get token balance and details
            const tokenContract = new ethers.Contract(
                tokenAddress,
                [
                    'function balanceOf(address) view returns (uint256)',
                    'function decimals() view returns (uint8)',
                    'function symbol() view returns (string)'
                ],
                provider
            );

            try {
                const [bal, dec, sym] = await Promise.all([
                    tokenContract.balanceOf(wallet.address),
                    tokenContract.decimals().catch(() => 18), // Default to 18 if fails
                    tokenContract.symbol().catch(() => '')
                ]);

                tokenBalance = bal.toString();
                tokenDecimals = Number(dec);
                tokenSymbol = sym;
            } catch (err) {
                console.error('Error fetching token details:', err.message);
            }
        }

        res.json({
            address: wallet.address,
            bnbBalance: bnbBalance.toString(),
            bnbBalanceFormatted: ethers.formatEther(bnbBalance),
            tokenBalance: tokenBalance,
            tokenBalanceFormatted: tokenAddress ? ethers.formatUnits(tokenBalance, tokenDecimals) : '0',
            tokenSymbol
        });
    } catch (error) {
        console.error('Get wallet balance error:', error);
        res.status(500).json({ error: 'Failed to get wallet balance' });
    }
};

module.exports = {
    addWallet,
    getWallets,
    getWalletById,
    updateWallet,
    deleteWallet,
    getWalletBalance,
};
