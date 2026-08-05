const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../utils/logger');
const userService = require('../services/userService');

class AuthController {
  initiateGithubLogin(req, res) {
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${config.GITHUB_CLIENT_ID}&scope=repo%20admin:repo_hook%20repo:status%20read:user`;
    res.redirect(githubAuthUrl);
  }

  async handleGithubCallback(req, res, next) {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Missing OAuth authorization code' });
    }

    try {
      // 1. Exchange OAuth code for Access Token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: config.GITHUB_CLIENT_ID,
          client_secret: config.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        logger.error('GitHub access token exchange error:', tokenData.error_description);
        return res.status(400).json({ error: tokenData.error_description });
      }

      const accessToken = tokenData.access_token;

      // 2. Retrieve user details using the access token
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${accessToken}`,
          'User-Agent': 'CI-CD-Engine-Backend',
        },
      });

      const userData = await userResponse.json();
      const githubId = String(userData.id);
      const username = userData.login;
      const avatarUrl = userData.avatar_url;

      // 3. Find or create user in PostgreSQL
      const userId = await userService.findOrCreateUserByGithubId(githubId, username, avatarUrl, accessToken);

      // 4. Generate JWT Session Token
      const jwtToken = jwt.sign({ id: userId, username }, config.JWT_SECRET, {
        expiresIn: '7d',
      });

      // 5. Redirect back to frontend dashboard with token
      res.redirect(`${config.FRONTEND_URL}?token=${jwtToken}`);
    } catch (error) {
      next(error);
    }
  }

  getProfile(req, res) {
    res.json({
      id: req.user.id,
      username: req.user.username,
      avatar_url: req.user.avatar_url,
    });
  }
}

module.exports = new AuthController();
