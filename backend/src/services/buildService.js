const buildRepository = require('../repositories/buildRepository');

class BuildService {
  async getUserBuilds(userId) {
    return buildRepository.findByUserId(userId);
  }

  async getBuildLogs(buildId, userId) {
    const build = await buildRepository.findByIdAndUserId(buildId, userId);

    if (!build) {
      return null;
    }

    const logMessage = await buildRepository.findLogsByBuildId(buildId);

    return {
      build,
      logs: logMessage
    };
  }
}

module.exports = new BuildService();
