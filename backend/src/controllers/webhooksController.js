const buildQueue = require('../queue');
const logger = require('../utils/logger');
const repoService = require('../services/repoService');
const webhookRepository = require('../repositories/webhookRepository');

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
      const owner = repository.owner?.login || repository.owner?.name || 'user';
      const normalizedUrl = repoService.normalizeUrl(repository.clone_url);

      let repoId;
      const existingRepoId = await webhookRepository.findRepositoryIdByGithubUrl(normalizedUrl);

      if (existingRepoId) {
        repoId = existingRepoId;
      } else {
        const repositoryRecord = await webhookRepository.createRepository(repoName, normalizedUrl);
        repoId = repositoryRecord.id;
      }

      await webhookRepository.createWebhookEvent(repoId, eventType, payload);

      const build = await webhookRepository.createPendingBuild(repoId, commitHash);

      const buildId = build.id;
      const branchName = (payload.ref && payload.ref.startsWith('refs/heads/'))
        ? payload.ref.replace('refs/heads/', '')
        : 'main';

      await buildQueue.add('run-build', {
        buildId,
        repoId,
        repositoryId: repoId,
        repoUrl: normalizedUrl,
        githubUrl: normalizedUrl,
        commitHash,
        branchName,
        repoName,
        owner
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
