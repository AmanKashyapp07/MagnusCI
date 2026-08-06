const repositoryRepository = require('../repositories/repositoryRepository');
const buildRepository = require('../repositories/buildRepository');
const userRepository = require('../repositories/userRepository');
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
        const user = await userRepository.findById(userId);
        if (user?.access_token) {
          return user.access_token;
        }
      } catch (err) {}
    }

    try {
      const pool = require('../db');
      const fallbackUser = await pool.query(
        `SELECT access_token FROM users WHERE access_token IS NOT NULL AND access_token != '' ORDER BY id DESC LIMIT 1`
      );
      if (fallbackUser.rows[0]?.access_token) {
        return fallbackUser.rows[0].access_token;
      }
    } catch (e) {}

    return config.GITHUB_TOKEN || '';
  }

  async getLatestCommitHash(repositoryId) {
    return buildRepository.findLatestCommitHash(repositoryId);
  }

  async getUserRepositories(userId) {
    return repositoryRepository.findByUserId(userId);
  }

  async registerRepository(name, githubUrl, userId) {
    const normalizedUrl = this.normalizeUrl(githubUrl);
    const repo = await repositoryRepository.create(name, normalizedUrl, userId);

    const parsed = this.parseRepoUrl(normalizedUrl);
    if (parsed) {
      this.registerGitHubWebhook(parsed.owner, parsed.repo, userId).catch(err => {
        logger.error(`Webhook registration failed for ${parsed.owner}/${parsed.repo}`, err);
      });

      this.initGitHubStatusBadge(parsed.owner, parsed.repo, userId).catch(err => {
        logger.error(`Initial status badge creation failed for ${parsed.owner}/${parsed.repo}`, err);
      });
    }

    return repo;
  }

  async syncWebhook(repoId, userId) {
    const repository = await repositoryRepository.findByIdAndUserId(repoId, userId);
    if (!repository) {
      return null;
    }
    const repoInfo = this.parseRepoUrl(repository.github_url);
    if (repoInfo) {
      await this.registerGitHubWebhook(repoInfo.owner, repoInfo.repo, userId);
      await this.initGitHubStatusBadge(repoInfo.owner, repoInfo.repo, userId);
    }
    return repository;
  }

  async deleteRepository(repoId, userId) {
    const repository = await repositoryRepository.findByIdAndUserId(repoId, userId);

    if (!repository) {
      return null;
    }

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

    return repositoryRepository.deleteByIdAndUserId(repoId, userId);
  }

  async registerGitHubWebhook(owner, repo, userId = null) {
    const GITHUB_WEBHOOK_SECRET = config.GITHUB_WEBHOOK_SECRET || 'magnus_webhook_secret_production_2026';
    const token = await this.getUserToken(userId);

    if (!token) {
      logger.info('No GitHub token provided, skipping automated webhook registration.');
      return;
    }

    try {
      const publicBase = process.env.PUBLIC_URL || (config.FRONTEND_URL.includes('localhost') ? 'http://129.154.39.198/ci' : config.FRONTEND_URL);
      const webhookUrl = `${publicBase}/api/webhooks/github`;
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
        const errorData = await response.json().catch(() => ({}));
        logger.error(`GitHub Webhook registration response for ${owner}/${repo}: ${errorData.message || response.statusText}`);
      } else {
        logger.info(`Successfully registered webhook for ${owner}/${repo} -> ${webhookUrl}`);
      }
    } catch (error) {
      logger.error(`Error registering webhook for ${owner}/${repo}: ${error.message}`);
    }
  }

  async initGitHubStatusBadge(owner, repo, userId = null) {
    const token = await this.getUserToken(userId);
    if (!token) return;

    try {
      const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'MagnusCI-App'
        }
      });
      if (!commitsRes.ok) return;
      const commits = await commitsRes.json();
      const latestSha = commits[0]?.sha;
      if (!latestSha) return;

      const publicBase = process.env.PUBLIC_URL || (config.FRONTEND_URL.includes('localhost') ? 'http://129.154.39.198/ci' : config.FRONTEND_URL);
      await updateGitHubStatus(
        owner,
        repo,
        latestSha,
        'pending',
        'Magnus CI: Repository connected to automated CI/CD engine',
        `${publicBase}/`,
        token
      );
    } catch (err) {
      logger.error(`Error initializing GitHub status badge for ${owner}/${repo}: ${err.message}`);
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
