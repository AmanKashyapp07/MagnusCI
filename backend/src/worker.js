/**
 * MagnusCI Worker Process Entrypoint
 * 
 * Scalable BullMQ Queue Consumer for isolated containerized CI/CD builds.
 */

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const Docker = require('dockerode');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
const pool = require('./db');
const config = require('./config/env');
const { parseDAG, executeDAG } = require('./utils/dag');
const { saveCache, downloadCache } = require('./utils/cache');
const { updateGitHubStatus } = require('./utils/githubStatus');
const {
  styles,
  logWorker,
  logEngine,
  logSuccess,
  logError,
  saveLogs,
  detectProjectContext,
  handleRevertCommit,
  harvestArtifacts
} = require('./utils/workerHelpers');

// Initialize Docker Client Instance
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Container Sandbox Execution
const executeStageContainer = async ({ stageName, stageConfig, workspacePath, binds, onLog }) => {
  const imageName = stageConfig.image || 'node:20-alpine';
  const runCommand = stageConfig.run || 'echo "No command specified"';

  try {
    logWorker(`Pulling container image '${imageName}' for stage '${stageName}'...`);
    onLog(logEngine(`Pulling container image '${styles.cyan}${imageName}${styles.reset}' for stage '${stageName}'...\n`));
    
    await new Promise((resolve, reject) => {
      docker.pull(imageName, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (onFinishedErr) => {
          if (onFinishedErr) return reject(onFinishedErr);
          resolve();
        });
      });
    });

    onLog(logEngine(`Spawning isolated sandbox container for stage '${styles.cyan}${stageName}${styles.reset}'...\n`));

    const container = await docker.createContainer({
      Image: imageName,
      Cmd: ['/bin/sh', '-c', runCommand],
      WorkingDir: '/workspace',
      HostConfig: {
        Binds: binds,
        Memory: 2 * 1024 * 1024 * 1024, // 2GB memory limit
        CpuQuota: 100000,
        CpuPeriod: 100000 // 1 CPU Core limit
      },
      Tty: true
    });

    await container.start();

    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true
    });

    logStream.on('data', (chunk) => {
      onLog(`[${stageName.toUpperCase()}] ${chunk.toString('utf8')}`);
    });

    const waitResult = await container.wait();
    const exitCode = waitResult.StatusCode;

    try {
      await container.remove({ force: true });
    } catch (e) {
      // Container cleanup fallback
    }

    return { success: exitCode === 0, exitCode, container: null };
  } catch (err) {
    logError(`Container execution failed for stage '${stageName}':`, err);
    onLog(logEngine(`${styles.red}Container execution failed for stage '${stageName}': ${err.message}${styles.reset}\n`));
    return { success: false, exitCode: 1, container: null };
  }
};

// Redis Connection Options
const connection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT
};

logWorker(`Initializing Worker Queue Consumer on Redis host: ${config.REDIS_HOST}:${config.REDIS_PORT}`);

