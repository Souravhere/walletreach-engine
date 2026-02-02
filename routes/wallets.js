const express = require('express');
const router = express.Router();
const { authenticate, requireOperator } = require('../middleware/auth');
const {
    addWallet,
    getWallets,
    getWalletById,
    updateWallet,
    deleteWallet,
    getWalletBalance,
} = require('../controllers/walletController');

// All routes require operator authentication
router.use(authenticate);
router.use(requireOperator);

router.post('/', addWallet);
router.get('/', getWallets);
router.get('/:id', getWalletById);
router.put('/:id', updateWallet);
router.delete('/:id', deleteWallet);
router.get('/:id/balance', getWalletBalance);

module.exports = router;
