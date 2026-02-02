const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function unlockUser() {
    try {
        console.log('🔓 Unlocking user: sourav\n');

        await mongoose.connect(process.env.WALLETREACH_MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const User = require('../models/User');

        const result = await User.updateOne(
            { username: 'sourav' },
            {
                $set: {
                    isLocked: false,
                    loginAttempts: 0
                }
            }
        );

        if (result.modifiedCount > 0) {
            console.log('✅ User unlocked successfully!');
            console.log('\nYou can now login with:');
            console.log('Username: sourav');
            console.log('Password: souravisactive');
        } else {
            console.log('⚠️  User not found or already unlocked');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

unlockUser();
