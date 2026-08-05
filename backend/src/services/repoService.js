const pool = require('../db');
const config = require('../config/env');
const logger = require('../utils/logger');
const { updateGitHubStatus } = require('../utils/githubStatus');

class RepoService {
  normalizeUrl(url) {
    if (!url) return url;
    return url.trim().toLowerCase().replace(/\.git$/, '').replace(/\/$/, '');
  }

  parseRepoUrl(url) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }

  async getUserToken(userId) {
    if (userId) {
      try {
        const res = await pool.query('SELECT access_token FROM users WHERE id = $1', [userId]);
        if (res.rows[0]?.access_token) {
          return res.rows[0].access_token;
        }
      } catch (err) {}
    }
    return config.GITHUB_TOKEN;
  }

  async getLatestCommitHash(repositoryId) {
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

  async getUserRepositories(userId) {
    const result = await pool.query(
      'SELECT * FROM repositories WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async registerRepository(name, githubUrl, userId) {
    const normalizedUrl = this.normalizeUrl(githubUrl);
    const result = await pool.query(
      'INSERT INTO repositories (name, github_url, user_id) VALUES ($1, $2, $3) RETURNING *',
      [name, normalizedUrl, userId]
    );

    const repo = result.rows[0];
    const parsed = this.parseRepoUrl(normalizedUrl);
    if (parsed) {
      this.registerGitHubWebhook(parsed.owner, parsed.repo, userId).catch(err => {
        logger.error(`Webhook registration failed for ${parsed.owner}/${parsed.repo}`, err);
      });
    }

    return repo;
  }

  async syncWebhook(repoId, userId) {
    const repoResult = await pool.query(
      'SELECT id, github_url FROM repositories WHERE id = $1 AND user_id = $2',
      [repoId, userId]
    );
    if (repoResult.rowCount === 0) {
      return null;
    }
    const repoInfo = this.parseRepoUrl(repoResult.rows[0].github_url);
    if (repoInfo) {
      await this.registerGitHubWebhook(repoInfo.owner, repoInfo.repo, userId);
    }
    return repoResult.rows[0];
  }

  async deleteRepository(repoId, userId) {
    const repoResult = await pool.query(
      'SELECT id, github_url FROM repositories WHERE id = $1 AND user_id = $2',
      [repoId, userId]
    );

    if (repoResult.rowCount === 0) {
      return null;
    }

    const repository = repoResult.rows[0];
    const repoInfo = this.parseRepoUrl(repository.github_url);
    const latestCommitHash = await this.getLatestCommitHash(repository.id);
    const token = await this.getUserToken(userId);

    if (repoInfo && latestCommitHash) {
      try {
        await updateGitHubStatus(
          repoInfo.owner,
          repoInfo.repo,
          latestCommitHash,
          'error',
          'Magnus CI: repository disconnected from local pipeline',
          config.FRONTEND_URL,
          token
        );
      } catch (statusError) {
        logger.error(`Final GitHub status update failed: ${statusError.message}`);
      }
    }

    if (repoInfo) {
      await this.unregisterGitHubWebhook(repoInfo.owner, repoInfo.repo, userId);
    }

    const deleteResult = await pool.query(
      'DELETE FROM repositories WHERE id = $1 AND user_id = $2 RETURNING *',
      [repoId, userId]
    );

    return deleteResult.rows[0];
  }

  async registerGitHubWebhook(owner, repo, userId = null) {
    const GITHUB_WEBHOOK_SECRET = config.GITHUB_WEBHOOK_SECRET;
    const token = await this.getUserToken(userId);

    if (!token) {
      logger.info('No GitHub token provided, skipping automated webhook registration.');
      return;
    }

    try {
      const webhookUrl = `${config.FRONTEND_URL}/api/webhooks/github`;
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'MagnusCI-App',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'web',
          active: true,
          events: ['push'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            secret: GITHUB_WEBHOOK_SECRET,
            insecure_ssl: '0'
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        logger.error(`GitHub Webhook registration failed for ${owner}/${repo}: ${errorData.message}`);
      } else {
        logger.info(`Successfully registered webhook for ${owner}/${repo}`);
      }
    } catch (error) {
      logger.error(`Error registering webhook for ${owner}/${repo}: ${error.message}`);
    }
  }

  async unregisterGitHubWebhook(owner, repo, userId = null) {
    const token = await this.getUserToken(userId);
    if (!token) return;

    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'MagnusCI-App'
        }
      });

      if (!response.ok) return;

      const hooks = await response.json();
      const webhookUrl = `${config.FRONTEND_URL}/api/webhooks/github`;

      const matchingHooks = hooks.filter(hook =>
        hook?.config?.url && (hook.config.url === webhookUrl || hook.config.url.endsWith('/api/webhooks/github'))
      );

      await Promise.all(
        matchingHooks.map(async hook => {
          await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks/${hook.id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'MagnusCI-App'
            }
          });
        })
      );
    } catch (error) {
      logger.error(`Error deleting GitHub webhook: ${error.message}`);
    }
  }
}

module.exports = new RepoService();
