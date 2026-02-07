require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/database');

const app = express();
const PORT = process.env.WALLETREACH_PORT || 5000;

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    // Wait for database connection
    await connectDB();

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 WalletReach Engine running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

      // Display RPC and API key status
      const { getAPIKeyStatus } = require('./config/rpcEndpoints');
      const apiStatus = getAPIKeyStatus();

      console.log('\n📡 RPC Configuration Status:');
      console.log(`   Total Endpoints: ${apiStatus.totalEndpoints}`);
      console.log(`   API Key Endpoints: ${apiStatus.apiKeyEndpoints}`);
      console.log(`   Public Fallbacks: ${apiStatus.publicEndpoints}`);

      if (apiStatus.ankr) {
        console.log('   ✅ Ankr API configured (500M req/day)');
      } else {
        console.log('   ⚠️  Ankr API NOT configured - Add for faster speeds');
      }

      if (apiStatus.getblock) {
        console.log('   ✅ GetBlock endpoint configured');
      } else {
        console.log('   ⚠️  GetBlock NOT configured');
      }

      console.log(`   🔄 Automatic failover: ENABLED`);
      console.log('');

      // Start Telegram bot
      const telegramBot = require('./services/telegramBot');
      telegramBot.start().catch(err => {
        logger.error('Telegram bot startup error:', err);
      });

      // Start Scheduler Service
      const schedulerService = require('./services/scheduler');
      schedulerService.start();
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
