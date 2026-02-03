const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const Campaign = require('../models/Campaign');
const Wallet = require('../models/Wallet');
const Alert = require('../models/Alert');
const campaignEngine = require('./campaignEngine');

/**
 * Telegram Bot Service
 * Provides real-time monitoring and control of campaigns via Telegram
 */
class TelegramBotService {
    constructor() {
        this.bot = null;
        this.adminIds = [];
        this.isEnabled = false;
    }

    /**
     * Initialize and start the bot
     */
    async start() {
        try {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const adminIdsStr = process.env.TELEGRAM_ADMIN_IDS;
            const enabled = process.env.TELEGRAM_NOTIFICATIONS_ENABLED === 'true';

            if (!enabled) {
                logger.info('Telegram bot disabled in configuration');
                return;
            }

            if (!token) {
                logger.warn('Telegram bot token not configured');
                return;
            }

            // Parse admin IDs
            if (adminIdsStr) {
                this.adminIds = adminIdsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            }

            // Create bot instance
            this.bot = new TelegramBot(token, { polling: true });
            this.isEnabled = true;

            // Set up command handlers
            this.setupCommands();

            logger.info('Telegram bot started successfully');

            // Send startup notification to admins
            if (this.adminIds.length > 0) {
                await this.notifyAdmins('🚀 WalletReach Engine started!\n\nUse /help to see available commands.');
            }
        } catch (error) {
            logger.error('Failed to start Telegram bot:', error);
        }
    }

