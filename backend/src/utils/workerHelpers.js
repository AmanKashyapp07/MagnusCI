////////////////////////////////////////////////////////////////////////////////
// MagnusCI Worker Utility Helpers
//
// File Purpose:
// This file aggregates non-core logging, terminal styling, project detection,
// log database persistence, test report extraction, git auto-revert commit
// recovery, and artifact harvesting helper functions to keep the main worker
// code lightweight and readable.
////////////////////////////////////////////////////////////////////////////////

const Docker = require('dockerode');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
const pool = require('../db');

// --- Terminal Styling Helpers (ANSI Colors) ---
const styles = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  bgBlue: '\x1b[44m\x1b[37m',
  bgGreen: '\x1b[42m\x1b[30m',
  bgRed: '\x1b[41m\x1b[37m'
};

const getTimestamp = () => `${styles.dim}[${new Date().toISOString().split('T')[1].slice(0, 8)}]${styles.reset}`;
const logWorker = (msg) => console.log(`${getTimestamp()} ${styles.magenta}${styles.bright}[WORKER]${styles.reset} ${msg}`);
const logEngine = (msg) => `${getTimestamp()} ${styles.cyan}${styles.bright}[ENGINE]${styles.reset} ${msg}`;
const logSuccess = (msg) => console.log(`${getTimestamp()} ${styles.bgGreen} SUCCESS ${styles.reset} ${styles.green}${msg}${styles.reset}`);
const logError = (msg, err) => console.error(`${getTimestamp()} ${styles.bgRed} ERROR ${styles.reset} ${styles.red}${msg}${styles.reset}`, err || '');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

