const pool = require('../db');

class UserService {
  async findOrCreateUserByGithubId(githubId, username, avatarUrl, accessToken = null) {
    const existingUser = await pool.query('SELECT id FROM users WHERE github_id = $1', [githubId]);

    if (existingUser.rows.length > 0) {
      const userId = existingUser.rows[0].id;
      await pool.query(
        'UPDATE users SET username = $1, avatar_url = $2, access_token = COALESCE($3, access_token) WHERE id = $4',
        [username, avatarUrl, accessToken, userId]
      );
      return userId;
    }

    const newUser = await pool.query(
      'INSERT INTO users (github_id, username, avatar_url, access_token) VALUES ($1, $2, $3, $4) RETURNING id',
      [githubId, username, avatarUrl, accessToken]
    );
    return newUser.rows[0].id;
  }

  async getUserById(userId) {
    const result = await pool.query('SELECT id, username, avatar_url FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  }
}

module.exports = new UserService();
