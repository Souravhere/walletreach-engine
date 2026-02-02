const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function checkUser() {
    try {
        console.log('🔍 Checking user in database...\n');

        await mongoose.connect(process.env.WALLETREACH_MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const User = require('../models/User');

        const user = await User.findOne({ username: 'sourav' });

        if (!user) {
            console.log('❌ User not found!');
            console.log('Creating new user...\n');

            const hashedPassword = await bcrypt.hash('souravisactive', 10);
            const newUser = await User.create({
                username: 'sourav',
                email: 'sourav@walletreach.internal',
                password: hashedPassword,
                role: 'super_admin',
                isActive: true,
                isLocked: false,
                loginAttempts: 0
            });

            console.log('✅ User created successfully!');
            console.log(`Username: ${newUser.username}`);
            console.log(`Email: ${newUser.email}`);
            console.log(`Role: ${newUser.role}`);
        } else {
            console.log('User found in database:');
            console.log(`Username: ${user.username}`);
            console.log(`Email: ${user.email}`);
            console.log(`Role: ${user.role}`);
            console.log(`Is Active: ${user.isActive}`);
            console.log(`Is Locked: ${user.isLocked}`);
            console.log(`Login Attempts: ${user.loginAttempts}`);

            // Test password
            console.log('\n🔐 Testing password "souravisactive"...');
            const isValid = await bcrypt.compare('souravisactive', user.password);
            console.log(`Password matches: ${isValid ? '✅ YES' : '❌ NO'}`);

            if (!isValid) {
                console.log('\n⚠️  Password mismatch! Resetting password...');
                const hashedPassword = await bcrypt.hash('souravisactive', 10);
                await User.updateOne(
                    { username: 'sourav' },
                    {
                        $set: {
                            password: hashedPassword,
                            isLocked: false,
                            loginAttempts: 0
                        }
                    }
                );
                console.log('✅ Password reset to: souravisactive');
            }
        }

        console.log('\n✅ You can now login with:');
        console.log('Username: sourav');
        console.log('Password: souravisactive');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkUser();
