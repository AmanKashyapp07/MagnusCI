const pool = require('../db');
const logger = require('./logger');

class GitHubPrBot {
  /**
   * Formats a rich Markdown comment report summarizing build execution details.
   * 
   * @param {Object} data - Build summary metadata
   * @returns {string} Rich Markdown report
   */
  formatCommentBody(data) {
    const {
      buildId,
      commitSha,
      branch = 'main',
      status = 'SUCCESS',
      durationSeconds = 0,
      stages = [],
      previewUrl = null,
      artifacts = [],
      baseUrl = process.env.BASE_URL || 'http://129.154.39.198/ci'
    } = data;

    const statusBadge = status === 'SUCCESS' ? '✅ **PASSED**' : '❌ **FAILED**';
    const shortSha = commitSha ? commitSha.substring(0, 7) : 'HEAD';
    const formattedPreviewUrl = previewUrl 
      ? (previewUrl.startsWith('http') ? previewUrl : `http://129.154.39.198${previewUrl}`)
      : null;

    let markdown = `### ⚡ MagnusCI Pipeline Execution Report\n\n`;
    markdown += `| Pipeline Attribute | Details |\n`;
    markdown += `| :--- | :--- |\n`;
    markdown += `| **Status** | ${statusBadge} |\n`;
    markdown += `| **Build ID** | \`#${buildId}\` |\n`;
    markdown += `| **Commit** | [\`${shortSha}\`] | Branch: \`${branch}\` |\n`;
    markdown += `| **Duration** | ⏱️ **${durationSeconds}s** |\n\n`;

    // ─── ⏱️ Stage Breakdown ──────────────────────────────────────────────────
    if (stages && stages.length > 0) {
      markdown += `#### ⏱️ DAG Stage Execution Breakdown\n\n`;
      markdown += `| Stage | Command | Duration | Status |\n`;
      markdown += `| :--- | :--- | :--- | :--- |\n`;
      for (const st of stages) {
        const icon = st.status === 'SUCCESS' ? '✅' : '❌';
        markdown += `| \`${st.name}\` | \`${st.command || 'N/A'}\` | ${st.durationSeconds || 0}s | ${icon} ${st.status} |\n`;
      }
      markdown += `\n`;
    }

    // ─── 🌐 Live Staging Preview URL ─────────────────────────────────────────
    if (formattedPreviewUrl) {
      markdown += `> [!TIP]\n`;
      markdown += `> 🌐 **Live Staging Preview URL**: [${formattedPreviewUrl}](${formattedPreviewUrl})\n`;
      markdown += `> *Automated 24-hour staging environment preview generated for this build.*\n\n`;
    }

    // ─── 📊 Test Results & Artifact Links ────────────────────────────────────
    markdown += `#### 📊 Build Artifacts & Logs\n\n`;
    markdown += `* **Live Dashboard Logs**: [View Build #${buildId} Logs](${baseUrl}/builds/${buildId})\n`;

    if (artifacts && artifacts.length > 0) {
      markdown += `* **Downloadable Artifacts**:\n`;
      for (const art of artifacts) {
        markdown += `  - 📦 [${art.name}](${art.url})\n`;
      }
    } else {
      markdown += `* **Artifacts**: None generated\n`;
    }

    markdown += `\n---\n*Powered by MagnusCI Ephemeral Container Orchestration Engine* 🚀\n`;
    return markdown;
  }

  /**
   * Resolves a GitHub OAuth access token for the target repository.
   */
  async resolveToken(owner, repo, customToken = null) {
    if (customToken) return customToken;

    try {
      const res = await pool.query(
        `SELECT u.access_token 
         FROM repositories r 
         JOIN users u ON r.user_id = u.id 
         WHERE r.github_url ILIKE $1 AND u.access_token IS NOT NULL LIMIT 1`,
        [`%${owner}/${repo}%`]
      );
      if (res.rows[0]?.access_token) return res.rows[0].access_token;
    } catch {}

    try {
      const fallbackUser = await pool.query(
        `SELECT access_token FROM users WHERE access_token IS NOT NULL AND access_token != '' ORDER BY id DESC LIMIT 1`
      );
      if (fallbackUser.rows[0]?.access_token) return fallbackUser.rows[0].access_token;
    } catch {}

    if (process.env.GITHUB_TOKEN && !process.env.GITHUB_TOKEN.includes('your_github')) {
      return process.env.GITHUB_TOKEN;
    }

    return null;
  }

  /**
   * Posts an automated rich Markdown comment to the target GitHub Pull Request / Issue.
   * 
   * @param {Object} opts - Target & payload parameters
   * @returns {Promise<{ posted: boolean, commentUrl: string|null }>}
   */
  async postPullRequestComment(opts) {
    const { owner, repo, pullNumber, buildData, token: customToken = null } = opts;

    if (!owner || !repo || !pullNumber) {
      logger.warn(`Skipping GitHub PR comment: owner, repo, or pullNumber is missing.`);
      return { posted: false, commentUrl: null };
    }

    const token = await this.resolveToken(owner, repo, customToken);
    if (!token) {
      logger.warn(`No GitHub token available to post PR comment for ${owner}/${repo}#${pullNumber}`);
      return { posted: false, commentUrl: null };
    }

    const body = this.formatCommentBody(buildData);
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/comments`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MagnusCI-Bot',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        logger.error(`Failed to post GitHub PR comment to ${owner}/${repo}#${pullNumber}: ${response.status} ${errJson.message || response.statusText}`);
        return { posted: false, commentUrl: null };
      }

      const resJson = await response.json();
      logger.info(`Successfully posted MagnusCI comment to GitHub PR ${owner}/${repo}#${pullNumber}`);
      return { posted: true, commentUrl: resJson.html_url || url };
    } catch (error) {
      logger.error(`Error posting GitHub PR comment: ${error.message}`);
      return { posted: false, commentUrl: null };
    }
  }
}

module.exports = new GitHubPrBot();
