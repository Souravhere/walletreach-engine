const axios = require('axios');

// Test Telegram API connectivity
async function testTelegramConnection() {
    const token = process.env.TELEGRAM_BOT_TOKEN || '8427667030:AAEI04XbgCT2W4Ds9Ki9pdJIqbVTGJrzJO4';
    const url = `https://api.telegram.org/bot${token}/getMe`;

    console.log('Testing Telegram API connection...');
    console.log('URL:', url.replace(token, 'TOKEN_HIDDEN'));

    try {
        const response = await axios.get(url, { timeout: 10000 });
        console.log('\n✅ SUCCESS! Telegram API is reachable');
        console.log('Bot info:', response.data.result);
        return true;
    } catch (error) {
        console.log('\n❌ FAILED! Cannot reach Telegram API');
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            console.log('Error: Connection timeout');
            console.log('\nPossible issues:');
            console.log('1. Telegram API is blocked by your network/firewall');
            console.log('2. You need a VPN to access Telegram');
            console.log('3. Internet connection is unstable');
        } else if (error.response) {
            console.log('Error:', error.response.status, error.response.data);
        } else {
            console.log('Error:', error.message);
        }
        return false;
    }
}

testTelegramConnection();
