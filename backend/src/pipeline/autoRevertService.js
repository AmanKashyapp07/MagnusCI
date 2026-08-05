/**
 * MagnusCI Auto-Revert VCS Recovery Service
 * 
 * Implements automated Git commit revert strategies, failure detail extraction,
 * and remote GitHub synchronization following production engineering patterns.
 */

const simpleGit = require('simple-git');
const logger = require('../utils/logger');

/**
 * Extracts a concise test failure summary from raw log output.
 * 
 * @param {string} logs - Terminal build logs
 * @param {string} defaultMsg - Default fallback message
 * @returns {string} Summary status text
 */
function extractTestSummary(logs, defaultMsg = 'Pipeline failed') {
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
}

/**
 * Extracts specific failed test lines from terminal output for revert commit bodies.
 * 
 * @param {string} logs - Terminal logs
 * @returns {string} Formatted test failure text
 */
function extractDetailedTestResults(logs) {
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
}

/**
 * Automatically creates and pushes a git revert commit for a broken build.
 * 
 * @param {string} workspacePath - Path to local repository workspace
 * @param {string} repoUrl - Target repository URL
 * @param {string} commitHash - SHA commit to revert
 * @param {string} branchName - Target branch (e.g. main)
 * @param {number} buildId - Build ID
 * @param {string} buildLogs - Full terminal logs
 * @returns {Promise<string>} Execution status log
 */
async function handleRevertCommit(workspacePath, repoUrl, commitHash, branchName, buildId, buildLogs) {
  if (!process.env.GITHUB_TOKEN) {
    logger.info(`[REVERT] No GITHUB_TOKEN configured. Cannot auto-revert commit.`);
    return `\n[REVERT] No GITHUB_TOKEN configured. Cannot auto-revert commit.\n`;
  }

  let logOutput = `\n[REVERT] Auto-revert started for commit ${commitHash} on branch ${branchName}\n`;
  
  try {
    const repoGit = simpleGit(workspacePath);
    
    await repoGit.addConfig('user.name', 'Magnus CI');
    await repoGit.addConfig('user.email', 'ci@magnus.internal');
    logOutput += `[REVERT] Configured git identity to Magnus CI.\n`;

    const authenticatedUrl = repoUrl.replace('https://', `https://${process.env.GITHUB_TOKEN}@`);
    await repoGit.remote(['set-url', 'origin', authenticatedUrl]);
    logOutput += `[REVERT] Remote URL configured with GITHUB_TOKEN.\n`;

    const originalSubject = await repoGit.raw(['log', '-1', '--format=%s', commitHash])
      .then(s => s.trim())
      .catch(() => `commit ${commitHash.slice(0, 7)}`);

    await repoGit.raw(['revert', '--no-commit', commitHash]);
    logOutput += `[REVERT] Revert changes staged locally.\n`;

    const testDetails = extractDetailedTestResults(buildLogs);
    const commitMsg = `Revert "${originalSubject}"\n\nThis reverts commit ${commitHash}.\n\nTest Case Failures/Details:\n${testDetails}`;

    await repoGit.commit(commitMsg);
    logOutput += `[REVERT] Custom revert commit created locally.\n`;

    await repoGit.push('origin', `HEAD:${branchName}`);
    logOutput += `[REVERT] Revert commit successfully pushed to branch ${branchName}.\n`;
  } catch (err) {
    logOutput += `[REVERT] Error performing auto-revert: ${err.message}\n`;
    logger.error(`[REVERT] Auto-revert failed for build ID ${buildId}:`, err.message);
  }
  return logOutput;
}

module.exports = {
  extractTestSummary,
  extractDetailedTestResults,
  handleRevertCommit
};
