const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

// Get all repositories associated with the logged-in user
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM repositories WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const normalizeUrl = (url) => {
  if (!url) return url;
  return url.trim().toLowerCase().replace(/\.git$/, "").replace(/\/$/, "");
};

const parseRepoUrl = (url) => {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
};

const registerGitHubWebhook = async (owner, repo) => {
  const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
  const BACKEND_URL = process.env.FRONTEND_URL || "http://magnus-ci.online";
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

  if (!GITHUB_TOKEN) {
    console.log("No GITHUB_TOKEN provided, skipping automated webhook registration.");
    return;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "MagnusCI-App",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["push"],
        config: {
          url: `${BACKEND_URL}/api/webhooks/github`,
          content_type: "json",
          secret: GITHUB_WEBHOOK_SECRET,
          insecure_ssl: "0"
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`GitHub Webhook registration failed: ${errorData.message}`);
    } else {
      console.log(`Successfully registered webhook for ${owner}/${repo}`);
    }
  } catch (error) {
    console.error(`Error registering webhook: ${error.message}`);
  }
};

// Register a repository for the logged-in user
router.post("/", authenticateToken, async (req, res) => {
  const { name, github_url } = req.body;
  if (!name || !github_url) {
    return res.status(400).json({ error: "name and github_url are required" });
  }
  const normalizedUrl = normalizeUrl(github_url);
  try {
    const result = await pool.query(
      "INSERT INTO repositories (name, github_url, user_id) VALUES ($1, $2, $3) RETURNING *",
      [name, normalizedUrl, req.user.id]
    );

    // Automatically register webhook
    const parsed = parseRepoUrl(normalizedUrl);
    if (parsed) {
      // Background registration so we don't block the API response
      registerGitHubWebhook(parsed.owner, parsed.repo).catch(console.error);
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Delete repository (workspace) and cascade to builds
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM repositories WHERE id = $1 AND user_id = $2 RETURNING *",
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Repository not found or unauthorized" });
    }
    res.json({ message: "Repository deleted successfully", repository: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
