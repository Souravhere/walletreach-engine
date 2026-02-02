const express = require('express');
const router = express.Router();
const { login, me } = require('../controllers/authController');
const { loginLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');

// Login (with rate limiting)
router.post('/login', loginLimiter, login);

// Get current user
router.get('/me', authenticate, me);

module.exports = router;
