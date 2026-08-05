const pool = require('../db');

class RepositoryRepository {
  async findByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM repositories WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async findByIdAndUserId(repoId, userId) {
    const result = await pool.query(
      'SELECT id, name, github_url FROM repositories WHERE id = $1 AND user_id = $2',
      [repoId, userId]
    );
    return result.rows[0] || null;
  }

  async create(name, githubUrl, userId) {
    const result = await pool.query(
      'INSERT INTO repositories (name, github_url, user_id) VALUES ($1, $2, $3) RETURNING *',
      [name, githubUrl, userId]
    );
    return result.rows[0];
  }

  async deleteByIdAndUserId(repoId, userId) {
    const deleteResult = await pool.query(
      'DELETE FROM repositories WHERE id = $1 AND user_id = $2 RETURNING *',
      [repoId, userId]
    );
    return deleteResult.rows[0] || null;
  }
}

module.exports = new RepositoryRepository();
