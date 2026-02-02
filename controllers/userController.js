const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

/**
 * Create user (Super Admin only)
 */
const createUser = async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ username }, { email: email.toLowerCase() }]
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Create user
        const user = await User.create({
            username,
            email: email.toLowerCase(),
            password,
            role: role || 'operator',
            createdBy: req.user._id,
        });

        // Create audit log
        await AuditLog.create({
            user: req.user._id,
            action: 'user_created',
            resourceType: 'user',
            resource: user._id.toString(),
            details: { username, email, role: user.role },
            ipAddress: req.ip,
        });

        res.status(201).json({ user });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
};

/**
 * List users
 */
const getUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select('-password')
            .populate('createdBy', 'username')
            .sort({ createdAt: -1 });

        res.json({ users });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
};

/**
 * Get user by ID
 */
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password')
            .populate('createdBy', 'username');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
};

/**
 * Update user
 */
const updateUser = async (req, res) => {
    try {
        const { role, isActive, isLocked } = req.body;

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update fields
        if (role !== undefined) user.role = role;
        if (isActive !== undefined) user.isActive = isActive;
        if (isLocked !== undefined) {
            user.isLocked = isLocked;
            if (!isLocked) {
                user.loginAttempts = 0; // Reset attempts when unlocking
            }
        }

        await user.save();

        // Create audit log
        await AuditLog.create({
            user: req.user._id,
            action: 'user_updated',
            resourceType: 'user',
            resource: user._id.toString(),
            details: { role, isActive, isLocked },
            ipAddress: req.ip,
        });

        res.json({ user });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
};

/**
 * Delete user
 */
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent deleting yourself
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await User.findByIdAndDelete(req.params.id);

        // Create audit log
        await AuditLog.create({
            user: req.user._id,
            action: 'user_deleted',
            resourceType: 'user',
            resource: user._id.toString(),
            details: { username: user.username },
            ipAddress: req.ip,
        });

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
};

module.exports = {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
};
