const express = require("express");
const pool = require("../db");

const router = express.Router();

// Basic route to get all builds
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT b.*, r.name as repository_name FROM builds b JOIN repositories r ON b.repository_id = r.id ORDER BY b.created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
