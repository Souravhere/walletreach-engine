const si = require('systeminformation');
const mongoose = require('mongoose');

/**
 * Get comprehensive system statistics
 */
const getSystemStats = async (req, res) => {
    try {
        // Collect all system information in parallel
        const [
            osInfo,
            cpuInfo,
            cpuCurrentSpeed,
            cpuTemperature,
            currentLoad,
            mem,
            fsSize,
            fsStats,
            networkStats,
            processes,
            networkInterfaces
        ] = await Promise.all([
            si.osInfo(),
            si.cpu(),
            si.cpuCurrentSpeed(),
            si.cpuTemperature().catch(() => ({ main: null })), // Temperature may not be available
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.fsStats(),
            si.networkStats(),
            si.processes(),
            si.networkInterfaces()
        ]);

        // Get PM2 process list if available
        let pm2Processes = [];
        try {
            const pm2 = require('pm2');
            pm2Processes = await new Promise((resolve) => {
                pm2.connect((err) => {
                    if (err) {
                        resolve([]);
                        return;
                    }
                    pm2.list((err, list) => {
                        pm2.disconnect();
                        resolve(err ? [] : list);
                    });
                });
            });
        } catch (error) {
            // PM2 not available
        }

        // Calculate load average
        const loadAverage = osInfo.platform === 'linux' || osInfo.platform === 'darwin'
            ? await si.currentLoad().then(load => [load.avgLoad, load.avgLoad, load.avgLoad])
            : [0, 0, 0];

        // Get public IP (this is a simple approach, may need external service for accurate public IP)
        const publicIP = networkInterfaces.find(iface => !iface.internal && iface.ip4)?.ip4 || 'N/A';
        const privateIP = networkInterfaces.find(iface => iface.internal && iface.ip4)?.ip4 || '127.0.0.1';

        // Database connection status
        const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

        // RPC status (simplified check)
        let rpcStatus = 'unknown';
        try {
            const { provider } = require('../config/blockchain');
            const blockNumber = await provider.getBlockNumber();
            rpcStatus = blockNumber > 0 ? 'connected' : 'disconnected';
        } catch (error) {
            rpcStatus = 'disconnected';
        }

        // Format disk stats
        const mainDisk = fsSize[0] || {};
        const diskStats = fsStats || {};

        // Get top processes by CPU and RAM
        const topProcesses = processes.list
            .sort((a, b) => b.cpu - a.cpu)
            .slice(0, 5)
            .map(p => ({ name: p.name, cpu: p.cpu.toFixed(1), mem: p.mem.toFixed(1) }));

        const topMemoryProcesses = processes.list
            .sort((a, b) => b.mem - a.mem)
            .slice(0, 5)
            .map(p => ({ name: p.name, cpu: p.cpu.toFixed(1), mem: p.mem.toFixed(1) }));

        // Network traffic
        const networkTraffic = networkStats[0] || {};

        res.json({
            system: {
                hostname: osInfo.hostname,
                platform: osInfo.platform,
                distro: osInfo.distro,
                release: osInfo.release,
                kernel: osInfo.kernel,
                arch: osInfo.arch,
                uptime: osInfo.uptime,
                time: new Date().toISOString()
            },
            cpu: {
                model: cpuInfo.manufacturer + ' ' + cpuInfo.brand,
                cores: cpuInfo.cores,
                physicalCores: cpuInfo.physicalCores,
                usage: currentLoad.currentLoad.toFixed(2),
                loadAverage: loadAverage,
                frequency: cpuCurrentSpeed.avg,
                temperature: cpuTemperature.main
            },
            memory: {
                total: mem.total,
                used: mem.used,
                free: mem.free,
                usagePercent: ((mem.used / mem.total) * 100).toFixed(2),
                swap: {
                    total: mem.swaptotal,
                    used: mem.swapused,
                    free: mem.swapfree
                }
            },
            disk: {
                total: mainDisk.size || 0,
                used: mainDisk.used || 0,
                free: mainDisk.available || 0,
                usagePercent: mainDisk.use || 0,
                readSpeed: diskStats.rx_sec || 0,
                writeSpeed: diskStats.wx_sec || 0,
                fs: mainDisk.fs || 'N/A',
                mount: mainDisk.mount || 'N/A'
            },
            network: {
                publicIP,
                privateIP,
                traffic: {
                    sent: networkTraffic.tx_bytes || 0,
                    received: networkTraffic.rx_bytes || 0,
                    sentSec: networkTraffic.tx_sec || 0,
                    receivedSec: networkTraffic.rx_sec || 0
                },
                interface: networkTraffic.iface || 'N/A'
            },
            processes: {
                running: processes.running,
                blocked: processes.blocked,
                sleeping: processes.sleeping,
                total: processes.all,
                topCPU: topProcesses,
                topMemory: topMemoryProcesses
            },
            application: {
                dbStatus,
                rpcStatus,
                pm2Processes: pm2Processes.map(p => ({
                    name: p.name,
                    status: p.pm2_env.status,
                    uptime: p.pm2_env.pm_uptime,
                    cpu: p.monit.cpu,
                    memory: p.monit.memory,
                    restarts: p.pm2_env.restart_time
                })),
                nodeVersion: process.version,
                env: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        console.error('Get system stats error:', error);
        res.status(500).json({ error: 'Failed to get system stats', details: error.message });
    }
};

/**
 * Get real-time metrics (lighter version for polling)
 */
const getRealTimeMetrics = async (req, res) => {
    try {
        const [currentLoad, mem, fsStats, networkStats] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsStats(),
            si.networkStats()
        ]);

        const networkTraffic = networkStats[0] || {};

        res.json({
            cpu: {
                usage: currentLoad.currentLoad.toFixed(2),
                cores: currentLoad.cpus.map(cpu => cpu.load.toFixed(2))
            },
            memory: {
                used: mem.used,
                usagePercent: ((mem.used / mem.total) * 100).toFixed(2)
            },
            disk: {
                readSpeed: fsStats.rx_sec || 0,
                writeSpeed: fsStats.wx_sec || 0
            },
            network: {
                sentSec: networkTraffic.tx_sec || 0,
                receivedSec: networkTraffic.rx_sec || 0
            },
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Get realtime metrics error:', error);
        res.status(500).json({ error: 'Failed to get realtime metrics' });
    }
};

module.exports = {
    getSystemStats,
    getRealTimeMetrics
};