const worker = new Worker('build-queue', async (job) => {
  const { buildId, repositoryId, githubUrl, commitHash, branchName, repoName, owner } = job.data;
  logWorker(`Job Picked Up | Build ID: ${buildId}`);
  logWorker(`Repo: ${githubUrl} @ [${commitHash?.slice(0, 7)}]`);

  const targetUrl = `http://magnus-ci.online/dashboard`;
  let workspacePath = null;
  let buildLogs = '';
  let activeContainers = {};
  let statsInterval = null;

  try {
    // 1. Mark build status as RUNNING in PostgreSQL
    await pool.query(
      "UPDATE builds SET status = 'RUNNING', started_at = NOW() WHERE id = $1",
      [buildId]
    );
    logWorker(`Build status forced to RUNNING.`);
    
    buildLogs += logEngine(`Job #${buildId} started for repository ${repoName} (${branchName}).\n`);
    await saveLogs(buildId, buildLogs);

    // 2. Set GitHub Commit Status to Pending
    await updateGitHubStatus(owner, repoName, commitHash, 'pending', 'Pipeline execution underway...', targetUrl);

    // 3. Prepare workspace path
    workspacePath = path.join('/tmp', `workspace-${buildId}-${Date.now()}`);
    await fs.mkdir(workspacePath, { recursive: true });
    logWorker(`Created workspace path: ${workspacePath}`);

    // 4. Clone GitHub repository commit target
    logWorker(`Cloning commit hash ${commitHash} from ${githubUrl}...`);
    buildLogs += logEngine(`Cloning commit target ${styles.cyan}${commitHash?.slice(0, 7)}${styles.reset}...\n`);
    await saveLogs(buildId, buildLogs);

    const git = simpleGit();
    await git.clone(githubUrl, workspacePath);
    const gitRepo = simpleGit(workspacePath);
    await gitRepo.checkout(commitHash);

    logWorker(`Target commit successfully isolated.`);
    buildLogs += logEngine(`Repository workspace setup complete.\n`);
    await saveLogs(buildId, buildLogs);

    // 5. Detect Context & Cache Strategy
    const { language, imageName: defaultImage, runCommand: defaultCmd } = await detectProjectContext(workspacePath);
    logWorker(`Detected context: Language=${language}, Image=${defaultImage}`);
    buildLogs += logEngine(`Detected context: Language=${styles.cyan}${language}${styles.reset}, Base Image=${styles.cyan}${defaultImage}${styles.reset}\n`);

    // 6. Restore Dependency Cache if lockfile present
    let cacheHash = null;
    try {
      logWorker(`Resolving dependency caching strategy...`);
      const cacheRes = await downloadCache(workspacePath, language, repositoryId);
      cacheHash = cacheRes.cacheHash;
      logWorker(`Cache result: ${cacheRes.message}`);
      buildLogs += logEngine(`Dependency cache: ${cacheRes.message}\n`);
      await saveLogs(buildId, buildLogs);
    } catch (cacheErr) {
      logError(`Cache restoration encountered non-fatal issue:`, cacheErr);
    }

    // 7. Parse Pipeline Stages & DAG Configuration
    const pipelineStages = parseDAG(workspacePath, language, defaultImage, defaultCmd);
    const stageNames = Object.keys(pipelineStages);
    logWorker(`Pipeline stages loaded: ${stageNames.join(' -> ')}`);
    buildLogs += logEngine(`Topological DAG stages parsed: ${styles.bright}${stageNames.join(' -> ')}${styles.reset}\n`);

    const binds = [`${workspacePath}:/workspace`];

    // 8. Telemetry Poller (2000ms Interval)
    statsInterval = setInterval(async () => {
      for (const [sName, cInst] of Object.entries(activeContainers)) {
        if (!cInst) continue;
        try {
          const stats = await cInst.stats({ stream: false });
          const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
          const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
          const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus || 1) * 100 : 0.0;
          
          const memoryMB = (stats.memory_stats.usage || 0) / (1024 * 1024);
          const memLimitMB = (stats.memory_stats.limit || 1) / (1024 * 1024);
          const memoryPercent = (memoryMB / memLimitMB) * 100;

          logWorker(`[TELEMETRY] Stage '${sName}' -> CPU: ${cpuPercent.toFixed(1)}% | RAM: ${memoryMB.toFixed(1)}MB (${memoryPercent.toFixed(1)}%)`);
        } catch (e) {
          // Silent catch
        }
      }
    }, 2000);

    // 9. Throttled Log Stream Saver (1000ms Interval)
    let lastSavedLogs = '';
    const logInterval = setInterval(async () => {
      if (buildLogs !== lastSavedLogs) {
        lastSavedLogs = buildLogs;
        await saveLogs(buildId, buildLogs);
      }
    }, 1000);

    // 10. Execute Topological Parallel DAG
    const runStageFn = async (stageName, stageConfig) => {
      logWorker(`Spawning sandbox container for stage: ${stageName}`);
      buildLogs += logEngine(`Spawning sandbox container for stage: ${styles.cyan}${stageName}${styles.reset}\n`);

      const { success, container } = await executeStageContainer({
        stageName,
        stageConfig,
        workspacePath,
        binds,
        onLog: (line) => {
          buildLogs += line;
        }
      });

      if (container) {
        activeContainers[stageName] = container;
      }

      if (success) {
        logSuccess(`Stage '${stageName}' executed cleanly.`);
        buildLogs += logEngine(`${styles.green}✔ Stage '${stageName}' completed successfully.${styles.reset}\n`);
      } else {
        logError(`Stage '${stageName}' failed execution.`);
        buildLogs += logEngine(`${styles.red}❌ Stage '${stageName}' failed.${styles.reset}\n`);
      }

      delete activeContainers[stageName];
      return success;
    };

    const stageResults = await executeDAG(pipelineStages, runStageFn);
    
    clearInterval(logInterval);
    if (statsInterval) clearInterval(statsInterval);

    const overallSuccess = Object.values(stageResults).every(res => res === 'SUCCESS');

    buildLogs += logEngine(`DAG pipeline session finished. Exit Code: ${overallSuccess ? 0 : 1}\n`);
    await saveLogs(buildId, buildLogs);

    if (overallSuccess) {
      // Success Routines - Safely update both completed_at and finished_at
      await pool.query(
        "UPDATE builds SET status = 'SUCCESS', finished_at = NOW(), completed_at = NOW() WHERE id = $1",
        [buildId]
      );
      logSuccess(`Build ID: ${buildId} completed with status SUCCESS.`);

      await updateGitHubStatus(owner, repoName, commitHash, 'success', 'All pipeline stages passed cleanly.', targetUrl);

      // Save dependency cache
      if (cacheHash) {
        try {
          logWorker(`Saving dependency cache...`);
          const saveRes = await saveCache(workspacePath, language, repositoryId, cacheHash);
          logWorker(`Cache save result: ${saveRes.message}`);
          buildLogs += logEngine(`Cache save result: ${saveRes.message}\n`);
          await saveLogs(buildId, buildLogs);
        } catch (cacheSaveErr) {
          logError(`Cache save failed non-fatally:`, cacheSaveErr);
        }
      }
    } else {
      // Failure Routines
      throw new Error("One or more DAG pipeline stages failed.");
    }

  } catch (err) {
    if (statsInterval) clearInterval(statsInterval);

    logError(`Build pipeline broken down at ID: ${buildId}`, err);
    buildLogs += logEngine(`${styles.red}Build pipeline broken down: ${err.message}${styles.reset}\n`);

    try {
      await pool.query(
        "UPDATE builds SET status = 'FAILED', finished_at = NOW(), completed_at = NOW() WHERE id = $1",
        [buildId]
      );
    } catch (dbErr) {
      logError(`Failed to update build status in DB:`, dbErr);
    }

    try {
      await updateGitHubStatus(owner, repoName, commitHash, 'failure', `Pipeline failed: ${err.message.slice(0, 50)}`, targetUrl);
    } catch (ghErr) {
      logError(`Failed to update GitHub status:`, ghErr);
    }

    // Trigger Auto-Revert on main branch failures
    if (branchName === 'main' || branchName === 'master') {
      try {
        const revertLog = await handleRevertCommit(workspacePath, repoUrl, commitHash, branchName, buildId, buildLogs);
        buildLogs += revertLog;
      } catch (revertErr) {
        logError(`Auto-revert failed:`, revertErr);
      }
    }

    await saveLogs(buildId, buildLogs);
  } finally {
    // Artifact Harvesting & Workspace Cleanup
    if (workspacePath) {
      try {
        logWorker(`Harvesting build artifacts and test coverage reports...`);
        const artifacts = await harvestArtifacts(workspacePath, buildId);
        
        if (artifacts.length > 0) {
          logSuccess(`Harvested ${artifacts.length} build artifact(s).`);
          buildLogs += logEngine(`Captured ${artifacts.length} build artifact(s) successfully.\n`);
          await pool.query(
            "UPDATE builds SET artifacts = $1 WHERE id = $2",
            [JSON.stringify(artifacts), buildId]
          );
          await saveLogs(buildId, buildLogs);
        }
      } catch (artifactErr) {
        logError(`Artifact harvesting encountered error:`, artifactErr);
      }

      try {
        logWorker(`Pruning operational file tree workspace...`);
        await fs.rm(workspacePath, { recursive: true, force: true });
      } catch (cleanErr) {
        // Workspace cleanup fallback
      }
      logSuccess(`Job #${buildId} has fully executed and finished context routines.\n`);
    }
  }
}, { connection });

worker.on('completed', (job) => {
  logSuccess(`BullMQ Queue Worker completed Job #${job.id}`);
});

worker.on('failed', (job, err) => {
  logError(`BullMQ Queue Worker failed Job #${job?.id}:`, err);
});

module.exports = worker;