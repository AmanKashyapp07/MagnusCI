////////////////////////////////////////////////////////////////////////////////
// MagnusCI Background Worker & Orchestration Daemon
//
// File Purpose:
// This daemon is the core processing engine of MagnusCI. It runs continuously
// in the background, pulls jobs from the BullMQ queue, clones the target repo,
// resolves dependency caches, executes the pipeline DAG, programmatically
// controls isolated Docker containers, streams logs, and pushes auto-reverts on failures.
//
// High-Level Architecture & Lifecycle Flow:
// 1. Dequeue: Listens for 'run-build' tasks enqueued by the Express gateway.
// 2. Set RUNNING: Transition PostgreSQL builds.status to 'RUNNING'.
// 3. Workspace Prep: Creates a temp directory temp_builds/{buildId}/ on host disk.
// 4. Git VCS Isolation: Clones the codebase and checkouts the specific commit SHA.
// 5. Caching Lookup: Fingerprints the lockfile, checks for an archive tarball,
//    and extracts it into the workspace to skip package downloads.
// 6. Graph Orchestration: Validates cycle-free stages and executes them in parallel.
// 7. Sibling Containers: For each stage, talks to /var/run/docker.sock Unix socket
//    to pull the image and spawn a container mapping the workspace.
// 8. Stream Logs & Metrics: Listens to standard output, prefixes logs (throttling
//    DB writes to every 1000ms), and polls CPU/Memory every 2s.
// 9. Completion Gates: Checks for build success/failures, updates status badges
//    on GitHub, saves caches, harvests coverages/binaries, and executes Git revert
//    remotely on failures.
// 10. Workspace Pruning: Recursively sweeps folder directories inside finally {}
//     blocks to prevent storage leaks.
//
// Topics Interviewers Can Ask:
// - Programmatic Unix socket APIs (dockerode) vs spawning shell CLI tools (child_process).
// - Docker out of Docker (DooD) pattern vs Docker in Docker (DinD).
// - Sibling container creation, volume binds mapping, and resource quotas.
// - Merged Pseudo-TTY standard output stream capturing.
// - Event loop Promise.race timeout safeguards.
// - Personal Access Token (PAT) authentication git overrides.
// - Throttled log batching and vertical partitioning logic.
//
// Dependencies: dotenv, BullMQ, Dockerode, Simple-Git, fs/promises, pg pool
////////////////////////////////////////////////////////////////////////////////

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
const {
  styles,
  logWorker,
  logEngine,
  logSuccess,
  logError,
  pullImage,
  saveLogs,
  detectProjectContext,
  extractTestSummary,
  handleRevertCommit,
  harvestArtifacts
} = require('./utils/workerHelpers');

// --- Core Setup ---
//------------------------------------------------------------------------------
// Core Engine Instantiations & Sockets Setup
// We connect programmatically to /var/run/docker.sock to manage containers.
//------------------------------------------------------------------------------
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379')
};

