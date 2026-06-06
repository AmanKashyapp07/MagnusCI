const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

// Get all builds associated with the logged-in user's repositories
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT b.*, r.name as repository_name FROM builds b JOIN repositories r ON b.repository_id = r.id WHERE r.user_id = $1 ORDER BY b.created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Get logs for a specific build
router.get("/:id/logs", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const buildResult = await pool.query(
      "SELECT b.*, r.name as repository_name FROM builds b JOIN repositories r ON b.repository_id = r.id WHERE b.id = $1 AND r.user_id = $2",
      [id, req.user.id]
    );

    if (buildResult.rows.length === 0) {
      return res.status(404).json({ error: "Build not found or unauthorized" });
    }

    const logResult = await pool.query(
      "SELECT log_message FROM build_logs WHERE build_id = $1",
      [id]
    );

    const logMessage = logResult.rows.length > 0 ? logResult.rows[0].log_message : "";

    res.json({
      build: buildResult.rows[0],
      logs: logMessage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
