const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function createSouravAdmin() {
    try {
        console.log('🔐 Creating Super Admin User: sourav\n');

        // Check environment
        if (!process.env.WALLETREACH_MONGODB_URI) {
            console.error('❌ Error: WALLETREACH_MONGODB_URI not found in .env file');
            process.exit(1);
        }

        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.WALLETREACH_MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const User = require('../models/User');

        // Check if user exists
        const existing = await User.findOne({
            $or: [{ username: 'sourav' }, { email: 'hisourav@walletreach.internal' }]
        });

        if (existing) {
            console.log('⚠️  User "sourav" already exists. Deleting and recreating...');
            await User.deleteOne({ _id: existing._id });
        }

        // Hash password
        console.log('Hashing password...');
        const hashedPassword = await bcrypt.hash('souravisactive', 10);

        // Create user
        console.log('Creating Super Admin user...');
        const user = await User.create({
            username: 'sourav',
            email: 'sourav@walletreach.internal',
            password: hashedPassword,
            role: 'super_admin',
            isActive: true,
        });

        console.log('\n✅ Super Admin user created successfully!');
        console.log(`\nUsername: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Role: ${user.role}`);
        console.log(`Password: souravisactive`);
        console.log('\n🎉 You can now login at http://localhost:3000/login');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createSouravAdmin();
