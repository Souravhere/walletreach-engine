# WalletReach Engine (Backend)

Internal holder growth engine for BNB Chain token distribution.

## 🚀 Features

- **User Management**: Role-based access control (Super Admin, Operator)
- **Key Management**: AES-256 encrypted private key storage
- **Campaign System**: Multi-wallet token distribution campaigns
- **Safety Guardrails**: Auto-pause triggers, rate limiting, failure detection
- **Free RPC Strategy**: Automatic RPC rotation for BSC
- **Comprehensive Logging**: Transaction logs, audit logs, alerts

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB Atlas account
- BNB Chain RPC endpoints (free public RPCs included)

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

## ⚙️ Configuration

Edit `.env` file:

```env
# MongoDB
WALLETREACH_MONGODB_URI=mongodb+srv://...

# JWT Secret (change this!)
WALLETREACH_JWT_SECRET=your-super-secret-jwt-key

# Encryption Key (must be exactly 32 characters!)
WALLETREACH_ENCRYPTION_KEY=your-32-char-encryption-key!!

# Server
WALLETREACH_PORT=5000
NODE_ENV=development

# BSC RPC Endpoints (free public RPCs)
WALLETREACH_BSC_RPC_1=https://bsc-dataseed1.binance.org
WALLETREACH_BSC_RPC_2=https://bsc-dataseed2.binance.org
WALLETREACH_BSC_RPC_3=https://bsc-dataseed3.binance.org

# Frontend URL (for CORS)
WALLETREACH_FRONTEND_URL=http://localhost:3000
```

## 🏃 Running

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## 📝 Creating Super Admin

You need to manually create the first Super Admin user in MongoDB:

```javascript
// In MongoDB shell or Compass
db.users.insertOne({
  username: "admin",
  email: "admin@walletreach.internal",
  password: "$2b$10$...", // Hash password using bcrypt
  role: "super_admin",
  isActive: true,
  isLocked: false,
  loginAttempts: 0,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

Or use this Node.js script:

```javascript
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
require('dotenv').config();

async function createSuperAdmin() {
  await mongoose.connect(process.env.WALLETREACH_MONGODB_URI);
  
  const User = require('./models/User');
  
  const hashedPassword = await bcrypt.hash('YourPasswordHere', 10);
  
  await User.create({
    username: 'admin',
    email: 'admin@walletreach.internal',
    password: hashedPassword,
    role: 'super_admin',
  });
  
  console.log('Super Admin created!');
  process.exit(0);
}

createSuperAdmin();
```

## 🔐 Security

- **Private keys** are encrypted with AES-256 before storage
- **Passwords** are hashed with bcrypt
- **JWT tokens** used for authentication
- **Rate limiting** on all endpoints
- **Account locking** after failed login attempts
- **Audit logging** for all sensitive operations

## 📚 API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Users (Super Admin only)
- `POST /api/users` - Create user
- `GET /api/users` - List users
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Wallets (Operator+)
- `POST /api/wallets` - Add wallet
- `GET /api/wallets` - List wallets
- `PUT /api/wallets/:id` - Update wallet
- `DELETE /api/wallets/:id` - Delete wallet
- `GET /api/wallets/:id/balance` - Check balance

### Campaigns (Operator+)
- `POST /api/campaigns` - Create campaign
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns/simulate` - Simulate campaign
- `POST /api/campaigns/:id/start` - Start campaign
- `POST /api/campaigns/:id/pause` - Pause campaign
- `POST /api/campaigns/:id/resume` - Resume campaign
- `POST /api/campaigns/:id/stop` - Stop campaign

### Alerts (Operator+)
- `GET /api/alerts` - Get alerts
- `PUT /api/alerts/:id/read` - Mark as read
- `DELETE /api/alerts/:id` - Delete alert

### Logs (Operator+)
- `GET /api/logs/transactions` - Transaction logs
- `GET /api/logs/audit` - Audit logs

### Analytics (Operator+)
- `GET /api/analytics/campaigns/:id` - Campaign analytics
- `GET /api/analytics/overview` - Overview analytics

### Settings
- `POST /api/settings/emergency-stop` - Emergency stop (Super Admin)
- `GET /api/settings/status` - System status

## 📊 Campaign Execution

Campaigns execute with:
- **Multi-wallet parallel processing**
- **Sequential transactions per wallet**
- **Strict nonce management**
- **30-45 second throttling** between transactions
- **Auto-pause on high failure rate**
- **Comprehensive error handling**

## 🎯 Wallet Filtering

Campaigns support:
- Exclude contract addresses
- Exclude existing token holders
- Minimum wallet age
- Minimum BNB balance  
- Cooldown period (days since last reward)
- Campaign-level de-duplication

## 💰 Reward Configuration

Two modes:
1. **Random Range**: Min-max random amount
2. **Random List**: Pick from fixed list

## ⚠️ Safety Features

- Per-wallet transaction limits
- Per-wallet amount limits
- Auto-disable on consecutive failures
- Emergency stop button
- Campaign auto-pause triggers

## 📈 Metrics Tracked

- Holders before/after
- Net new holders
- Cost per holder (gas)
- Total gas spent
- Success/failure rates
- Transaction throughput

## 🐛 Debugging

Check logs in console or `logs/` directory (production).

## 📄 License

PRIVATE - Internal use only.
# walletreach-engine
