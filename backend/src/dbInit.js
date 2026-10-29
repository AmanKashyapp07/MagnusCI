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
        completed_at TIMESTAMP,
        artifacts JSONB DEFAULT '[]'::jsonb,
        metrics JSONB DEFAULT '[]'::jsonb
    );
    ALTER TABLE builds ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    ALTER TABLE builds ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP;
    ALTER TABLE builds ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;

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
    await seedDemoData();
  } catch (error) {
    logger.error('❌ Failed to initialize PostgreSQL database schema:', error);
    throw error;
  }
}

async function seedDemoData() {
  const fs = require('fs');
  const path = require('path');

  try {
    // 1. Ensure Demo User exists
    let userRes = await pool.query("SELECT id FROM users WHERE github_id = 'demo_interviewer' OR id = 1 LIMIT 1");
    let userId;
    if (userRes.rows.length === 0) {
      const newUser = await pool.query(
        "INSERT INTO users (github_id, username, avatar_url, access_token) VALUES ($1, $2, $3, $4) RETURNING id",
        ['demo_interviewer', 'Interviewer / Demo User', 'https://github.com/ghost.png', 'demo_token']
      );
      userId = newUser.rows[0].id;
    } else {
      userId = userRes.rows[0].id;
    }

    // 2. Ensure Sample Repositories exist for this user
    const sampleRepos = [
      { name: 'magnus-ci-engine', url: 'https://github.com/AmanKashyapp07/ci-cd-engine' },
      { name: 'react-storefront-demo', url: 'https://github.com/AmanKashyapp07/react-storefront-demo' },
      { name: 'payment-service-api', url: 'https://github.com/AmanKashyapp07/payment-service-api' }
    ];

    for (const r of sampleRepos) {
      const existing = await pool.query("SELECT id FROM repositories WHERE github_url = $1", [r.url]);
      if (existing.rows.length === 0) {
        await pool.query(
          "INSERT INTO repositories (name, github_url, user_id) VALUES ($1, $2, $3)",
          [r.name, r.url, userId]
        );
      } else {
        await pool.query("UPDATE repositories SET user_id = $1 WHERE id = $2 AND user_id IS NULL", [userId, existing.rows[0].id]);
      }
    }

    // 3. Create Demo Staging Preview in /tmp/magnus-previews/build-1
    const previewDir = '/tmp/magnus-previews/build-1';
    if (!fs.existsSync(previewDir)) {
      fs.mkdirSync(previewDir, { recursive: true });
      fs.writeFileSync(
        path.join(previewDir, 'index.html'),
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MagnusCI Staging Preview</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 40px; max-width: 500px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
    .badge { display: inline-block; background: #10b981; color: #022c22; font-weight: bold; font-size: 12px; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 20px; }
    h1 { font-size: 24px; margin: 0 0 12px 0; font-weight: 700; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; }
    .meta { background: #0f172a; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #38bdf8; text-align: left; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Live Staging Preview</div>
    <h1>MagnusCI Preview Environment</h1>
    <p>Automated staging preview generated by MagnusCI DAG execution engine. Assets compiled in memory and served on localhost.</p>
    <div class="meta">
      <div>Pipeline: SUCCESS (0 errors)</div>
      <div>Sandbox: tmpfs In-Memory Container</div>
      <div>Commit: a8f41b2 (Branch: main)</div>
    </div>
  </div>
</body>
</html>`
      );
    }

    // 4. Ensure a showcase successful build exists for magnus-ci-engine
    const repoRes = await pool.query("SELECT id FROM repositories WHERE name = 'magnus-ci-engine' LIMIT 1");
    if (repoRes.rows.length > 0) {
      const engineRepoId = repoRes.rows[0].id;
      const recentEngineBuild = await pool.query(
        "SELECT id FROM builds WHERE repository_id = $1 LIMIT 1",
        [engineRepoId]
      );
      if (recentEngineBuild.rows.length === 0) {
        const newBuild = await pool.query(
          `INSERT INTO builds (repository_id, commit_hash, status, created_at, started_at, finished_at, completed_at, artifacts, metrics) 
           VALUES ($1, $2, $3, NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '4 minutes 45 seconds', NOW() - INTERVAL '4 minutes', NOW() - INTERVAL '4 minutes', $4, $5) RETURNING id`,
          [
            engineRepoId,
            'd9a8f41b2c',
            'SUCCESS',
            JSON.stringify([
              { name: 'Production Build Dist Archive', path: '/artifacts/demo/dist.tar.gz', type: 'file' },
              { name: 'Jest Test Coverage Report', path: '/artifacts/demo/coverage/index.html', type: 'html' }
            ]),
            JSON.stringify([
              { stage: 'lint', cpu: 12.4, ram: 145.2 },
              { stage: 'unit-test', cpu: 68.1, ram: 280.5 },
              { stage: 'integration-test', cpu: 84.3, ram: 340.0 },
              { stage: 'build-assets', cpu: 45.0, ram: 210.8 }
            ])
          ]
        );
        const bId = newBuild.rows[0].id;
        const richLogs = `[10:00:01] [WORKER] Job Picked Up | Build ID: ${bId}
[10:00:01] [ENGINE] Allocated isolated build workspace: /dev/shm/magnus-builds/workspace-${bId} (tmpfs RAM-disk)
[10:00:02] [ENGINE] Cloning repository https://github.com/AmanKashyapp07/ci-cd-engine (commit d9a8f41)...
[10:00:03] [ENGINE] Detected context: Language=Node.js, Base Image=node:20-alpine
[10:00:03] [ENGINE] Topological DAG stages parsed: lint -> unit-test -> integration-test -> build-assets
[10:00:04] [ENGINE] Spawning sandbox container for stage: lint
[LINT] > eslint . --max-warnings=0
[LINT] ✔ All 42 source files passed ESLint checks. 0 warnings, 0 errors.
[SUCCESS] Stage 'lint' completed successfully.
[10:00:07] [ENGINE] Spawning sandbox container for stage: unit-test
[UNIT-TEST] PASS testing/unit/dagEngineAdvanced.test.js
[UNIT-TEST] PASS testing/unit/cache.test.js
[UNIT-TEST] PASS testing/unit/multiLanguageMatrix.test.js
[UNIT-TEST] Test Suites: 21 passed, 21 total
[UNIT-TEST] Tests:       132 passed, 132 total
[SUCCESS] Stage 'unit-test' completed successfully.
[10:00:15] [ENGINE] Spawning sandbox container for stage: integration-test
[INTEGRATION-TEST] PASS testing/integration/webSocketRealtimeStreaming.test.js
[INTEGRATION-TEST] PASS testing/integration/dbQueryPerformance.test.js
[INTEGRATION-TEST] Test Suites: 7 passed, 7 total
[INTEGRATION-TEST] Tests:       39 passed, 39 total
[SUCCESS] Stage 'integration-test' completed successfully.
[10:00:20] [ENGINE] Spawning sandbox container for stage: build-assets
[BUILD-ASSETS] vite v8.0.16 building client environment for production...
[BUILD-ASSETS] ✓ built in 121ms
[BUILD-ASSETS] dist/index.html 1.17 kB
[BUILD-ASSETS] dist/assets/index-Ba8RlbIJ.js 132.68 kB
[SUCCESS] Stage 'build-assets' completed successfully.
[10:00:23] [ENGINE] DAG pipeline session finished. Exit Code: 0
[10:00:24] [WORKER] Captured 2 build artifact(s) successfully.
[10:00:24] [WORKER] Live preview deployed for build #${bId} at /preview/${bId}/ (14 files, 430 KB)
[10:00:25] [WORKER] Job #${bId} has fully executed and finished context routines.`;

        await pool.query("INSERT INTO build_logs (build_id, log_message) VALUES ($1, $2)", [bId, richLogs]);

        // Copy preview for this build
        const pDir = `/tmp/magnus-previews/build-${bId}`;
        if (!fs.existsSync(pDir)) {
          fs.mkdirSync(pDir, { recursive: true });
          fs.writeFileSync(path.join(pDir, 'index.html'), fs.readFileSync('/tmp/magnus-previews/build-1/index.html'));
        }
      }
    }
  } catch (err) {
    logger.warn('Non-fatal warning while seeding demo data:', err.message);
  }
}

module.exports = initDB;
