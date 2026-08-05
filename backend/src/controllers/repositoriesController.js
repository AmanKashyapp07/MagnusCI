const repoService = require('../services/repoService');

class RepositoriesController {
  async getRepositories(req, res, next) {
    try {
      const repos = await repoService.getUserRepositories(req.user.id);
      res.json(repos);
    } catch (error) {
      next(error);
    }
  }

  async registerRepository(req, res, next) {
    const { name, github_url } = req.body;
    if (!name || !github_url) {
      return res.status(400).json({ error: 'name and github_url are required' });
    }

    try {
      const repo = await repoService.registerRepository(name, github_url, req.user.id);
      res.status(201).json(repo);
    } catch (error) {
      next(error);
    }
  }

  async deleteRepository(req, res, next) {
    try {
      const repository = await repoService.deleteRepository(req.params.id, req.user.id);
      if (!repository) {
        return res.status(404).json({ error: 'Repository not found or unauthorized' });
      }
      res.json({ message: 'Repository deleted successfully', repository });
    } catch (error) {
      next(error);
    }
  }

  async syncWebhook(req, res, next) {
    try {
      const repo = await repoService.syncWebhook(req.params.id, req.user.id);
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found or unauthorized' });
      }
      res.json({ message: 'Webhook synchronized with GitHub successfully' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RepositoriesController();
