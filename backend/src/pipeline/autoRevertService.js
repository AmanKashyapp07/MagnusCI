/**
 * MagnusCI Auto-Revert & Test Analytics Engine
 */

const simpleGit = require('simple-git');
const logger = require('../utils/logger');

/**
 * Extracts a concise summary from test runner log outputs.
 * 
 * @param {string} buildLogs - Raw terminal logs
 * @returns {string} Clean summary statement
 */
function extractTestSummary(buildLogs) {
  if (!buildLogs) return 'No test execution output found.';

  const lines = buildLogs.split('\n');
  const summaryLines = [];

  for (const line of lines) {
    const cleanLine = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
    
    if (
      cleanLine.includes('Tests:') ||
      cleanLine.includes('Test Suites:') ||
      cleanLine.includes('FAIL') ||
      cleanLine.includes('FAILED') ||
      cleanLine.includes('ERR!') ||
      cleanLine.includes('AssertionError') ||
      cleanLine.includes('Ran all test suites')
    ) {
      summaryLines.push(cleanLine);
    }
  }

  return summaryLines.length > 0 ? summaryLines.join('\n') : 'Pipeline execution encountered build or test failure.';
}

/**
 * Extracts structured failure details from logs.
 * 
 * @param {string} buildLogs - Raw terminal logs
 * @returns {string} Failure stack traces / details
 */
function extractDetailedTestResults(buildLogs) {
  if (!buildLogs) return 'No detailed logs recorded.';

  const lines = buildLogs.split('\n');
  const failureDetails = [];
  let capturing = false;

  for (const line of lines) {
    const cleanLine = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();

    if (cleanLine.includes('FAIL') || cleanLine.includes('❌') || cleanLine.includes('Error:')) {
      capturing = true;
    }

    if (capturing) {
      failureDetails.push(cleanLine);
      if (failureDetails.length >= 25) break;
    }
  }

  return failureDetails.length > 0 ? failureDetails.join('\n') : extractTestSummary(buildLogs);
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
async function handleRevertCommit(workspacePath, repoUrl, commitHash, branchName, buildId, buildLogs, owner = null, repoName = null) {
  let token = null;

  if (!owner || !repoName) {
    const match = repoUrl ? repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/) : null;
    if (match) {
      owner = owner || match[1];
      repoName = repoName || match[2].replace(/\.git$/, '');
    }
  }

  if (owner && repoName) {
    try {
      const pool = require('../db');
      const res = await pool.query(
        `SELECT u.access_token 
         FROM repositories r 
         JOIN users u ON r.user_id = u.id 
         WHERE r.github_url ILIKE $1 AND u.access_token IS NOT NULL AND u.access_token != '' LIMIT 1`,
        [`%${owner}/${repoName}%`]
      );
      token = res.rows[0]?.access_token;
    } catch (e) {}
  }

  if (!token) {
    try {
      const pool = require('../db');
      const fallbackUser = await pool.query(
        `SELECT access_token FROM users WHERE access_token IS NOT NULL AND access_token != '' AND access_token NOT ILIKE '%your_github%' ORDER BY id DESC LIMIT 1`
      );
      token = fallbackUser.rows[0]?.access_token;
    } catch (e) {}
  }

  if (!token && process.env.GITHUB_TOKEN) {
    const envToken = process.env.GITHUB_TOKEN.trim();
    if (!envToken.includes('your_github') && !envToken.includes('placeholder')) {
      token = envToken;
    }
  }

  if (!token) {
    logger.info(`[REVERT] No GitHub token configured. Cannot auto-revert commit.`);
    return `\n[REVERT] No GitHub token configured. Cannot auto-revert commit.\n`;
  }

  let logOutput = `\n[REVERT] Auto-revert started for commit ${commitHash} on branch ${branchName}\n`;
  
  try {
    const repoGit = simpleGit(workspacePath, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' }
    });
    
    await repoGit.addConfig('user.name', 'Magnus CI');
    await repoGit.addConfig('user.email', 'ci@magnus.internal');
    logOutput += `[REVERT] Configured git identity to Magnus CI.\n`;

    let cleanUrl = repoUrl;
    if (cleanUrl.includes('@')) {
      cleanUrl = cleanUrl.replace(/https:\/\/[^@]+@/, 'https://');
    }
    const authenticatedUrl = cleanUrl.replace('https://', `https://${token}@`);
    await repoGit.remote(['set-url', 'origin', authenticatedUrl]);
    logOutput += `[REVERT] Remote URL configured with GITHUB_TOKEN.\n`;

    await repoGit.raw(['reset', '--hard', 'HEAD']).catch(() => {});
    await repoGit.raw(['clean', '-fd']).catch(() => {});

    const originalSubject = await repoGit.raw(['log', '-1', '--format=%s', commitHash])
      .then(s => s.trim())
      .catch(() => `commit ${commitHash.slice(0, 7)}`);

    await repoGit.raw(['revert', '--no-commit', commitHash]);
    logOutput += `[REVERT] Revert changes staged locally.\n`;

    const testDetails = extractDetailedTestResults(buildLogs);
    const commitMsg = `Revert "${originalSubject}"\n\nThis reverts commit ${commitHash}.\n\nTest Case Failures/Details:\n${testDetails}`;

    await repoGit.commit(commitMsg);
    logOutput += `[REVERT] Custom revert commit created locally.\n`;

    await repoGit.raw(['push', 'origin', `HEAD:${branchName}`]);
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

