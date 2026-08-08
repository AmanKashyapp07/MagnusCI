/**
 * MagnusCI Production Stage Execution Engine
 * 
 * Provides Docker Engine container sandboxing, stream log piping,
 * and container lifecycle controls following enterprise production standards.
 */

const Docker = require('dockerode');
const { logError } = require('../utils/logger');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Programmatically pulls a Docker container image from a registry.
 * 
 * @param {string} imageName - Docker image tag (e.g. node:20-alpine)
 * @returns {Promise<object>} Docker registry progress output
 */
async function pullImage(imageName) {
  return new Promise((resolve, reject) => {
    docker.pull(imageName, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  });
}

/**
 * Inspects the local Docker daemon image cache to bypass network pull delays.
 * Only triggers registry network pull if the image does not exist locally.
 * 
 * @param {string} imageName - Docker image tag
 * @returns {Promise<boolean>} True if pulled from registry, false if resolved from local cache
 */
async function ensureImageLocally(imageName) {
  try {
    await docker.getImage(imageName).inspect();
    return false; // Instant 0ms cache hit
  } catch (err) {
    if (err.statusCode === 404 || err.message?.includes('no such image') || err.json?.message?.includes('No such image')) {
      await pullImage(imageName);
      return true; // Fresh registry pull
    }
    // Fallback on socket/permission warning
    try {
      await pullImage(imageName);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Spawns a sandboxed ephemeral container for a pipeline stage.
 * 
 * @param {object} options
 * @param {string} options.stageName - Name of the stage (e.g. setup, test)
 * @param {object} options.stageConfig - Stage config ({ run, image, timeout })
 * @param {string} options.workspacePath - Host path to workspace
 * @param {string[]} options.binds - Container volume binds
 * @param {Function} options.onLog - Stream log callback
 * @returns {Promise<{ success: boolean, container: object }>}
 */
async function executeStageContainer({ stageName, stageConfig, workspacePath, binds, onLog }) {
  const containerImage = stageConfig.image || 'node:20-alpine';
  const runCmd = stageConfig.run || 'echo "No command specified"';

  try {
    const wasPulled = await ensureImageLocally(containerImage);
    if (wasPulled && onLog) {
      onLog(`[${stageName.toUpperCase()}] Pulled container image '${containerImage}'.\n`);
    }

    const container = await docker.createContainer({
      Image: containerImage,
      Cmd: ['sh', '-c', runCmd],
      WorkingDir: '/app',
      Tty: true,
      HostConfig: {
        Binds: binds,
        AutoRemove: false
      }
    });

    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true
    });

    if (onLog) {
      stream.on('data', chunk => {
        const lines = chunk.toString('utf8');
        onLog(`[${stageName.toUpperCase()}] ${lines}`);
      });
    }

    await container.start();
    const result = await container.wait();
    const success = result.StatusCode === 0;

    return { success, container };
  } catch (error) {
    onLog(`[${stageName.toUpperCase()}] Stage execution error: ${error.message}\n`);
    return { success: false, container: null };
  }
}

module.exports = {
  docker,
  pullImage,
  ensureImageLocally,
  executeStageContainer
};
