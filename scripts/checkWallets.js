const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function checkWallets() {
    try {
        console.log('🔍 Checking wallets in database...\n');

        await mongoose.connect(process.env.WALLETREACH_MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const Wallet = require('../models/Wallet');

        const wallets = await Wallet.find({});

        console.log(`Found ${wallets.length} wallet(s):\n`);

        wallets.forEach((wallet, index) => {
            console.log(`Wallet ${index + 1}:`);
            console.log(`  Name: ${wallet.name}`);
            console.log(`  Address: ${wallet.address}`);
            console.log(`  Is Active: ${wallet.isActive}`);
            console.log(`  ID: ${wallet._id}`);
            console.log('');
        });

        if (wallets.length === 0) {
            console.log('No wallets found in database.');
        } else {
            const inactiveWallets = wallets.filter(w => !w.isActive);
            if (inactiveWallets.length > 0) {
                console.log(`⚠️  ${inactiveWallets.length} wallet(s) are inactive. Activating them...\n`);

                await Wallet.updateMany({}, { $set: { isActive: true } });
                console.log('✅ All wallets activated!');
            } else {
                console.log('✅ All wallets are already active!');
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkWallets();
