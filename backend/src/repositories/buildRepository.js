const pool = require('../db');

class BuildRepository {
  async findByUserId(userId) {
    const result = await pool.query(
      `SELECT b.*, r.name as repository_name 
       FROM builds b 
       JOIN repositories r ON b.repository_id = r.id 
       WHERE r.user_id = $1 
       ORDER BY b.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async findByIdAndUserId(buildId, userId) {
    const buildResult = await pool.query(
      `SELECT b.*, r.name as repository_name 
       FROM builds b 
       JOIN repositories r ON b.repository_id = r.id 
       WHERE b.id = $1 AND r.user_id = $2`,
      [buildId, userId]
    );
    return buildResult.rows[0] || null;
  }

  async findLatestCommitHash(repositoryId) {
    const result = await pool.query(
      `SELECT commit_hash
       FROM builds
       WHERE repository_id = $1 AND commit_hash IS NOT NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [repositoryId]
    );
    return result.rows[0]?.commit_hash || null;
  }

  async findLogsByBuildId(buildId) {
    const logResult = await pool.query(
      'SELECT log_message FROM build_logs WHERE build_id = $1',
      [buildId]
    );
    return logResult.rows[0]?.log_message || '';
  }

  async saveLogs(buildId, logs) {
    const res = await pool.query('SELECT id FROM build_logs WHERE build_id = $1', [buildId]);
    if (res.rows.length > 0) {
      await pool.query('UPDATE build_logs SET log_message = $1 WHERE build_id = $2', [logs, buildId]);
    } else {
      await pool.query('INSERT INTO build_logs (build_id, log_message) VALUES ($1, $2)', [buildId, logs]);
    }
  }

  async updateStatus(buildId, status) {
    await pool.query(
      "UPDATE builds SET status = $1, started_at = CASE WHEN $1 = 'RUNNING' THEN NOW() ELSE started_at END, completed_at = CASE WHEN $1 IN ('SUCCESS', 'FAILED') THEN NOW() ELSE completed_at END WHERE id = $2",
      [status, buildId]
    );
  }
}

module.exports = new BuildRepository();
