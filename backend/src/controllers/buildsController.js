const buildService = require('../services/buildService');
const buildQueue = require('../queue');
const webhookRepository = require('../repositories/webhookRepository');
const repositoryRepository = require('../repositories/repositoryRepository');
const repoService = require('../services/repoService');

class BuildsController {
  async getBuilds(req, res, next) {
    try {
      const builds = await buildService.getUserBuilds(req.user.id);
      res.json(builds);
    } catch (error) {
      next(error);
    }
  }

  async getBuildLogs(req, res, next) {
    const { id } = req.params;
    try {
      const result = await buildService.getBuildLogs(id, req.user.id);
      if (!result) {
        return res.status(404).json({ error: 'Build not found or unauthorized' });
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async triggerBuild(req, res, next) {
    const repositoryId = req.params.id || req.body.repositoryId;
    const { branchName = 'main', commitHash = 'HEAD' } = req.body;

    if (!repositoryId) {
      return res.status(400).json({ error: 'repositoryId is required' });
    }

    try {
      const repository = await repositoryRepository.findByIdAndUserId(repositoryId, req.user.id);
      if (!repository) {
        return res.status(404).json({ error: 'Repository not found or unauthorized' });
      }

      const build = await webhookRepository.createPendingBuild(repository.id, commitHash);
      const parsed = repoService.parseRepoUrl(repository.github_url);
      const owner = parsed ? parsed.owner : 'user';
      const repoName = repository.name;

      await buildQueue.add('run-build', {
        buildId: build.id,
        repoId: repository.id,
        repositoryId: repository.id,
        repoUrl: repository.github_url,
        githubUrl: repository.github_url,
        commitHash,
        branchName,
        repoName,
        owner
      });

      const io = req.app.get('io');
      if (io) {
        io.emit('build-status', { buildId: build.id, status: 'PENDING' });
      }

      res.status(201).json({
        message: 'Pipeline build triggered successfully',
        buildId: build.id,
        status: 'PENDING'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BuildsController();
