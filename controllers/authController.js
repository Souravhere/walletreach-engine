const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

/**
 * Login user
 */
const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user by username or email
        const user = await User.findOne({
            $or: [
                { username: username },
                { email: username.toLowerCase() }
            ]
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if account is locked
        if (user.isLocked) {
            return res.status(401).json({ error: 'Account is locked. Contact administrator.' });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(401).json({ error: 'Account is inactive' });
        }

        // Verify password
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            // Increment login attempts
            await user.incrementLoginAttempts();

            return res.status(401).json({
                error: 'Invalid credentials',
                attemptsRemaining: Math.max(0, 5 - user.loginAttempts)
            });
        }

        // Reset login attempts on successful login
        await user.resetLoginAttempts();

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.WALLETREACH_JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Create audit log
        await AuditLog.create({
            user: user._id,
            action: 'user_login',
            resourceType: 'user',
            resource: user._id.toString(),
            ipAddress: req.ip || req.connection.remoteAddress,
        });

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
};

/**
 * Get current user info
 */
const me = async (req, res) => {
    try {
        res.json({
            user: {
                id: req.user._id,
                username: req.user.username,
                email: req.user.email,
                role: req.user.role,
            },
        });
    } catch (error) {
        console.error('Me error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
};

module.exports = {
    login,
    me,
};
