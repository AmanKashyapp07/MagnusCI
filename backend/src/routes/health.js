const express = require("express");
const pool = require("../db");

const router = express.Router();

// Database connection health check endpoint
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "healthy",
      database: "connected",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message,
    });
  }
});

module.exports = router;
