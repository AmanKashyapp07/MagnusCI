const pool = require('../db');

class BuildService {
  async getUserBuilds(userId) {
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

  async getBuildLogs(buildId, userId) {
    const buildResult = await pool.query(
      `SELECT b.*, r.name as repository_name 
       FROM builds b 
       JOIN repositories r ON b.repository_id = r.id 
       WHERE b.id = $1 AND r.user_id = $2`,
      [buildId, userId]
    );

    if (buildResult.rows.length === 0) {
      return null;
    }

    const logResult = await pool.query(
      'SELECT log_message FROM build_logs WHERE build_id = $1',
      [buildId]
    );

    const logMessage = logResult.rows.length > 0 ? logResult.rows[0].log_message : '';

    return {
      build: buildResult.rows[0],
      logs: logMessage
    };
  }
}

module.exports = new BuildService();
