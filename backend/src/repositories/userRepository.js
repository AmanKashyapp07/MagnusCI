const pool = require('../db');

class UserRepository {
  async findByGithubId(githubId) {
    const res = await pool.query('SELECT id FROM users WHERE github_id = $1', [githubId]);
    return res.rows[0] || null;
  }

  async findById(userId) {
    const res = await pool.query('SELECT id, username, avatar_url, access_token FROM users WHERE id = $1', [userId]);
    return res.rows[0] || null;
  }

  async createUser(githubId, username, avatarUrl, accessToken) {
    const res = await pool.query(
      'INSERT INTO users (github_id, username, avatar_url, access_token) VALUES ($1, $2, $3, $4) RETURNING id',
      [githubId, username, avatarUrl, accessToken]
    );
    return res.rows[0].id;
  }

  async updateUser(userId, username, avatarUrl, accessToken) {
    await pool.query(
      'UPDATE users SET username = $1, avatar_url = $2, access_token = COALESCE($3, access_token) WHERE id = $4',
      [username, avatarUrl, accessToken, userId]
    );
  }
}

module.exports = new UserRepository();
