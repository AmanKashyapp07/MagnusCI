const express = require("express");
const pool = require("../db");

const router = express.Router();

// Basic route to get all repositories
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM repositories ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Basic route to register a repository
router.post("/", async (req, res) => {
  const { name, github_url } = req.body;
  if (!name || !github_url) {
    return res.status(400).json({ error: "name and github_url are required" });
  }
  try {
    const result = await pool.query(
      "INSERT INTO repositories (name, github_url) VALUES ($1, $2) RETURNING *",
      [name, github_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
