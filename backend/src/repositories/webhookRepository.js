const pool = require('../db');

class WebhookRepository {
  async findRepositoryIdByGithubUrl(githubUrl) {
    const result = await pool.query('SELECT id FROM repositories WHERE github_url = $1', [githubUrl]);
    return result.rows[0]?.id || null;
  }

  async createRepository(name, githubUrl) {
    const result = await pool.query(
      'INSERT INTO repositories (name, github_url) VALUES ($1, $2) RETURNING id',
      [name, githubUrl]
    );
    return result.rows[0];
  }

  async createWebhookEvent(repositoryId, eventType, payload) {
    await pool.query(
      'INSERT INTO webhook_events (repository_id, event_type, payload) VALUES ($1, $2, $3)',
      [repositoryId, eventType, JSON.stringify(payload)]
    );
  }

  async createPendingBuild(repositoryId, commitHash) {
    const result = await pool.query(
      "INSERT INTO builds (repository_id, commit_hash, status) VALUES ($1, $2, 'PENDING') RETURNING id",
      [repositoryId, commitHash]
    );
    return result.rows[0];
  }
}

module.exports = new WebhookRepository();
