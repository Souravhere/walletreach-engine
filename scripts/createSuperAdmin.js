const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function createSuperAdmin() {
    try {
        console.log('🔐 WalletReach - Create Super Admin User\n');

        // Check environment
        if (!process.env.WALLETREACH_MONGODB_URI) {
            console.error('❌ Error: WALLETREACH_MONGODB_URI not found in .env file');
            process.exit(1);
        }

        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.WALLETREACH_MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const User = require('./models/User');

        // Get input
        const username = await question('Username: ');
        const email = await question('Email: ');
        const password = await question('Password: ');

        if (!username || !email || !password) {
            console.error('❌ All fields are required');
            process.exit(1);
        }

        if (password.length < 8) {
            console.error('❌ Password must be at least 8 characters');
            process.exit(1);
        }

        // Check if user exists
        const existing = await User.findOne({
            $or: [{ username }, { email: email.toLowerCase() }]
        });

        if (existing) {
            console.error('❌ User with this username or email already exists');
            process.exit(1);
        }

        // Hash password
        console.log('\nHashing password...');
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        console.log('Creating Super Admin user...');
        const user = await User.create({
            username,
            email: email.toLowerCase(),
            password: hashedPassword,
            role: 'super_admin',
        });

        console.log('\n✅ Super Admin user created successfully!');
        console.log(`\nUsername: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Role: ${user.role}`);
        console.log('\n🎉 You can now login at http://localhost:3000/login');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createSuperAdmin();
