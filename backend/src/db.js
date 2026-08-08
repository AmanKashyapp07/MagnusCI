const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.POSTGRES_USER || "amankashyap",
  host: process.env.POSTGRES_HOST || "localhost",
  database: process.env.POSTGRES_DB || "ci_cd_engine",
  password: process.env.POSTGRES_PASSWORD || "",
  port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
  max: 25,                       // Max pool clients for high throughput
  idleTimeoutMillis: 30000,      // Evict idle connections after 30s
  connectionTimeoutMillis: 2000, // Fail fast within 2s on pool exhaustion
  statement_timeout: 10000       // Query timeout safeguard (10s)
});

module.exports = pool;