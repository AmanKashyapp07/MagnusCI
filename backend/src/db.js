const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.POSTGRES_USER || "amankashyap",
  host: process.env.POSTGRES_HOST || "localhost",
  database: process.env.POSTGRES_DB || "ci_cd_engine",
  password: process.env.POSTGRES_PASSWORD || "",
  port: parseInt(process.env.POSTGRES_PORT || "5432", 10)
});

module.exports = pool;