////////////////////////////////////////////////////////////////////////////////
// Function: pullImage
// Purpose: Programmatically pulls a Docker image from a registry.
// Inputs: imageName (string)
// Outputs: Promise resolving to registry completion output
// Side Effects: Downloads image layers to the host disk.
// Time Complexity: O(D) where D is download size and network speed.
////////////////////////////////////////////////////////////////////////////////
const pullImage = (imageName) => {
  return new Promise((resolve, reject) => {
    docker.pull(imageName, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  });
};

////////////////////////////////////////////////////////////////////////////////
// Function: saveLogs
// Purpose: Upserts build log strings in the database.
// Inputs: buildId (number), logs (string)
// Outputs: None
// Side Effects: Updates or inserts a record in PostgreSQL build_logs table.
// Time Complexity: O(1) B-tree lookup.
////////////////////////////////////////////////////////////////////////////////
const saveLogs = async (buildId, logs) => {
  try {
    const res = await pool.query("SELECT id FROM build_logs WHERE build_id = $1", [buildId]);
    if (res.rows.length > 0) {
      await pool.query("UPDATE build_logs SET log_message = $1 WHERE build_id = $2", [logs, buildId]);
    } else {
      await pool.query("INSERT INTO build_logs (build_id, log_message) VALUES ($1, $2)", [buildId, logs]);
    }
  } catch (err) {
    logError(`Failed to save DB logs for build ${buildId}`, err);
  }
};

////////////////////////////////////////////////////////////////////////////////
// Function: detectProjectContext
// Purpose: Identifies build language environments and selects the base container.
// Inputs: workspacePath (string)
// Outputs: Object containing language, imageName, runCommand
// Side Effects: Scans local workspace directory files.
// Time Complexity: O(F) where F is the number of files checked.
////////////////////////////////////////////////////////////////////////////////
const detectProjectContext = async (workspacePath) => {
  // Helper check for file existence
  const fileExists = async (filename) => {
    return fs.access(path.join(workspacePath, filename))
      .then(() => true)
      .catch(() => false);
  };

  // 1. Check for magnus-ci.json
  const configPath = path.join(workspacePath, 'magnus-ci.json');
  let config = null;
  try {
    const data = await fs.readFile(configPath, 'utf8');
    config = JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  if (config) {
    // Check if new DAG format
    if (config.stages && typeof config.stages === 'object') {
      let detectedLanguage = config.language;
      let detectedImage = config.image;

      if (!detectedLanguage) {
        if (await fileExists('package.json')) detectedLanguage = 'Node.js';
        else if (await fileExists('go.mod')) detectedLanguage = 'Go';
        else if (await fileExists('requirements.txt')) detectedLanguage = 'Python';
        else if (await fileExists('pom.xml')) detectedLanguage = 'Java (Maven)';
        else if (await fileExists('build.gradle')) detectedLanguage = 'Java (Gradle)';
        else detectedLanguage = 'custom';
      }

      if (!detectedImage) {
        if (detectedLanguage === 'Node.js') detectedImage = 'node:20-alpine';
        else if (detectedLanguage === 'Go') detectedImage = 'golang:1.21-alpine';
        else if (detectedLanguage === 'Python') detectedImage = 'python:3.10-alpine';
        else if (detectedLanguage.includes('Maven')) detectedImage = 'maven:3.9-eclipse-temurin-17-alpine';
        else if (detectedLanguage.includes('Gradle')) detectedImage = 'gradle:8-jdk17-alpine';
        else detectedImage = 'alpine:latest';
      }

      return {
        language: detectedLanguage,
        imageName: detectedImage,
        runCommand: ''
      };
    }

    // Legacy format check
    if (config.image && config.run) {
      return {
        language: config.language || 'custom',
        imageName: config.image,
        runCommand: config.run
      };
    }

    // Invalid format
    throw new Error("Invalid configuration: 'stages' map or 'image' and 'run' fields are required in magnus-ci.json.");
  }

  // 2. Automated Fallbacks
  // Node.js
  if (await fileExists('package.json')) {
    return {
      language: 'Node.js',
      imageName: 'node:20-alpine',
      runCommand: 'npm ci || npm install && npm test -- --passWithNoTests && npm run build --if-present'
    };
  }

  // Go
  if (await fileExists('go.mod')) {
    return {
      language: 'Go',
      imageName: 'golang:1.21-alpine',
      runCommand: 'go test -v ./...'
    };
  }

  // Python
  if (await fileExists('requirements.txt') || await fileExists('pyproject.toml') || await fileExists('setup.py')) {
    const installCmd = await fileExists('requirements.txt') ? 'pip install -r requirements.txt && ' : '';
    return {
      language: 'Python',
      imageName: 'python:3.10-alpine',
      runCommand: `${installCmd}python -m unittest discover`
    };
  }

  // Java Maven
  if (await fileExists('pom.xml')) {
    return {
      language: 'Java (Maven)',
      imageName: 'maven:3.9-eclipse-temurin-17-alpine',
      runCommand: 'mvn test'
    };
  }

  // Java Gradle
  if (await fileExists('build.gradle')) {
    return {
      language: 'Java (Gradle)',
      imageName: 'gradle:8-jdk17-alpine',
      runCommand: 'gradle test'
    };
  }

  // C/C++ CMake
  if (await fileExists('CMakeLists.txt')) {
    return {
      language: 'C/C++ (CMake)',
      imageName: 'gcc:13',
      runCommand: 'mkdir -p build && cd build && cmake .. && make && ctest'
    };
  }

  // C/C++ Makefile
  if (await fileExists('Makefile')) {
    return {
      language: 'C/C++ (Make)',
      imageName: 'gcc:13',
      runCommand: 'make test'
    };
  }

  throw new Error("Could not auto-detect project language type. Please add a 'magnus-ci.json' file to configure your build environment.");
};

////////////////////////////////////////////////////////////////////////////////
// Function: extractTestSummary
// Purpose: Parses logs using regex to construct a concise test outcome summary.
// Inputs: logs (string), defaultMsg (string)
// Outputs: Summary badge text (string)
// Side Effects: None
// Time Complexity: O(L) where L is length of logs.
////////////////////////////////////////////////////////////////////////////////
const extractTestSummary = (logs, defaultMsg) => {
  if (!logs) return defaultMsg;
  const cleanLogs = logs.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

  const jestRegex = /Tests:\s+(?:(\d+)\s+failed,\s+)?(?:(\d+)\s+passed,\s+)?(\d+)\s+total/;
  const jestMatch = cleanLogs.match(jestRegex);
  if (jestMatch) {
    const failed = parseInt(jestMatch[1] || 0, 10);
    const passed = parseInt(jestMatch[2] || 0, 10);
    const total = parseInt(jestMatch[3] || 0, 10);
    if (failed > 0) return `${passed}/${total} passed (${failed} failed)`;
    return `${passed}/${total} passed`;
  }

  const pytestRegex = /==+\s+(?:(\d+)\s+failed,\s+)?(?:(\d+)\s+passed)?.*in\s+([\d.]+s)\s+==+/;
  const pytestMatch = cleanLogs.match(pytestRegex);
  if (pytestMatch) {
    const failed = parseInt(pytestMatch[1] || 0, 10);
    const passed = parseInt(pytestMatch[2] || 0, 10);
    if (failed > 0) return `${passed} passed, ${failed} failed`;
    return `${passed} passed`;
  }

  const junitRegex = /Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+)/;
  const junitMatch = cleanLogs.match(junitRegex);
  if (junitMatch) {
    const run = parseInt(junitMatch[1] || 0, 10);
    const failures = parseInt(junitMatch[2] || 0, 10);
    const errors = parseInt(junitMatch[3] || 0, 10);
    const passed = run - failures - errors;
    if (failures > 0 || errors > 0) return `${passed}/${run} passed (${failures + errors} failed)`;
    return `${passed}/${run} passed`;
  }

  if (cleanLogs.includes('PASS') && cleanLogs.includes('ok')) {
    return 'All tests passed';
  }
  if (cleanLogs.includes('FAIL') && cleanLogs.includes('--- FAIL:')) {
    return 'Some tests failed';
  }

  return defaultMsg;
};

////////////////////////////////////////////////////////////////////////////////
// Function: extractDetailedTestResults
// Purpose: Compiles failure lists from standard logs to populate revert commits.
// Inputs: logs (string)
// Outputs: Cleaned summary of failed test assertions (string)
// Side Effects: None
// Time Complexity: O(L) where L is lines count.
////////////////////////////////////////////////////////////////////////////////
const extractDetailedTestResults = (logs) => {
  if (!logs) return 'No build logs available.';
  const cleanLogs = logs.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  const lines = cleanLogs.split('\n');
  const results = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('✓') || trimmed.startsWith('✕') || trimmed.startsWith('PASS') || trimmed.startsWith('FAIL')) {
      results.push(trimmed);
    }
    if ((trimmed.includes('PASSED') || trimmed.includes('FAILED')) && trimmed.includes('::')) {
      results.push(trimmed);
    }
  }

  if (results.length === 0) {
    const suitesIndex = cleanLogs.indexOf('Test Suites:');
    if (suitesIndex !== -1) {
      return cleanLogs.substring(suitesIndex).trim();
    }
    return 'Detailed test results not parsed. Please view CI/CD Dashboard.';
  }

  return results.join('\n');
};

