const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config/env');

/**
 * Timing-Safe HMAC SHA-256 GitHub Webhook Verification Middleware
 */
const verifyGithubSignature = (req, res, next) => {
  const secret = config.GITHUB_WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET;

  // If no secret is configured, bypass verification (useful for local testing)
  if (!secret) {
    logger.warn('GITHUB_WEBHOOK_SECRET is not configured. Bypassing webhook signature check.');
    return next();
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return res.status(401).json({ error: 'No signature header found (x-hub-signature-256)' });
  }

  if (!req.rawBody) {
    return res.status(400).json({ error: 'Missing raw request body for verification' });
  }

  try {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = Buffer.from('sha256=' + hmac.update(req.rawBody).digest('hex'), 'utf8');
    const checksum = Buffer.from(signature, 'utf8');

    if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
      logger.warn('Webhook HMAC signature verification failed.');
      return res.status(401).json({ error: 'Invalid signature. Verification failed.' });
    }

    next();
  } catch (error) {
    logger.error('Signature verification error:', error);
    return res.status(500).json({ error: 'Internal signature verification error' });
  }
};

module.exports = verifyGithubSignature;
