const pool = require('../db');
const buildQueue = require('../queue');
const logger = require('../utils/logger');
const repoService = require('../services/repoService');

class WebhooksController {
  async handleGithubWebhook(req, res, next) {
    const eventType = req.headers['x-github-event'];
    const payload = req.body;

    if (eventType !== 'push') {
      return res.status(200).json({ message: `Webhook received. Ignored event type: ${eventType}` });
    }

    const headCommit = payload.head_commit;
    if (headCommit && (
      headCommit.author?.name === 'Magnus CI' ||
      headCommit.committer?.name === 'Magnus CI' ||
      headCommit.author?.email === 'ci@magnus.internal' ||
      headCommit.committer?.email === 'ci@magnus.internal'
    )) {
      logger.info('Ignoring push event triggered by Magnus CI auto-revert loop circuit breaker.');
      return res.status(200).json({ message: 'Ignored commit pushed by Magnus CI to prevent infinite loops.' });
    }

    try {
      const repository = payload.repository;
      const commitHash = payload.after;

      if (!repository || !repository.clone_url) {
        return res.status(400).json({ error: 'Missing repository information in payload' });
      }

      const repoName = repository.name;
      const normalizedUrl = repoService.normalizeUrl(repository.clone_url);

      let repoId;
      const repoResult = await pool.query('SELECT id FROM repositories WHERE github_url = $1', [normalizedUrl]);

      if (repoResult.rows.length > 0) {
        repoId = repoResult.rows[0].id;
      } else {
        const insertRepoResult = await pool.query(
          'INSERT INTO repositories (name, github_url) VALUES ($1, $2) RETURNING id',
          [repoName, normalizedUrl]
        );
        repoId = insertRepoResult.rows[0].id;
      }

      await pool.query(
        'INSERT INTO webhook_events (repository_id, event_type, payload) VALUES ($1, $2, $3)',
        [repoId, eventType, JSON.stringify(payload)]
      );

      const buildResult = await pool.query(
        "INSERT INTO builds (repository_id, commit_hash, status) VALUES ($1, $2, 'PENDING') RETURNING id",
        [repoId, commitHash]
      );

      const buildId = buildResult.rows[0].id;
      const branchName = (payload.ref && payload.ref.startsWith('refs/heads/'))
        ? payload.ref.replace('refs/heads/', '')
        : 'main';

      await buildQueue.add('run-build', {
        buildId,
        repoUrl: normalizedUrl,
        commitHash,
        branchName
      });

      res.status(202).json({
        message: 'Build triggered successfully',
        buildId,
        status: 'PENDING'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WebhooksController();