////////////////////////////////////////////////////////////////////////////////
// Function: handleRevertCommit
// Purpose: Automatically reverts a broken commit and pushes it back to GitHub.
// Inputs: workspacePath (string), repoUrl (string), commitHash (string),
//         branchName (string), buildId (number), buildLogs (string)
// Outputs: Detailed recovery log (string)
// Side Effects: Modifies git history locally and pushes to GitHub.
// Time Complexity: O(G) where G represents git command execution latency.
////////////////////////////////////////////////////////////////////////////////
const handleRevertCommit = async (workspacePath, repoUrl, commitHash, branchName, buildId, buildLogs) => {
  if (!process.env.GITHUB_TOKEN) {
    logWorker(`[REVERT] No GITHUB_TOKEN configured. Cannot auto-revert commit.`);
    return `\n[REVERT] No GITHUB_TOKEN configured. Cannot auto-revert commit.\n`;
  }

  let owner = '';
  let repoName = '';
  try {
    const parts = repoUrl.split('/');
    repoName = parts.pop().replace('.git', '');
    owner = parts.pop();
  } catch (e) {}

  logWorker(`[REVERT] Initiating auto-revert of commit ${commitHash.slice(0, 7)} on branch ${branchName}...`);
  let logOutput = `\n[REVERT] Auto-revert started for commit ${commitHash} on branch ${branchName}\n`;
  
  try {
    const repoGit = simpleGit(workspacePath);
    
    // Configure identity so git doesn't complain about identity not set
    await repoGit.addConfig('user.name', 'Magnus CI');
    await repoGit.addConfig('user.email', 'ci@magnus.internal');
    logOutput += `[REVERT] Configured git identity to Magnus CI.\n`;

    // Embed GITHUB_TOKEN in remote URL for write/push permissions
    const authenticatedUrl = repoUrl.replace('https://', `https://${process.env.GITHUB_TOKEN}@`);
    await repoGit.remote(['set-url', 'origin', authenticatedUrl]);
    logOutput += `[REVERT] Remote URL configured with GITHUB_TOKEN.\n`;

    // Retrieve original commit subject
    const originalSubject = await repoGit.raw(['log', '-1', '--format=%s', commitHash])
      .then(s => s.trim())
      .catch(() => `commit ${commitHash.slice(0, 7)}`);

    // Perform Revert locally but do not commit yet
    await repoGit.raw(['revert', '--no-commit', commitHash]);
    logOutput += `[REVERT] Revert changes staged locally.\n`;

    // Format custom commit message containing test summary
    const testDetails = extractDetailedTestResults(buildLogs);
    const commitMsg = `Revert "${originalSubject}"

This reverts commit ${commitHash}.

Test Case Failures/Details:
${testDetails}`;

    // Commit changes with custom description
    await repoGit.commit(commitMsg);
    logOutput += `[REVERT] Custom revert commit created locally.\n`;

    // Push changes back to origin
    await repoGit.push('origin', `HEAD:${branchName}`);
    logOutput += `[REVERT] Revert commit successfully pushed to branch ${branchName}.\n`;
    logWorker(`[REVERT] Revert commit successfully pushed to branch ${branchName}.`);
  } catch (err) {
    logOutput += `[REVERT] Error performing auto-revert: ${err.message}\n`;
    logError(`[REVERT] Auto-revert failed for build ID ${buildId}:`, err.message);
  }
  return logOutput;
};

