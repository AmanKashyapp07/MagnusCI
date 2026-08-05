/**
 * MagnusCI Worker Utility Helpers Facade
 * 
 * Provides terminal ANSI formatting, project language detection,
 * log database persistence, and backwards-compatible delegate interfaces.
 */

const Docker = require('dockerode');
const path = require('path');
const fs = require('fs').promises;
const pool = require('../db');
const { pullImage } = require('../pipeline/stageRunner');
const { extractTestSummary, extractDetailedTestResults, handleRevertCommit } = require('../pipeline/autoRevertService');
const { harvestArtifacts } = require('../pipeline/artifactService');

// Terminal Styling Tokens
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

/**
 * Saves or updates terminal log streams in the database.
 * 
 * @param {number|string} buildId - Build ID
 * @param {string} logs - Terminal logs
 */
const saveLogs = async (buildId, logs) => {
  try {
    const res = await pool.query('SELECT id FROM build_logs WHERE build_id = $1', [buildId]);
    if (res.rows.length > 0) {
      await pool.query('UPDATE build_logs SET log_message = $1 WHERE build_id = $2', [logs, buildId]);
    } else {
      await pool.query('INSERT INTO build_logs (build_id, log_message) VALUES ($1, $2)', [buildId, logs]);
    }
  } catch (err) {
    logError(`Failed to save DB logs for build ${buildId}`, err);
  }
};

/**
 * Inspects a workspace directory to detect project language, base container, and default commands.
 * 
 * @param {string} workspacePath - Host workspace directory
 * @returns {Promise<{ language: string, imageName: string, runCommand: string }>}
 */
const detectProjectContext = async (workspacePath) => {
  const fileExists = async (filename) => {
    return fs.access(path.join(workspacePath, filename))
      .then(() => true)
      .catch(() => false);
  };

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

    if (config.image && config.run) {
      return {
        language: config.language || 'custom',
        imageName: config.image,
        runCommand: config.run
      };
    }

    throw new Error("Invalid configuration: 'stages' map or 'image' and 'run' fields are required in magnus-ci.json.");
  }

  if (await fileExists('package.json')) {
    return {
      language: 'Node.js',
      imageName: 'node:20-alpine',
      runCommand: 'npm ci || npm install && npm test -- --passWithNoTests && npm run build --if-present'
    };
  }

  if (await fileExists('go.mod')) {
    return {
      language: 'Go',
      imageName: 'golang:1.21-alpine',
      runCommand: 'go test -v ./...'
    };
  }

  if (await fileExists('requirements.txt') || await fileExists('pyproject.toml') || await fileExists('setup.py')) {
    const installCmd = await fileExists('requirements.txt') ? 'pip install -r requirements.txt && ' : '';
    return {
      language: 'Python',
      imageName: 'python:3.10-alpine',
      runCommand: `${installCmd}python -m unittest discover`
    };
  }

  if (await fileExists('pom.xml')) {
    return {
      language: 'Java (Maven)',
      imageName: 'maven:3.9-eclipse-temurin-17-alpine',
      runCommand: 'mvn test'
    };
  }

  if (await fileExists('build.gradle')) {
    return {
      language: 'Java (Gradle)',
      imageName: 'gradle:8-jdk17-alpine',
      runCommand: 'gradle test'
    };
  }

  if (await fileExists('CMakeLists.txt')) {
    return {
      language: 'C/C++ (CMake)',
      imageName: 'gcc:13',
      runCommand: 'mkdir -p build && cd build && cmake .. && make && ctest'
    };
  }

  if (await fileExists('Makefile')) {
    return {
      language: 'C/C++ (Make)',
      imageName: 'gcc:13',
      runCommand: 'make test'
    };
  }

  throw new Error("Could not auto-detect project language type. Please add a 'magnus-ci.json' file to configure your build environment.");
};

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
  extractDetailedTestResults,
  handleRevertCommit,
  harvestArtifacts
};
