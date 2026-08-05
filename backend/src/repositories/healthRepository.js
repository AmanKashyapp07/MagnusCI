const pool = require('../db');

class HealthRepository {
  async getDatabaseTime() {
    const result = await pool.query('SELECT NOW()');
    return result.rows[0].now;
  }
}

module.exports = new HealthRepository();
