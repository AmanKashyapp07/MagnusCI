const pool = require('../db');

async function updateGitHubStatus(owner, repo, sha, state, description, targetUrl, customToken = null) {
  let token = customToken;
  
  if (!token) {
    try {
      const res = await pool.query(
        `SELECT u.access_token 
         FROM repositories r 
         JOIN users u ON r.user_id = u.id 
         WHERE r.github_url LIKE $1 LIMIT 1`,
        [`%${owner}/${repo}%`]
      );
      token = res.rows[0]?.access_token;
    } catch (e) {}
  }
  
  token = token || process.env.GITHUB_TOKEN;

  if (!token) {
    console.warn(`No GitHub token available to post status badge for ${owner}/${repo}@${sha}`);
    return;
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MagnusCI-App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        state, // 'pending', 'success', 'error', or 'failure'
        description,
        context: 'Magnus CI / Pipeline Status',
        target_url: targetUrl
      })
    });
    
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      console.error(`Failed to update GitHub status for ${owner}/${repo}@${sha}: ${response.status} ${errJson.message || response.statusText}`);
    } else {
      console.log(`Successfully updated GitHub status badge for ${owner}/${repo}@${sha} -> ${state}`);
    }
  } catch (error) {
    console.error(`Error updating GitHub status: ${error.message}`);
  }
}

module.exports = { updateGitHubStatus };
