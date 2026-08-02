const express = require('express');
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/github', authController.initiateGithubLogin.bind(authController));
router.get('/github/callback', authController.handleGithubCallback.bind(authController));
router.get('/me', authenticateToken, authController.getProfile.bind(authController));

module.exports = router;
