const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Log levels
 */
const LogLevel = {
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    DEBUG: 'DEBUG',
};

/**
 * Write log to file and console
 */
const writeLog = (level, message, context = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...context,
    };

    // Console output
    const consoleMessage = `[${timestamp}] ${level}: ${message}`;
    switch (level) {
        case LogLevel.ERROR:
            console.error(consoleMessage, context);
            break;
        case LogLevel.WARN:
            console.warn(consoleMessage, context);
            break;
        default:
            console.log(consoleMessage, context);
    }

    // File output (optional, for production)
    if (process.env.NODE_ENV === 'production') {
        const logFile = path.join(logsDir, `${level.toLowerCase()}.log`);
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    }
};

/**
 * Logger functions
 */
const logger = {
    info: (message, context) => writeLog(LogLevel.INFO, message, context),
    warn: (message, context) => writeLog(LogLevel.WARN, message, context),
    error: (message, context) => writeLog(LogLevel.ERROR, message, context),
    debug: (message, context) => writeLog(LogLevel.DEBUG, message, context),
};

module.exports = logger;
