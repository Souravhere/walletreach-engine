const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
} = require('../controllers/userController');

// All routes require authentication
router.use(authenticate);

// Super Admin only routes
router.post('/', requireSuperAdmin, createUser);
router.get('/', requireSuperAdmin, getUsers);
router.get('/:id', requireSuperAdmin, getUserById);
router.put('/:id', requireSuperAdmin, updateUser);
router.delete('/:id', requireSuperAdmin, deleteUser);

module.exports = router;
