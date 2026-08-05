/**
 * MagnusCI Background Worker & Pipeline Orchestration Daemon
 * 
 * Manages BullMQ job queues, repository cloning, DAG stage scheduling,
 * Docker container sandboxing, stream logging, and auto-revert routines.
 */

require('dotenv').config();
const { Worker } = require('bullmq');
const Docker = require('dockerode');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
const pool = require('./db');
const { createWorkspace, cleanWorkspace } = require('./workspace');
const { updateGitHubStatus } = require('./utils/githubStatus');
const { restoreCache, saveCache } = require('./utils/cache');
const { loadPipelineStages, hasCycle, executeDAG } = require('./utils/dag');
const { executeStageContainer } = require('./pipeline/stageRunner');
const { handleRevertCommit } = require('./pipeline/autoRevertService');
const { harvestArtifacts } = require('./pipeline/artifactService');
const {
  styles,
  logWorker,
  logEngine,
  logSuccess,
  logError,
  pullImage,
  saveLogs,
  detectProjectContext
} = require('./utils/workerHelpers');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379')
};

/**
 * BullMQ Job Processor Routine
 */
const worker = new Worker('build-queue', async job => {
  const { buildId, repoUrl, commitHash, branchName = 'main' } = job.data;
  
  let owner = '';
  let repoName = '';
  try {
    const parts = repoUrl.split('/');
    repoName = parts.pop().replace('.git', '');
    owner = parts.pop();
  } catch (e) {
    owner = '';
    repoName = '';
  }
  
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const targetUrl = `${frontendUrl}/`;

  console.log(`\n${styles.bright}${styles.blue}┌────────────────────────────────────────────────────────┐${styles.reset}`);
  logWorker(` Job Picked Up | ${styles.bright}Build ID: ${buildId}${styles.reset}`);
  logWorker(` Repo: ${styles.dim}${repoUrl}${styles.reset} @ [${styles.yellow}${commitHash.slice(0, 7)}${styles.reset}]`);
  console.log(`${styles.bright}${styles.blue}└────────────────────────────────────────────────────────┘${styles.reset}`);

  let workspacePath = '';
  let activeContainers = {};
  let buildLogs = '';
  let statsInterval = null;
  let cacheHash = null;

  try {
    // 1. Transactionally update build status to RUNNING
    await pool.query(
      "UPDATE builds SET status = 'RUNNING', started_at = NOW() WHERE id = $1",
      [buildId]
    );
    logWorker(`Build status forced to ${styles.yellow}RUNNING${styles.reset}.`);
    
    await updateGitHubStatus(owner, repoName, commitHash, 'pending', 'Pipeline execution in progress...', targetUrl);

    // 2. Generate isolated workspace path
    workspacePath = await createWorkspace(buildId);
    buildLogs += logEngine(`Created workspace path: ${styles.dim}${workspacePath}${styles.reset}\n`);
    await saveLogs(buildId, buildLogs);

    // 3. Git Clone & Commit SHA Checkout
    buildLogs += logEngine(`Cloning repository... 📥\n`);
    await saveLogs(buildId, buildLogs);
    const git = simpleGit();
    await git.clone(repoUrl, workspacePath);
    buildLogs += logEngine(`${styles.green}✔ Repository cloned successfully.${styles.reset}\n`);
    await saveLogs(buildId, buildLogs);

    buildLogs += logEngine(`Checking out commit: ${styles.yellow}${commitHash}${styles.reset}\n`);
    await saveLogs(buildId, buildLogs);
    const repoGit = simpleGit(workspacePath);
    await repoGit.checkout(commitHash);
    buildLogs += logEngine(`${styles.green}✔ Target commit successfully isolated.${styles.reset}\n`);
    await saveLogs(buildId, buildLogs);

    // 4. Project context & build environment resolution
    buildLogs += logEngine(`Detecting project language and build environment...\n`);
    await saveLogs(buildId, buildLogs);
    
    const { language, imageName } = await detectProjectContext(workspacePath);
    
    buildLogs += logEngine(`Detected context: ${styles.green}${language}${styles.reset} environment. Base container: ${styles.yellow}${imageName}${styles.reset}\n`);
    await saveLogs(buildId, buildLogs);

    const repoRes = await pool.query("SELECT repository_id FROM builds WHERE id = $1", [buildId]);
    const repositoryId = repoRes.rows[0]?.repository_id || 1;

    // 5. Dependency Caching Resolution
    logWorker(`Resolving dependency caching strategy...`);
    buildLogs += logEngine(`Resolving dependency caching strategy...\n`);
    await saveLogs(buildId, buildLogs);
    const cacheResult = await restoreCache(workspacePath, language, repositoryId);
    cacheHash = cacheResult.hash;
    logWorker(`Cache result: ${cacheResult.message}`);
    buildLogs += logEngine(`${cacheResult.success ? styles.green : styles.yellow}ℹ ${cacheResult.message}${styles.reset}\n`);
    await saveLogs(buildId, buildLogs);

    // 6. Host Mounts & Volume Mapping
    const binds = [
      `${workspacePath}:/app`,
      '/var/run/docker.sock:/var/run/docker.sock'
    ];

    if (language === 'Python') {
      const localPipCache = path.join(workspacePath, '.pip_cache');
      await fs.mkdir(localPipCache, { recursive: true });
      binds.push(`${localPipCache}:/root/.cache/pip`);
    } else if (language === 'Node.js') {
      const localNpmCache = path.join(workspacePath, '.npm_cache');
      await fs.mkdir(localNpmCache, { recursive: true });
      binds.push(`${localNpmCache}:/root/.npm`);
    } else if (language === 'Go') {
      const localGoCache = path.join(workspacePath, '.go_cache');
      await fs.mkdir(localGoCache, { recursive: true });
      binds.push(`${localGoCache}:/go/pkg/mod`);
    }

    // 7. Load & Validate Pipeline DAG
    const pipelineStages = await loadPipelineStages(workspacePath, language, imageName);
    
    if (hasCycle(pipelineStages)) {
      throw new Error("Cyclic dependency detected in pipeline configuration (magnus-ci.json). Aborting.");
    }

    // 8. Container Telemetry Poller (2000ms Interval)
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
          // Silent catch for exited containers
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
      // Success Routines
      await pool.query(
        "UPDATE builds SET status = 'SUCCESS', completed_at = NOW() WHERE id = $1",
        [buildId]
      );
      logSuccess(`Build ID: ${buildId} completed with status SUCCESS.`);

      await updateGitHubStatus(owner, repoName, commitHash, 'success', 'All pipeline stages passed cleanly.', targetUrl);

      // Save dependency cache
      if (cacheHash) {
        logWorker(`Saving dependency cache...`);
        const saveRes = await saveCache(workspacePath, language, repositoryId, cacheHash);
        logWorker(`Cache save result: ${saveRes.message}`);
        buildLogs += logEngine(`Cache save result: ${saveRes.message}\n`);
        await saveLogs(buildId, buildLogs);
      }
    } else {
      // Failure Routines
      throw new Error("One or more DAG pipeline stages failed.");
    }

  } catch (err) {
    if (statsInterval) clearInterval(statsInterval);

    logError(`Build pipeline broken down at ID: ${buildId}`, err);
    buildLogs += logEngine(`${styles.red}Build pipeline broken down: ${err.message}${styles.reset}\n`);

    await pool.query(
      "UPDATE builds SET status = 'FAILED', completed_at = NOW() WHERE id = $1",
      [buildId]
    );

    await updateGitHubStatus(owner, repoName, commitHash, 'failure', `Pipeline failed: ${err.message.slice(0, 50)}`, targetUrl);

    // Trigger Auto-Revert on main branch failures
    if (branchName === 'main' || branchName === 'master') {
      const revertLog = await handleRevertCommit(workspacePath, repoUrl, commitHash, branchName, buildId, buildLogs);
      buildLogs += revertLog;
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

      logWorker(`Pruning operational file tree workspace...`);
      await cleanWorkspace(buildId);
      logSuccess(`Job #${buildId} has fully executed and finished context routines.\n`);
    }
  }
}, { connection });

// Startup Banner Log
console.log(`
${styles.cyan}${styles.bright}========================================================================
█▀▄▀█  ▄▀█  █▀▀  █▄░█  █░█  █▀    █▀▀  █
█░▀░█  █▀█  █▄█  █░▀█  █▄█  ▄█    █▄▄  █
========================================================================
 Engine Daemon Online
 📡  Awaiting Webhooks on: build-queue
 🛡️   Auto-Revert System: Enabled
 📦  Docker API Connected: true
========================================================================${styles.reset}
`);

module.exports = worker;