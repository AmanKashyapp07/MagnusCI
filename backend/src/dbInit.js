const pool = require('./db');
const logger = require('./utils/logger');

async function initDB() {
  const schemaQuery = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        github_id VARCHAR(100) UNIQUE NOT NULL,
        username VARCHAR(100) NOT NULL,
        avatar_url TEXT,
        access_token TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS access_token TEXT;

    CREATE TABLE IF NOT EXISTS repositories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        github_url TEXT NOT NULL UNIQUE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS builds (
        id SERIAL PRIMARY KEY,
        repository_id INT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        commit_hash VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        artifacts JSONB DEFAULT '[]'::jsonb,
        metrics JSONB DEFAULT '[]'::jsonb
    );

    CREATE TABLE IF NOT EXISTS build_logs (
        id SERIAL PRIMARY KEY,
        build_id INT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
        log_message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
        id SERIAL PRIMARY KEY,
        repository_id INT REFERENCES repositories(id) ON DELETE SET NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_builds_repository_id ON builds(repository_id);
    CREATE INDEX IF NOT EXISTS idx_builds_status ON builds(status);
    CREATE INDEX IF NOT EXISTS idx_build_logs_build_id ON build_logs(build_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_repository_id ON webhook_events(repository_id);
  `;

  try {
    await pool.query(schemaQuery);
    logger.info('✅ PostgreSQL database schema verified & tables initialized (users, repositories, builds, logs)');
  } catch (error) {
    logger.error('❌ Failed to initialize PostgreSQL database schema:', error);
    throw error;
  }
}

module.exports = initDB;
