const pool = require('../db');

class HealthController {
  async getHealth(req, res, next) {
    try {
      const result = await pool.query('SELECT NOW()');
      res.json({
        status: 'healthy',
        database: 'connected',
        time: result.rows[0].now
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        database: 'disconnected',
        error: error.message
      });
    }
  }
}

module.exports = new HealthController();