////////////////////////////////////////////////////////////////////////////////
// Function: harvestArtifacts
// Purpose: Scans workspace folders to archive code coverage reports and compiled binaries.
// Inputs: workspacePath (string), buildId (number)
// Outputs: Array of artifact metadata objects
// Side Effects: Creates target folder directory, copies files across the host disk.
// Time Complexity: O(A) where A is size of directory objects.
////////////////////////////////////////////////////////////////////////////////
async function harvestArtifacts(workspacePath, buildId) {
  const artifacts = [];
  const publicArtifactsDir = path.join(__dirname, '../public/artifacts', String(buildId));
  await fs.mkdir(publicArtifactsDir, { recursive: true });

  const fileExists = async (p) => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  };

  // 1. Jest Coverage
  const jestCoveragePath = path.join(workspacePath, 'coverage/lcov-report');
  if (await fileExists(jestCoveragePath)) {
    const dest = path.join(publicArtifactsDir, 'coverage');
    await fs.mkdir(dest, { recursive: true });
    await fs.cp(jestCoveragePath, dest, { recursive: true });
    artifacts.push({
      name: "Jest Test Coverage Report",
      path: `/artifacts/${buildId}/coverage/index.html`,
      type: "html"
    });
  }

  // 2. Python Coverage
  const pyCoveragePath = path.join(workspacePath, 'htmlcov');
  if (await fileExists(pyCoveragePath)) {
    const dest = path.join(publicArtifactsDir, 'htmlcov');
    await fs.mkdir(dest, { recursive: true });
    await fs.cp(pyCoveragePath, dest, { recursive: true });
    artifacts.push({
      name: "Python Test Coverage Report",
      path: `/artifacts/${buildId}/htmlcov/index.html`,
      type: "html"
    });
  }

  // 3. Search for compiled binaries (.jar, .war, .zip, etc.)
  const scanDirs = [
    path.join(workspacePath, 'target'),
    path.join(workspacePath, 'build/libs'),
    workspacePath
  ];

  for (const dir of scanDirs) {
    if (await fileExists(dir)) {
      try {
        const files = await fs.readdir(dir, { withFileTypes: true });
        for (const file of files) {
          if (file.isFile()) {
            const ext = path.extname(file.name).toLowerCase();
            const srcFile = path.join(dir, file.name);

            // Determine if the file is executable on Unix/Linux systems
            let isExecutable = false;
            try {
              const stats = await fs.stat(srcFile);
              isExecutable = !!(stats.mode & 0o111);
            } catch (statErr) {
              // Ignore stat error
            }

            // Exclude hidden files or source code/config files from being classified as binaries
            const isSourceOrConfig = ['.cpp', '.c', '.h', '.hpp', '.o', '.js', '.json', '.md', '.txt', '.yml', '.yaml', '.sh'].includes(ext);

            const isAllowedArtifact = 
              ['.jar', '.war', '.zip', '.exe', '.msi', '.out', '.bin'].includes(ext) ||
              file.name.endsWith('.tar.gz') ||
              file.name.endsWith('.tgz') ||
              (ext === '' && isExecutable && !file.name.startsWith('.') && !isSourceOrConfig);

            if (isAllowedArtifact) {
              const destFileDir = path.join(publicArtifactsDir, 'bin');
              await fs.mkdir(destFileDir, { recursive: true });
              const destFile = path.join(destFileDir, file.name);
              await fs.copyFile(srcFile, destFile);
              artifacts.push({
                name: `Built Binary (${file.name})`,
                path: `/artifacts/${buildId}/bin/${file.name}`,
                type: "file"
              });
            }
          }
        }
      } catch (err) {
        // Log reading error and skip
      }
    }
  }

  return artifacts;
}

module.exports = {
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
};
