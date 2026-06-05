const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const pool = require("./db");

const healthRoutes = require("./routes/health");
const repositoryRoutes = require("./routes/repositories");
const buildRoutes = require("./routes/builds");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/repositories", repositoryRoutes);
app.use("/api/builds", buildRoutes);

app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
  //write database connection health check log
  pool.query("SELECT NOW()")
    .then(result => {
      console.log(`Database connection successful. Current time: ${result.rows[0].now}`);
    })
    .catch(error => {
      console.error("Database connection failed:", error);
    });
});
