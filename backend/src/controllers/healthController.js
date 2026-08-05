const healthRepository = require('../repositories/healthRepository');

class HealthController {
  async getHealth(req, res, next) {
    try {
      const databaseTime = await healthRepository.getDatabaseTime();
      res.json({
        status: 'healthy',
        database: 'connected',
        time: databaseTime
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