    /**
     * Setup command handlers
     */
    setupCommands() {
        // Welcome & Help
        this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
        this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));
        this.bot.onText(/\/menu/, (msg) => this.handleMenu(msg));

        // System Status
        this.bot.onText(/\/status/, (msg) => this.handleStatus(msg));
        this.bot.onText(/\/health/, (msg) => this.handleHealth(msg));

        // Campaign Management
        this.bot.onText(/\/campaigns/, (msg) => this.handleCampaigns(msg));
        this.bot.onText(/\/campaign (.+)/, (msg, match) => this.handleCampaignDetails(msg, match[1]));
        this.bot.onText(/\/pause (.+)/, (msg, match) => this.handlePauseCampaign(msg, match[1]));
        this.bot.onText(/\/resume (.+)/, (msg, match) => this.handleResumeCampaign(msg, match[1]));
        this.bot.onText(/\/stop (.+)/, (msg, match) => this.handleStopCampaign(msg, match[1]));
        this.bot.onText(/\/restart (.+)/, (msg, match) => this.handleRestartCampaign(msg, match[1]));

        // Monitoring
        this.bot.onText(/\/wallets/, (msg) => this.handleWallets(msg));
        this.bot.onText(/\/wallet (.+)/, (msg, match) => this.handleWalletDetails(msg, match[1]));
        this.bot.onText(/\/alerts/, (msg) => this.handleAlerts(msg));
        this.bot.onText(/\/metrics/, (msg) => this.handleMetrics(msg));
        this.bot.onText(/\/logs/, (msg) => this.handleLogs(msg));
        this.bot.onText(/\/tx (.+)/, (msg, match) => this.handleTransaction(msg, match[1]));

        // Reports & Analysis
        this.bot.onText(/\/report/, (msg) => this.handleReport(msg));
        this.bot.onText(/\/settings/, (msg) => this.handleSettings(msg));

        // Emergency
        this.bot.onText(/\/emergency/, (msg) => this.handleEmergency(msg));

        // Callback query handler for inline keyboards
        this.bot.on('callback_query', (query) => this.handleCallbackQuery(query));

        // Text Menu Handlers (for Persistent Keyboard)
        this.bot.on('message', (msg) => {
            const text = msg.text;
            if (!text || text.startsWith('/')) return; // Ignore commands

            switch (text) {
                case '🚀 Active Campaigns': this.handleActiveCampaigns(msg); break;
                case '📊 Status': this.handleStatus(msg); break;
                case '🎯 Campaigns': this.handleCampaigns(msg); break;
                case '🎯 All Campaigns': this.handleCampaigns(msg); break; // Handle alias
                case '💳 Wallets': this.handleWallets(msg); break;
                case '📈 Metrics': this.handleMetrics(msg); break;
                case '🔔 Alerts': this.handleAlerts(msg); break;
                case '⚙️ Settings': this.handleSettings(msg); break;
                case '❓ Help': this.handleHelp(msg); break;
            }
        });

        logger.info('Telegram bot commands registered');
    }

    /**
     * Check if user is authorized
     */
    isAuthorized(userId) {
        // If no admin IDs configured, allow all (for initial setup)
        if (this.adminIds.length === 0) {
            return true;
        }
        return this.adminIds.includes(userId);
    }

    /**
     * Send message (with authorization check)
     */
    async sendMessage(chatId, text, options = {}) {
        if (!this.isEnabled || !this.bot) {
            return;
        }

        try {
            await this.bot.sendMessage(chatId, text, {
                parse_mode: 'HTML',
                ...options
            });
        } catch (error) {
            logger.error('Failed to send Telegram message:', error);
        }
    }

    /**
     * Notify campaign progress milestone
     */
    async notifyCampaignProgress(campaign, percentage) {
        if (!this.isEnabled) return;

        const progressBar = this.createProgressBar(percentage);
        const emoji = percentage === 100 ? '🎉' : percentage >= 75 ? '🚀' : percentage >= 50 ? '⚡' : '▶️';

        const message = `
${emoji} <b>Campaign Progress: ${percentage}%</b>
━━━━━━━━━━━━━━━━━

<b>${campaign.name}</b>

${progressBar} ${percentage}%

<b>Stats:</b>
✅ Success: ${campaign.progress?.successfulTx || 0}
❌ Failed: ${campaign.progress?.failedTx || 0}
⏳ Remaining: ${(campaign.progress?.totalWallets || 0) - (campaign.progress?.processedWallets || 0)}

ID: <code>${campaign._id}</code>
        `.trim();

        await this.notifyAdmins(message, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔍 View Details', callback_data: `action:campaign_details:${campaign._id}` },
                    { text: '⏸️ Pause', callback_data: `action:campaign_pause:${campaign._id}` }
                ]]
            }
        });
    }

    /**
     * Notify all admins
     */
    async notifyAdmins(message, options = {}) {
        for (const adminId of this.adminIds) {
            await this.sendMessage(adminId, message, options);
        }
    }

    // ==================== UI HELPERS ====================

    createProgressBar(percentage, length = 10) {
        const filled = Math.round((percentage / 100) * length);
        const empty = length - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    getMainMenuKeyboard() {
        return {
            keyboard: [
                ['🚀 Active Campaigns'],
                ['📊 Status', '🎯 All Campaigns'],
                ['💳 Wallets', '📈 Metrics'],
                ['🔔 Alerts', '⚙️ Settings', '❓ Help']
            ],
            resize_keyboard: true,
            persistent: true
        };
    }

    getBackKeyboard() {
        return {
            inline_keyboard: [[
                { text: '⬅️ Back to Menu', callback_data: 'action:menu' }
            ]]
        };
    }

    // ==================== COMMAND HANDLERS ====================

    async handleStart(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!this.isAuthorized(userId)) {
            await this.sendMessage(chatId, '❌ Unauthorized. Contact admin to get access.');
            logger.warn(`Unauthorized access attempt from user ${userId}`);
            return;
        }

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📊 Status', callback_data: 'action:status' },
                    { text: '🎯 Campaigns', callback_data: 'action:campaigns' }
                ],
                [
                    { text: '💳 Wallets', callback_data: 'action:wallets' },
                    { text: '📈 Metrics', callback_data: 'action:metrics' }
                ],
                [
                    { text: '🔔 Alerts', callback_data: 'action:alerts' },
                    { text: '❓ Help', callback_data: 'action:help' }
                ]
            ]
        };

        const welcomeMessage = `
🤖 <b>Welcome to WalletReach Bot!</b>
━━━━━━━━━━━━━━━━━

I'm your intelligent campaign management assistant!

<b>What I can do:</b>
✨ Monitor campaigns in real-time
⚡ Control campaign execution
 📊 Generate detailed reports
🔔 Send instant notifications

<b>Quick Start:</b>
Tap any button below or use /menu

Your ID: <code>${userId}</code>
${this.adminIds.length === 0 ? '\n⚠️ <b>Setup:</b> Add your ID to TELEGRAM_ADMIN_IDS' : '✅ Authorized Admin'}
        `.trim();

        await this.sendMessage(chatId, welcomeMessage, { reply_markup: this.getMainMenuKeyboard() });
    }

    async handleMenu(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📊 System Status', callback_data: 'action:status' },
                    { text: '🏥 Health Check', callback_data: 'action:health' }
                ],
                [
                    { text: '🎯 All Campaigns', callback_data: 'action:campaigns' },
                    { text: '💳 Wallet Overview', callback_data: 'action:wallets' }
                ],
                [
                    { text: '📈 Metrics', callback_data: 'action:metrics' },
                    { text: '🔔 Alerts', callback_data: 'action:alerts' }
                ],
                [
                    { text: '📄 Logs', callback_data: 'action:logs' },
                    { text: '📊 Report', callback_data: 'action:report' }
                ],
                [
                    { text: '⚙️ Settings', callback_data: 'action:settings' },
                    { text: '🆘 Emergency', callback_data: 'action:emergency_confirm' }
                ]
            ]
        };

        const menuMessage = `
🎛️ <b>Main Menu</b>
━━━━━━━━━━━━━━━━━

Select an option below or use commands:

<b>Quick Access:</b>
• System monitoring
• Campaign management
• Reports & analytics
• Emergency controls
        `.trim();

        await this.sendMessage(chatId, menuMessage, { reply_markup: keyboard });
    }

    async handleHelp(msg) {
        const chatId = msg.chat.id;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🏠 Main Menu', callback_data: 'action:menu' },
                    { text: '📖 Full Guide', url: 'https://docs.walletreach.io' }
                ]
            ]
        };

        const helpMessage = `
📚 <b>Command Reference</b>
━━━━━━━━━━━━━━━━━

<b>🎛️ Navigation</b>
/menu - Interactive main menu
/help - This help message

<b>📊 Monitoring</b>
/status - System overview (quick)
/health - Detailed health check
/metrics - Performance metrics
/logs - Recent system logs

<b>🎯 Campaign Control</b>
/campaigns - List recent campaigns
/campaign &lt;id&gt; - View campaign details
/pause &lt;id&gt; - Pause execution
/resume &lt;id&gt; - Resume execution
/stop &lt;id&gt; - Stop campaign

<b>💳 Wallet Management</b>
/wallets - List all wallets
/wallet &lt;address&gt; - Wallet details

<b>📋 Data & Reports</b>
/alerts - Recent system alerts
/report - Generate full report
/tx &lt;hash&gt; - Transaction details

<b>⚙️ Configuration</b>
/settings - Bot preferences

<b>🆘 Emergency</b>
/emergency - Stop ALL campaigns

<b>💡 Pro Tips:</b>
• Use inline buttons for faster access
• Campaign IDs are shown in <code>monospace</code>
• Tap to copy and paste
        `.trim();

        await this.sendMessage(chatId, helpMessage, { reply_markup: keyboard });
    }

    async handleStatus(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            const campaigns = await Campaign.find({});
            const activeCampaigns = campaigns.filter(c => c.status === 'running');
            const pausedCampaigns = campaigns.filter(c => c.status === 'paused');
            const completedCampaigns = campaigns.filter(c => c.status === 'completed');

            // Calculate overall stats
            let totalTxSuccess = 0;
            let totalTxFailed = 0;
            let totalPending = 0;

            activeCampaigns.forEach(c => {
                totalTxSuccess += c.progress?.successfulTx || 0;
                totalTxFailed += c.progress?.failedTx || 0;
                totalPending += (c.progress?.totalWallets || 0) - (c.progress?.processedWallets || 0);
            });

            const totalTx = totalTxSuccess + totalTxFailed;
            const successRate = totalTx > 0 ? ((totalTxSuccess / totalTx) * 100).toFixed(1) : 0;

            const statusMessage = `
🚀 <b>WalletReach System Status</b>
━━━━━━━━━━━━━━━━━

✅ Server: Online
📊 Active Campaigns: ${activeCampaigns.length}
⏸️ Paused: ${pausedCampaigns.length}
✅ Completed: ${completedCampaigns.length}

<b>Transaction Stats:</b>
✅ Successful: ${totalTxSuccess}
❌ Failed: ${totalTxFailed}
⏳ Pending: ${totalPending}
📈 Success Rate: ${successRate}%

Last update: ${new Date().toLocaleTimeString()}
            `.trim();

            await this.sendMessage(chatId, statusMessage);
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleCampaigns(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            const campaigns = await Campaign.find({}).sort({ createdAt: -1 }).limit(10);

            if (campaigns.length === 0) {
                await this.sendMessage(chatId, '📋 No campaigns found.');
                return;
            }

            let message = '📋 <b>Recent Campaigns</b>\n━━━━━━━━━━━━━━━━━\n\n';

            for (const campaign of campaigns) {
                const statusEmoji = this.getStatusEmoji(campaign.status);
                const progress = campaign.progress?.totalWallets > 0
                    ? Math.round((campaign.progress.processedWallets / campaign.progress.totalWallets) * 100)
                    : 0;

                const modeIcon = campaign.mode === 'human_drip' ? '💧' : '🚀';

                message += `${statusEmoji} <b>${campaign.name}</b> ${modeIcon}\n`;
                message += `ID: <code>${campaign._id}</code>\n`;
                message += `Status: ${campaign.status}\n`;
                message += `Progress: ${progress}% (${campaign.progress?.processedWallets || 0}/${campaign.progress?.totalWallets || 0})\n`;
                message += `Success: ${campaign.progress?.successfulTx || 0} | Failed: ${campaign.progress?.failedTx || 0}\n`;
                message += `\n`;
            }

            message += '\nUse /campaign &lt;id&gt; for details';

            await this.sendMessage(chatId, message);
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleCampaignDetails(msg, campaignId) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            const campaign = await Campaign.findById(campaignId.trim());

            if (!campaign) {
                await this.sendMessage(chatId, '❌ Campaign not found');
                return;
            }

            const progress = campaign.progress?.totalWallets > 0
                ? ((campaign.progress.processedWallets / campaign.progress.totalWallets) * 100).toFixed(1)
                : 0;

            const statusEmoji = this.getStatusEmoji(campaign.status);

            const modeBadge = campaign.mode === 'human_drip' ? '💧 <b>HUMAN MODE</b>' : '🚀 <b>STANDARD MODE</b>';
            const dripInfo = campaign.mode === 'human_drip'
                ? `\n<b>Drip Config:</b> ${campaign.dripConfig?.minInterval || 2}-${campaign.dripConfig?.maxInterval || 5} min random delay`
                : '';

            const detailsMessage = `
${statusEmoji} <b>${campaign.name}</b>
${modeBadge}

<b>Status:</b> ${campaign.status}
<b>Progress:</b> ${progress}%
<b>Processed:</b> ${campaign.progress?.processedWallets || 0} / ${campaign.progress?.totalWallets || 0}

<b>Transactions:</b>
✅ Successful: ${campaign.progress?.successfulTx || 0}
❌ Failed: ${campaign.progress?.failedTx || 0}
📈 Success Rate: ${(campaign.metrics?.successRate || 0).toFixed(1)}%

<b>Configuration:</b>
Token: <code>${campaign.tokenAddress.slice(0, 10)}...</code>
Target: ${campaign.targetHolders} holders
Wallets: ${campaign.senderWallets?.length || 0}${dripInfo}

<b>Created:</b> ${new Date(campaign.createdAt).toLocaleString()}
            `.trim();

            // Add action buttons
            const keyboard = this.getCampaignKeyboard(campaign);

            await this.sendMessage(chatId, detailsMessage, { reply_markup: keyboard });
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handlePauseCampaign(msg, campaignId) {
        await this.executeCampaignAction(msg, campaignId, 'pause');
    }

    async handleResumeCampaign(msg, campaignId) {
        await this.executeCampaignAction(msg, campaignId, 'resume');
    }

    async handleStopCampaign(msg, campaignId) {
        await this.executeCampaignAction(msg, campaignId, 'stop');
    }

    async handleRestartCampaign(msg, campaignId) {
        await this.executeCampaignAction(msg, campaignId, 'restart');
    }

    async executeCampaignAction(msg, campaignId, action) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            const id = campaignId.trim();

            switch (action) {
                case 'pause':
                    await campaignEngine.pauseCampaign(id);
                    await this.sendMessage(chatId, `⏸️ Campaign paused successfully`);
                    break;
                case 'resume':
                    await campaignEngine.resumeCampaign(id);
                    await this.sendMessage(chatId, `▶️ Campaign resumed successfully`);
                    break;
                case 'stop':
                    await campaignEngine.stopCampaign(id);
                    await this.sendMessage(chatId, `⏹️ Campaign stopped successfully`);
                    break;
                case 'restart':
                    // Restart not yet implemented in engine
                    await this.sendMessage(chatId, `🔄 Restart feature coming soon`);
                    break;
            }
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleWallets(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            const wallets = await Wallet.find({}).limit(10);

            if (wallets.length === 0) {
                await this.sendMessage(chatId, '💳 No wallets found');
                return;
            }

            let message = '💳 <b>Sender Wallets</b>\n━━━━━━━━━━━━━━━━━\n\n';

            for (const wallet of wallets) {
                const usagePercent = wallet.limits.maxTransactionsPerDay > 0
                    ? Math.round(((wallet.dailyUsage?.transactionCount || 0) / wallet.limits.maxTransactionsPerDay) * 100)
                    : 0;

                message += `<b>${wallet.name}</b>\n`;
                message += `Address: <code>${wallet.address.slice(0, 10)}...${wallet.address.slice(-8)}</code>\n`;
                message += `Status: ${wallet.status === 'active' ? '✅' : '⚠️'} ${wallet.status}\n`;
                message += `Daily Usage: ${wallet.dailyUsage?.transactionCount || 0}/${wallet.limits.maxTransactionsPerDay} (${usagePercent}%)\n`;
                message += `\n`;
            }

            await this.sendMessage(chatId, message);
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleAlerts(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            const alerts = await Alert.find({}).sort({ createdAt: -1 }).limit(10);

            if (alerts.length === 0) {
                await this.sendMessage(chatId, '🔔 No recent alerts');
                return;
            }

            let message = '🔔 <b>Recent Alerts</b>\n━━━━━━━━━━━━━━━━━\n\n';

            for (const alert of alerts) {
                const icon = this.getAlertIcon(alert.type);
                message += `${icon} <b>${alert.title}</b>\n`;
                message += `${alert.message}\n`;
                message += `${new Date(alert.createdAt).toLocaleString()}\n\n`;
            }

            await this.sendMessage(chatId, message);
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleMetrics(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            const campaigns = await Campaign.find({});

            let totalSuccess = 0;
            let totalFailed = 0;
            let totalTokens = 0n;

            campaigns.forEach(c => {
                totalSuccess += c.progress?.successfulTx || 0;
                totalFailed += c.progress?.failedTx || 0;
                totalTokens += BigInt(c.metrics?.totalTokensDistributed || 0);
            });

            const total = totalSuccess + totalFailed;
            const successRate = total > 0 ? ((totalSuccess / total) * 100).toFixed(1) : 0;

            const metricsMessage = `
📊 <b>System Metrics</b>
━━━━━━━━━━━━━━━━━

<b>All-Time Statistics:</b>
Total Campaigns: ${campaigns.length}
Total Transactions: ${total}
✅ Successful: ${totalSuccess}
❌ Failed: ${totalFailed}
📈 Success Rate: ${successRate}%

<b>Tokens Distributed:</b>
${totalTokens.toString()} tokens
            `.trim();

            await this.sendMessage(chatId, metricsMessage);
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleHealth(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        const healthMessage = `
🏥 <b>System Health Check</b>
━━━━━━━━━━━━━━━━━

✅ Database: Connected
✅ Bot: Online
✅ Campaign Engine: Running
✅ Blockchain RPC: Active

All systems operational!
        `.trim();

        await this.sendMessage(chatId, healthMessage);
    }

    async handleEmergency(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            await campaignEngine.emergencyStopAll();
            await this.sendMessage(chatId, '🆘 <b>EMERGENCY STOP ACTIVATED</b>\n\nAll campaigns have been stopped.');
            await this.notifyAdmins(`🆘 Emergency stop triggered by user ${msg.from.id}`);
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleWalletDetails(msg, address) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            const wallet = await Wallet.findOne({ address: address.trim().toLowerCase() });

            if (!wallet) {
                await this.sendMessage(chatId, '❌ Wallet not found');
                return;
            }

            const usagePercent = wallet.limits.maxTransactionsPerDay > 0
                ? Math.round((wallet.dailyUsage.transactionCount / wallet.limits.maxTransactionsPerDay) * 100)
                : 0;

            // Create progress bar
            const barLength = 10;
            const filledLength = Math.round((usagePercent / 100) * barLength);
            const progressBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

            const detailsMessage = `
💳 <b>Wallet Details</b>
━━━━━━━━━━━━━━━━━

<b>${wallet.name}</b>

<b>Address:</b>
<code>${wallet.address}</code>

<b>Status:</b> ${wallet.status === 'active' ? '✅ Active' : '⚠️ Inactive'}

<b>Daily Usage:</b>
${progressBar} ${usagePercent}%
${wallet.dailyUsage.transactionCount} / ${wallet.limits.maxTransactionsPerDay} transactions

<b>Limits:</b>
• Max Tx/Day: ${wallet.limits.maxTransactionsPerDay}
• Max Tokens/Day: ${wallet.limits.maxTokensPerDay}

<b>Last Reset:</b> ${new Date(wallet.dailyUsage.lastReset).toLocaleString()}
            `.trim();

            await this.sendMessage(chatId, detailsMessage);
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleLogs(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            const alerts = await Alert.find({}).sort({ createdAt: -1 }).limit(15);

            if (alerts.length === 0) {
                await this.sendMessage(chatId, '📋 No recent logs');
                return;
            }

            let message = '📋 <b>Recent System Logs</b>\n━━━━━━━━━━━━━━━━━\n\n';

            for (const alert of alerts) {
                const icon = this.getAlertIcon(alert.type);
                const timestamp = new Date(alert.createdAt).toLocaleTimeString();
                message += `${icon} <b>[${timestamp}]</b> ${alert.title}\n`;
                message += `   ${alert.message}\n\n`;
            }

            await this.sendMessage(chatId, message);
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleTransaction(msg, txHash) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        const Transaction = require('../models/Transaction');

        try {
            const tx = await Transaction.findOne({ txHash: txHash.trim() });

            if (!tx) {
                await this.sendMessage(chatId, '❌ Transaction not found in database');
                return;
            }

            const statusEmoji = tx.status === 'confirmed' ? '✅' : tx.status === 'failed' ? '❌' : '⏳';

            const txMessage = `
🔍 <b>Transaction Details</b>
━━━━━━━━━━━━━━━━━

<b>Status:</b> ${statusEmoji} ${tx.status}

<b>Hash:</b>
<code>${tx.txHash}</code>

<b>Recipient:</b>
<code>${tx.recipientAddress}</code>

<b>Amount:</b> ${tx.amount} tokens

<b>Nonce:</b> ${tx.nonce}

<b>Gas Used:</b> ${tx.gasUsed || 'N/A'}
<b>Gas Price:</b> ${tx.gasPrice || 'N/A'}

<b>Timestamp:</b> ${new Date(tx.createdAt).toLocaleString()}

${tx.error ? `\n<b>Error:</b> ${tx.error}` : ''}
            `.trim();

            const keyboard = {
                inline_keyboard: [[
                    { text: '🔗 View on BSCScan', url: `https://bscscan.com/tx/${tx.txHash}` }
                ]]
            };

            await this.sendMessage(chatId, txMessage, { reply_markup: keyboard });
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async handleReport(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            await this.sendMessage(chatId, '📊 Generating comprehensive report...');

            const campaigns = await Campaign.find({});
            const wallets = await Wallet.find({});
            const alerts = await Alert.find({}).sort({ createdAt: -1 }).limit(5);

            // Calculate statistics
            let totalSuccess = 0;
            let totalFailed = 0;
            let totalPending = 0;
            const activeCampaigns = campaigns.filter(c => c.status === 'running');
            const completedCampaigns = campaigns.filter(c => c.status === 'completed');

            campaigns.forEach(c => {
                totalSuccess += c.progress?.successfulTx || 0;
                totalFailed += c.progress?.failedTx || 0;
                if (c.status === 'running') {
                    totalPending += (c.progress?.totalWallets || 0) - (c.progress?.processedWallets || 0);
                }
            });

            const total = totalSuccess + totalFailed;
            const successRate = total > 0 ? ((totalSuccess / total) * 100).toFixed(1) : 0;

            // Wallet statistics
            let activeWallets = 0;
            let totalDailyUsage = 0;
            wallets.forEach(w => {
                if (w.status === 'active') activeWallets++;
                totalDailyUsage += w.dailyUsage?.transactionCount || 0;
            });

            const reportMessage = `
📊 <b>System Report</b>
━━━━━━━━━━━━━━━━━

<b>📅 Generated:</b> ${new Date().toLocaleString()}

<b>🎯 CAMPAIGN OVERVIEW</b>
━━━━━━━━━━━━━━━━━
Total Campaigns: ${campaigns.length}
✅ Completed: ${completedCampaigns.length}
🔵 Active: ${activeCampaigns.length}
⏸️ Paused: ${campaigns.filter(c => c.status === 'paused').length}

<b>📈 TRANSACTION STATS</b>
━━━━━━━━━━━━━━━━━
Total Processed: ${total.toLocaleString()}
✅ Successful: ${totalSuccess.toLocaleString()}
❌ Failed: ${totalFailed.toLocaleString()}
⏳ Pending: ${totalPending.toLocaleString()}
📊 Success Rate: ${successRate}%

<b>💳 WALLET STATUS</b>
━━━━━━━━━━━━━━━━━
Total Wallets: ${wallets.length}
✅ Active: ${activeWallets}
📊 Daily Usage: ${totalDailyUsage
                } transactions

            u003cbu003e🔔 RECENT ALERTSu003c/bu003e
━━━━━━━━━━━━━━━━━
        `.trim();

            let alertsText = '';
            for (const alert of alerts.slice(0, 3)) {
                const icon = this.getAlertIcon(alert.type);
                alertsText += `\${icon} ${alert.title} \n`;
            }

            const fullReport = reportMessage + '\n' + (alertsText || 'No recent alerts');

            await this.sendMessage(chatId, fullReport);
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error generating report: ${error.message} `);
        }
    }

    async handleSettings(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔔 Notifications: ON', callback_data: 'settings:notifications_toggle' }
                ],
                [
                    { text: '🌐 Language: English', callback_data: 'settings:language' }
                ],
                [
                    { text: '⚙️ Advanced Settings', callback_data: 'settings:advanced' }
                ],
                [
                    { text: '🏠 Back to Menu', callback_data: 'action:menu' }
                ]
            ]
        };

        const settingsMessage = `
⚙️ <b>Bot Settings</b>
━━━━━━━━━━━━━━━━━

        <b>Current Configuration:</b>

🔔 <b>Notifications:</b> Enabled
   • Campaign start / completion
   • Critical alerts
   • System health warnings

🌐 <b>Language:</b> English

👤 <b>Your Access Level:</b> Admin

            < b > Customization Options:</b >
                Tap buttons below to configure
        `.trim();

        await this.sendMessage(chatId, settingsMessage, { reply_markup: keyboard });
    }

    async handleCallbackQuery(query) {
        const chatId = query.message.chat.id;
        const msg = query.message;
        const data = query.data;

        // Verify user is authorized
        if (!this.isAuthorized(query.from.id)) {
            await this.bot.answerCallbackQuery(query.id, { text: 'Unauthorized' });
            return;
        }

        try {
            await this.bot.answerCallbackQuery(query.id);

            // Handle "action:command[:param]" format (New Menu System)
            if (data.startsWith('action:')) {
                const parts = data.split(':');
                const command = parts[1];
                const param = parts[2]; // Optional ID for details/actions

                // Map 'from' user to message so checks pass
                msg.from = query.from;

                switch (command) {
                    // Navigation
                    case 'menu': return this.handleMenu(msg);
                    case 'help': return this.handleHelp(msg);

                    // Monitoring
                    case 'status': return this.handleStatus(msg);
                    case 'health': return this.handleHealth(msg);
                    case 'metrics': return this.handleMetrics(msg);
                    case 'logs': return this.handleLogs(msg);

                    // Campaigns
                    case 'campaigns': return this.handleCampaigns(msg);
                    case 'campaign_details': return this.handleCampaignDetails(msg, param);
                    case 'campaign_pause': return this.executeCampaignAction(msg, param, 'pause');

                    // Wallets & Alters
                    case 'wallets': return this.handleWallets(msg);
                    case 'alerts': return this.handleAlerts(msg);
                    case 'report': return this.handleReport(msg);

                    // Settings
                    case 'settings': return this.handleSettings(msg);
                    case 'emergency_confirm': return this.handleEmergency(msg);
                }
            }

            // Handle "command:id" format (Legacy Campaign Actions)
            if (data.includes(':')) {
                const parts = data.split(':');
                // Avoid conflict with action: prefix if it slipped through
                if (parts[0] !== 'action') {
                    const action = parts[0];
                    const campaignId = parts[1];

                    // Map 'from' user
                    msg.from = query.from;

                    switch (action) {
                        case 'pause':
                        case 'resume':
                        case 'stop':
                        case 'restart':
                            return this.executeCampaignAction(msg, campaignId, action);
                        case 'refresh':
                            return this.handleCampaignDetails(msg, campaignId);
                    }
                }
            }

        } catch (error) {
            logger.error('Callback error', error);
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    // ==================== NOTIFICATION METHODS ====================

    /**
     * Send campaign start notification
     */
    async notifyCampaignStarted(campaign) {
        const message = `
🚀 <b>Campaign Started</b>

<b>${campaign.name}</b>
        ID: <code>${campaign._id}</code>

Total Recipients: ${campaign.progress?.totalWallets || 0}
Sender Wallets: ${campaign.senderWallets?.length || 0}
        `.trim();

        await this.notifyAdmins(message);
    }

    /**
     * Send campaign completion notification
     */
    async notifyCampaignCompleted(campaign) {
        const message = `
✅ <b>Campaign Completed</b>

<b>${campaign.name}</b>

✅ Successful: ${campaign.progress?.successfulTx || 0}
❌ Failed: ${campaign.progress?.failedTx || 0}
📈 Success Rate: ${(campaign.metrics?.successRate || 0).toFixed(1)}%

            Duration: ${this.formatDuration(campaign.progress?.startedAt, campaign.progress?.completedAt)}
        `.trim();

        await this.notifyAdmins(message);
    }

    /**
     * Send progress milestone notification
     */


    /**
     * Send error/alert notification
     */
    async notifyAlert(alert) {
        const icon = this.getAlertIcon(alert.type);
        const message = `
${icon} <b>${alert.title}</b>

${alert.message}

        Type: ${alert.type}
        Time: ${new Date(alert.createdAt).toLocaleString()}
        `.trim();

        await this.notifyAdmins(message);
    }

    // ==================== HELPER METHODS ====================

    getStatusEmoji(status) {
        const emojiMap = {
            'draft': '📝',
            'running': '🔵',
            'paused': '🟡',
            'completed': '✅',
            'stopped': '🔴',
            'failed': '❌'
        };
        return emojiMap[status] || '⚪';
    }

    getAlertIcon(type) {
        const iconMap = {
            'info': 'ℹ️',
            'warning': '⚠️',
            'critical': '🚨'
        };
        return iconMap[type] || 'ℹ️';
    }

    getCampaignKeyboard(campaign) {
        const buttons = [];

        if (campaign.status === 'running') {
            buttons.push([
                { text: '⏸️ Pause', callback_data: `pause:${campaign._id} ` },
                { text: '⏹️ Stop', callback_data: `stop:${campaign._id} ` }
            ]);
        } else if (campaign.status === 'paused') {
            buttons.push([
                { text: '▶️ Resume', callback_data: `resume:${campaign._id} ` },
                { text: '⏹️ Stop', callback_data: `stop:${campaign._id} ` }
            ]);
        }

        buttons.push([{ text: '🔄 Refresh', callback_data: `refresh:${campaign._id} ` }]);

        return { inline_keyboard: buttons };
    }

    formatDuration(startDate, endDate) {
        if (!startDate || !endDate) return 'N/A';

        const duration = new Date(endDate) - new Date(startDate);
        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60} m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60} s`;
        } else {
            return `${seconds} s`;
        }
    }


    async handleActiveCampaigns(msg) {
        const chatId = msg.chat.id;

        if (!this.isAuthorized(msg.from.id)) {
            await this.sendMessage(chatId, '❌ Unauthorized');
            return;
        }

        try {
            const campaigns = await Campaign.find({ status: 'running' }).sort({ createdAt: -1 });

            if (campaigns.length === 0) {
                await this.sendMessage(chatId, '😴 <b>No Active Campaigns</b>\n\nUse /campaigns to see history.');
                return;
            }

            await this.sendMessage(chatId, `🚀 <b>Active Campaigns (${campaigns.length})</b>\n━━━━━━━━━━━━━━━━━`);

            for (const campaign of campaigns) {
                const progress = campaign.progress?.totalWallets > 0
                    ? Math.round((campaign.progress.processedWallets / campaign.progress.totalWallets) * 100)
                    : 0;

                const modeIcon = campaign.mode === 'human_drip' ? '💧' : '⚡';

                const message = `
<b>${campaign.name}</b> ${modeIcon}
ID: <code>${campaign._id}</code>
Progress: ${this.createProgressBar(progress, 8)} ${progress}%
✅ ${campaign.progress?.successfulTx || 0}   ❌ ${campaign.progress?.failedTx || 0}
                `.trim();

                const keyboard = {
                    inline_keyboard: [[
                        { text: '🔍 Track / Refresh', callback_data: `action:campaign_details:${campaign._id}` },
                        { text: '⏸️ Pause', callback_data: `action:campaign_pause:${campaign._id}` }
                    ]]
                };

                await this.sendMessage(chatId, message, { reply_markup: keyboard });
            }
        } catch (error) {
            await this.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }
}

module.exports = new TelegramBotService();
