const buildService = require('../services/buildService');

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
}

module.exports = new BuildsController();
