const express = require('express');
const webhooksController = require('../controllers/webhooksController');
const verifyGithubSignature = require('../middleware/webhookSignature');

const router = express.Router();

router.post('/github', verifyGithubSignature, webhooksController.handleGithubWebhook.bind(webhooksController));

module.exports = router;
