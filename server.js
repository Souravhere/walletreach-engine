require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/database');

const app = express();
const PORT = process.env.WALLETREACH_PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.WALLETREACH_FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/wallets', require('./routes/wallets'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/settings', require('./routes/settings'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

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
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
