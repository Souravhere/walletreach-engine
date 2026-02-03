require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;

console.log('--- Telegram Bot Diagnostic ---');

if (!token) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN is missing in .env');
    process.exit(1);
}

// Mask token for display
const maskedToken = token.slice(0, 5) + '...' + token.slice(-5);
console.log(`Token from .env: ${maskedToken}`);

// Create bot instance
const bot = new TelegramBot(token, { polling: false });

// Test connection
console.log('Attempting to connect to Telegram API...');

bot.getMe()
    .then((info) => {
        console.log('\n✅ Connection Successful!');
        console.log('--------------------------------------------------');
        console.log(`🤖 Bot Name:     ${info.first_name}`);
        console.log(`👤 Bot Username: @${info.username}`);
        console.log(`🆔 Bot ID:       ${info.id}`);
        console.log('--------------------------------------------------');
        console.log('\n✨ The token is valid.');
        console.log('👉 Please ensure you are messaging this exact bot username.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Connection Failed!');
        console.error(`   Error Code: ${error.code}`);
        console.error(`   Message: ${error.message}`);
        console.log('\nTroubleshooting:');
        console.log('1. Check if the token in .env is exactly what BotFather gave you.');
        console.log('2. Ensure no trailing spaces in .env file.');
        process.exit(1);
    });