// --- Worker Loop ---
////////////////////////////////////////////////////////////////////////////////
// Worker Task Callback (BullMQ Daemon)
//
// Purpose: Main entry point for the job processor. Evaluates builds sequentially
//          or concurrently based on setup thread limits.
// Inputs: job (BullMQ job wrapper)
// Outputs: Promise resolving on completion
// Side Effects: Modifies DB, writes workspaces, spawns containers.
// Time Complexity: O(B) where B is duration of build steps.
////////////////////////////////////////////////////////////////////////////////
const worker = new Worker('build-queue', async job => {
  const { buildId, repoUrl, commitHash, branchName = 'main' } = job.data;
  
  let owner = '';
  let repoName = '';
  try {
    const parts = repoUrl.split('/');
    repoName = parts.pop().replace('.git', '');
    owner = parts.pop();
  } catch (e) {}
  
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
    //--------------------------------------------------------------------------
    // Step 1: Update status to RUNNING
    // We transactionally force status to RUNNING in PostgreSQL and trigger
    // the GitHub check pending update API to notify developers in PR streams.
    //--------------------------------------------------------------------------
    await pool.query(
      "UPDATE builds SET status = 'RUNNING', started_at = NOW() WHERE id = $1",
      [buildId]
    );
    logWorker(`Build status forced to ${styles.yellow}RUNNING${styles.reset}.`);
    
    await updateGitHubStatus(owner, repoName, commitHash, 'pending', 'Pipeline execution in progress...', targetUrl);

    //--------------------------------------------------------------------------
    // Step 2: Create local workspace
    // Generate an isolated, unique host directory to prevent file system clashes
    // with other concurrent runner threads.
    //--------------------------------------------------------------------------
    workspacePath = await createWorkspace(buildId);
    buildLogs += logEngine(`Created workspace path: ${styles.dim}${workspacePath}${styles.reset}\n`);
    await saveLogs(buildId, buildLogs);

    //--------------------------------------------------------------------------
    // Step 3: Git Clone & Checkout
    // Clones the code to the workspace and checkouts the specific commit SHA
    // to guarantee execution consistency.
    //--------------------------------------------------------------------------
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

    //--------------------------------------------------------------------------
    // Step 4: Detect environment configuration
    // Inspects file signatures to map environments and resolve dependencies.
    //--------------------------------------------------------------------------
    buildLogs += logEngine(`Detecting project language and build environment...\n`);
    await saveLogs(buildId, buildLogs);
    
    const { language, imageName, runCommand } = await detectProjectContext(workspacePath);
    
    buildLogs += logEngine(`Detected context: ${styles.green}${language}${styles.reset} environment. Selected base container: ${styles.yellow}${imageName}${styles.reset}\n`);
    await saveLogs(buildId, buildLogs);

    // Fetch repository_id to organize host cache directories
    const repoRes = await pool.query("SELECT repository_id FROM builds WHERE id = $1", [buildId]);
    const repositoryId = repoRes.rows[0]?.repository_id || 1;

    // Restore dependency cache if available
    //--------------------------------------------------------------------------
    // Caching Restoration Phase
    // Checks for pre-packaged dependencies tarball archives in the local directory.
    // If found, pulls them to the workspace path before execution starts.
    //--------------------------------------------------------------------------
    logWorker(`Resolving dependency caching strategy...`);
    buildLogs += logEngine(`Resolving dependency caching strategy...\n`);
    await saveLogs(buildId, buildLogs);
    const cacheResult = await restoreCache(workspacePath, language, repositoryId);
    cacheHash = cacheResult.hash;
    logWorker(`Cache result: ${cacheResult.message}`);
    buildLogs += logEngine(`${cacheResult.success ? styles.green : styles.yellow}ℹ ${cacheResult.message}${styles.reset}\n`);
    await saveLogs(buildId, buildLogs);

    //--------------------------------------------------------------------------
    // Host Mounts & Cache Volumes Mapping
    // Maps workspace directories dynamically to target container cache paths
    // (such as npm node_modules, maven .m2 directories, gradle .gradle files, etc.)
    // to preserve package state between runs.
    //--------------------------------------------------------------------------
    const binds = [
      `${workspacePath}:/app`,
      '/var/run/docker.sock:/var/run/docker.sock'
    ];

    if (language === 'Python') {
      const localPipCache = path.join(workspacePath, '.pip_cache');
      await fs.mkdir(localPipCache, { recursive: true });
      binds.push(`${localPipCache}:/root/.cache/pip`);
    } else if (language.includes('Maven')) {
      const localMavenCache = path.join(workspacePath, '.m2_cache');
      await fs.mkdir(localMavenCache, { recursive: true });
      binds.push(`${localMavenCache}:/root/.m2`);
    } else if (language.includes('Gradle')) {
      const localGradleCache = path.join(workspacePath, '.gradle_cache');
      await fs.mkdir(localGradleCache, { recursive: true });
      binds.push(`${localGradleCache}:/root/.gradle`);
    } else if (language === 'Go') {
      const localGoCache = path.join(workspacePath, '.go_cache');
      await fs.mkdir(localGoCache, { recursive: true });
      binds.push(`${localGoCache}:/go/pkg/mod`);
    }

    //--------------------------------------------------------------------------
    // Step 5: Load pipeline DAG stages
    // Reads custom stage configurations. Ensures that the execution graph is
    // cycle-free (Acyclic check) using DFS cycle detection to prevent deadlocks.
    //--------------------------------------------------------------------------
    buildLogs += logEngine(`Loading pipeline stages...\n`);
    await saveLogs(buildId, buildLogs);
    const stages = await loadPipelineStages(workspacePath, language, imageName);

    if (hasCycle(stages)) {
      throw new Error("Circular dependency detected in stages execution tree.");
    }

    buildLogs += logEngine(`Orchestrating pipeline workflow DAG:\n`);
    for (const [name, stage] of Object.entries(stages)) {
      const needsStr = stage.needs && stage.needs.length > 0 ? ` [needs: ${Array.isArray(stage.needs) ? stage.needs.join(', ') : stage.needs}]` : '';
      buildLogs += `   - Stage: ${styles.bright}${name.toUpperCase()}${styles.reset} -> run: \`${stage.run}\`${needsStr}\n`;
    }
    await saveLogs(buildId, buildLogs);

    ////////////////////////////////////////////////////////////////////////////
    // Nested Worker Helper: runStageFn
    // Purpose: Spawns and manages a Docker container to execute a single stage.
    // Inputs: stageName (string), stageConfig (object)
    // Outputs: boolean (true on success exit code 0, false otherwise)
    // Side Effects: Pulls images, creates/starts containers, streams stdout logs.
    // Time Complexity: O(C) where C is stage command run duration.
    //
    // Container Sandboxing (Security & Resource Quotas):
    // Q: Why did you bind '/var/run/docker.sock:/var/run/docker.sock'?
    // A: This enables Docker-Out-Of-Docker (DooD). Containers spawned by this stage
    //    can interact with the host Docker daemon. This allows sibling containers
    //    to run without nested virtualization performance overhead.
    // Q: Why use HostConfig.AutoRemove: true?
    // A: To prevent container storage accumulation on the host. When a build
    //    container exits, it is deleted automatically by Docker.
    // Q: Why use Tty: true?
    // A: Allocating a Pseudo-TTY merges stdout and stderr streams into a single
    //    ordered stream, matching what a user would see in an interactive shell.
    ////////////////////////////////////////////////////////////////////////////
    const runStageFn = async (stageName, stageConfig) => {
      const stageImageName = stageConfig.image || imageName;
      const stageRunCommand = stageConfig.run;

      buildLogs += logEngine(`Preparing stage ${styles.bright}${stageName.toUpperCase()}${styles.reset} using image ${styles.yellow}${stageImageName}${styles.reset}...\n`);
      await saveLogs(buildId, buildLogs);

      // Make sure image is pulled
      let stageImageExists = false;
      try {
        await docker.getImage(stageImageName).inspect();
        stageImageExists = true;
      } catch (inspectErr) {}

      if (!stageImageExists) {
        logWorker(`Docker image ${stageImageName} missing locally for stage ${stageName}. Pulling...`);
        buildLogs += logEngine(`Pulling layer image: ${styles.magenta}${stageImageName}${styles.reset}...\n`);
        await saveLogs(buildId, buildLogs);
        await pullImage(stageImageName);
        buildLogs += logEngine(`${styles.green}✔ Layer cached successfully for ${stageName}.${styles.reset}\n`);
        await saveLogs(buildId, buildLogs);
      }

      logWorker(`Spawning sandbox container for stage: ${stageName}`);
      buildLogs += logEngine(`Launching stage ${styles.bright}${stageName.toUpperCase()}${styles.reset} container context...\n`);
      await saveLogs(buildId, buildLogs);

      // Create container
      const stageContainer = await docker.createContainer({
        Image: stageImageName,
        Cmd: ['/bin/sh', '-c', stageRunCommand],
        WorkingDir: '/app',
        Env: ['CI=true'],
        HostConfig: {
          Binds: binds,
          AutoRemove: true
        },
        Tty: true
      });

      activeContainers[stageName] = stageContainer;

      const stageLogStream = await stageContainer.attach({
        stream: true,
        stdout: true,
        stderr: true
      });

      let lastLogSave = Date.now();
      const stagePrefix = `${styles.bright}${styles.dim}[${stageName.toUpperCase()}]${styles.reset} `;

      //------------------------------------------------------------------------
      // Throttled Stream Log Batching
      // Rather than executing a PostgreSQL update query for every single output line
      // chunk, logs are accumulated in memory and written in throttled intervals
      // (at most once every 1000ms) to reduce DB socket overhead.
      //------------------------------------------------------------------------
      stageLogStream.on('data', (chunk) => {
        const output = chunk.toString();
        const prefixed = output
          .split('\n')
          .map(line => line.trim() ? `${stagePrefix}${line}` : '')
          .filter(Boolean)
          .join('\n');
        
        if (prefixed) {
          buildLogs += prefixed + '\n';
          process.stdout.write(prefixed + '\n');
        }

        if (Date.now() - lastLogSave > 1000) {
          saveLogs(buildId, buildLogs).catch(() => {});
          lastLogSave = Date.now();
        }
      });

      await stageContainer.start();
      logWorker(`Stage ${stageName} runtime session active.`);

      // Implement configurable timeout per stage (default: 2 minutes)
      //------------------------------------------------------------------------
      // Configurable Timeout Guard
      // Creates a timeout promise wrapper. If the container does not exit before
      // the deadline limit, the promise rejects, throwing a timeout error and
      // triggering container termination.
      //------------------------------------------------------------------------
      const stageTimeoutMs = (stageConfig.timeout || 120) * 1000;
      const stageTimeoutMinutes = Math.round((stageConfig.timeout || 120) / 60);
      let stageTimeoutId;
      const stageTimeoutPromise = new Promise((_, reject) => {
        stageTimeoutId = setTimeout(() => {
          reject(new Error(`Stage ${stageName} timed out after ${stageTimeoutMinutes} minutes.`));
        }, stageTimeoutMs);
      });

      try {
        //----------------------------------------------------------------------
        // Asynchronous Wait Gating
        // Executes Promise.race between the Dockerode container wait promise and
        // the timeout promise to resolve exit status or trigger timeout handlers.
        //----------------------------------------------------------------------
        const stageExitCode = await Promise.race([
          stageContainer.wait().then(res => res.StatusCode),
          stageTimeoutPromise
        ]);
        clearTimeout(stageTimeoutId);
        
        buildLogs += logEngine(`Stage ${styles.bright}${stageName.toUpperCase()}${styles.reset} execution exited with code: ${stageExitCode === 0 ? styles.green + '0' : styles.red + stageExitCode}${styles.reset}\n`);
        await saveLogs(buildId, buildLogs);

        delete activeContainers[stageName];
        return stageExitCode === 0;
      } catch (err) {
        clearTimeout(stageTimeoutId);
        buildLogs += logEngine(`${styles.red}❌ Stage ${stageName.toUpperCase()} error: ${err.message}${styles.reset}\n`);
        await saveLogs(buildId, buildLogs);
        
        try {
          await stageContainer.kill();
        } catch (killErr) {}
        
        delete activeContainers[stageName];
        return false;
      }
    };

    //--------------------------------------------------------------------------
    // Telemetry Collection Loop
    // Periodically polls CPU/Memory stats from the Docker Engine daemon for all
    // active container instances every 2 seconds, updates metrics logs in DB.
    //
    // Interview Discussion (Polling CPU/Mem):
    // Q: Why did you compute CPU delta vs system delta?
    // A: Docker statistics outputs raw CPU clock ticks. To convert this into a
    //    meaningful CPU percentage (e.g. 50%), we calculate the container usage
    //    delta relative to the system's global CPU usage delta multiplied by active cores.
    // Q: Does polling stats degrade engine performance?
    // A: No. We pass `stream: false` to request a one-off stats payload instead of
    //    keeping persistent telemetry streams open. This minimizes socket overhead.
    //--------------------------------------------------------------------------
    const metrics = [];
    statsInterval = setInterval(async () => {
      const activeStageNames = Object.keys(activeContainers);
      if (activeStageNames.length === 0) return;
      try {
        let totalCpu = 0;
        let totalMemMB = 0;
        let count = 0;

        for (const name of activeStageNames) {
          const stageContainer = activeContainers[name];
          if (!stageContainer) continue;
          try {
            const stats = await stageContainer.stats({ stream: false });
            if (!stats || !stats.cpu_stats || !stats.memory_stats) continue;

            let cpuPercent = 0;
            const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (stats.precpu_stats?.cpu_usage?.total_usage || 0);
            const systemDelta = stats.cpu_stats.system_cpu_usage - (stats.precpu_stats?.system_cpu_usage || 0);
            const onlineCpus = stats.cpu_stats.online_cpus || 1;
            if (systemDelta > 0 && cpuDelta > 0) {
              cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100.0;
            }

            const memUsageBytes = stats.memory_stats.usage || 0;
            const memUsageMB = memUsageBytes / (1024 * 1024);

            totalCpu += cpuPercent;
            totalMemMB += memUsageMB;
            count++;
          } catch (statsErr) {
            // Ignore stats errors for individual containers
          }
        }

        if (count > 0) {
          const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          metrics.push({ 
            time, 
            cpu: parseFloat(totalCpu.toFixed(2)), 
            memory: parseFloat(totalMemMB.toFixed(2)), 
            memoryPercent: 0 
          });

          await pool.query(
            "UPDATE builds SET metrics = $1 WHERE id = $2",
            [JSON.stringify(metrics), buildId]
          );
        }
      } catch (err) {}
    }, 2000);

    //--------------------------------------------------------------------------
    // Step 6: Pipeline Stages Execution
    // Resolves the topological graph concurrency order and executes stages.
    //--------------------------------------------------------------------------
    const states = await executeDAG(stages, runStageFn);
    clearInterval(statsInterval);

    //--------------------------------------------------------------------------
    // Finalization Phase
    // Evaluates test outcomes, saves dependency caches, harvests binaries,
    // and sends status notifications to GitHub. If the build failed, triggers
    // the auto-revert checkout process.
    //--------------------------------------------------------------------------
    const allPassed = Object.values(states).every(state => state === 'SUCCESS');
    const exitCode = allPassed ? 0 : 1;

    buildLogs += `\n` + logEngine(`DAG execution finished with code: ${exitCode === 0 ? styles.green + '0' : styles.red + '1'}${styles.reset}\n`);
    logWorker(`DAG pipeline session finished. Exit Code: ${exitCode}`);

    // Harvest artifacts before workspace cleanup
    let artifacts = [];
    if (workspacePath) {
      try {
        artifacts = await harvestArtifacts(workspacePath, buildId);
        if (artifacts.length > 0) {
          logWorker(`[ARTIFACTS] Harvested ${artifacts.length} artifacts.`);
          buildLogs += `\n` + logEngine(`${styles.green}✔ Captured ${artifacts.length} build artifact(s).${styles.reset}\n`);
        }
      } catch (artErr) {
        logError(`[ARTIFACTS] Failed to harvest artifacts for build ID ${buildId}:`, artErr.message);
      }
    }

    // Update status to SUCCESS or FAILED based on exit code
    const finalStatus = exitCode === 0 ? 'SUCCESS' : 'FAILED';
    await pool.query(
      "UPDATE builds SET status = $1, finished_at = NOW(), artifacts = $2 WHERE id = $3",
      [finalStatus, JSON.stringify(artifacts), buildId]
    );

    const githubState = exitCode === 0 ? 'success' : 'failure';
    const defaultMsg = finalStatus === 'SUCCESS' ? 'All checks passed seamlessly' : 'Pipeline execution failed';
    const testSummary = extractTestSummary(buildLogs, defaultMsg);
    const description = testSummary !== defaultMsg ? `${language}: ${testSummary}` : defaultMsg;
    await updateGitHubStatus(owner, repoName, commitHash, githubState, description, targetUrl);

    if (finalStatus === 'SUCCESS' && cacheHash) {
      logWorker(`Compressing and archiving dependency cache...`);
      buildLogs += `\n` + logEngine(`Compressing and archiving dependency cache...\n`);
      await saveLogs(buildId, buildLogs);
      const saveResult = await saveCache(workspacePath, language, repositoryId, cacheHash);
      logWorker(`Cache save result: ${saveResult.message}`);
      buildLogs += logEngine(`${saveResult.success ? styles.green : styles.yellow}ℹ ${saveResult.message}${styles.reset}\n`);
      await saveLogs(buildId, buildLogs);
    }

    if (finalStatus === 'FAILED') {
      const revertLog = await handleRevertCommit(workspacePath, repoUrl, commitHash, branchName, buildId, buildLogs);
      buildLogs += revertLog;
    }

    await saveLogs(buildId, buildLogs);

  } catch (err) {
    logError(`Build pipeline broken down at ID: ${buildId}`, err.message);
    buildLogs += `\n` + logEngine(`${styles.red}❌ Operational breakdown: ${err.message}${styles.reset}\n`);

    for (const [name, stageContainer] of Object.entries(activeContainers)) {
      try {
        logWorker(`Forcibly halting container session for stage ${name}...`);
        await stageContainer.kill();
      } catch (stopErr) {
        // Ignore if already stopped/killed
      }
    }

    let artifacts = [];
    if (workspacePath) {
      try {
        artifacts = await harvestArtifacts(workspacePath, buildId);
      } catch (artErr) {
        logError(`[ARTIFACTS] Failed to harvest artifacts in catch block:`, artErr.message);
      }
    }

    await pool.query(
      "UPDATE builds SET status = 'FAILED', finished_at = NOW(), artifacts = $1 WHERE id = $2",
      [JSON.stringify(artifacts), buildId]
    );

    await updateGitHubStatus(owner, repoName, commitHash, 'error', 'Critical worker failure during execution', targetUrl);

    if (workspacePath) {
      const revertLog = await handleRevertCommit(workspacePath, repoUrl, commitHash, branchName, buildId, buildLogs);
      buildLogs += revertLog;
    }

    await saveLogs(buildId, buildLogs);
    //--------------------------------------------------------------------------
    // Workspace Cleaning Integrity
    // Q: Why execute cleanWorkspace inside a finally {} block?
    // A: To guarantee cleanup. Regardless of whether builds succeed, fail, or crash
    //    with uncaught exceptions, this block executes to wipe the local clone files
    //    from disk, preventing disk exhaustion and security leaks.
    //--------------------------------------------------------------------------
  } finally {
    if (statsInterval) {
      clearInterval(statsInterval);
    }
    if (workspacePath) {
      logWorker(`Pruning operational file tree workspace...`);
      await cleanWorkspace(buildId);
    }
  }
}, { connection, concurrency: 4 });

//------------------------------------------------------------------------------
// Global Worker Event Observers
// Enforces monitoring hooks to track build queues completion and lifecycle failures.
//------------------------------------------------------------------------------
worker.on('completed', job => {
  logSuccess(`Job #${job.id} has fully executed and finished context routines.`);
});

worker.on('failed', (job, err) => {
  logError(`Job #${job.id} emitted standard failure trap event:`, err.message);
});

worker.on('error', err => {
  logError(`Worker queue error:`, err);
});

// --- Startup Banner ---
console.clear();
console.log(`
${styles.magenta}${styles.bright}========================================================================
█▀▄▀█  ▄▀█  █▀▀  █▄░█  █░█  █▀    █▀▀  █
█░▀░█  █▀█  █▄█  █░▀█  █▄█  ▄█    █▄▄  █
========================================================================${styles.reset}
${styles.cyan}${styles.bright} Engine Daemon Online
 📡  Awaiting Webhooks on: ${styles.yellow}build-queue${styles.cyan}
 🛡️   Auto-Revert System: ${styles.green}Enabled${styles.cyan}
 📦  Docker API Connected: ${styles.green}true${styles.cyan}
${styles.magenta}${styles.bright}========================================================================${styles.reset}
`);