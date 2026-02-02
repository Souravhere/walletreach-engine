const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const decoded = jwt.verify(token, process.env.WALLETREACH_JWT_SECRET);

        // Get user from database
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: 'Invalid token - user not found' });
        }

        if (!user.isActive) {
            return res.status(401).json({ error: 'Account is inactive' });
        }

        if (user.isLocked) {
            return res.status(401).json({ error: 'Account is locked' });
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }

        console.error('Authentication error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
    }
};

/**
 * Require Super Admin role
 */
const requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Super Admin access required' });
    }

    next();
};

/**
 * Require Operator role or higher
 */
const requireOperator = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    if (req.user.role !== 'operator' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Operator access required' });
    }

    next();
};

module.exports = {
    authenticate,
    requireSuperAdmin,
    requireOperator,
};
