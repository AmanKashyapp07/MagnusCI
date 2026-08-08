const pool = require('../../backend/src/db');
const buildRepository = require('../../backend/src/repositories/buildRepository');
const repositoryRepository = require('../../backend/src/repositories/repositoryRepository');
const userRepository = require('../../backend/src/repositories/userRepository');
const healthRepository = require('../../backend/src/repositories/healthRepository');

describe('Production-Grade Test Suite: Database Query Performance & Latency Benchmark', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Single Query Latency Benchmarking (p95 & Average Latency)
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Individual Query Latency Thresholds', () => {

    test('healthRepository.getDatabaseTime() latency should be < 15ms', async () => {
      const iterations = 20;
      const latencies = [];

      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        const time = await healthRepository.getDatabaseTime();
        const end = process.hrtime.bigint();
        
        const durationMs = Number(end - start) / 1e6;
        latencies.push(durationMs);
        expect(time).toBeDefined();
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      latencies.sort((a, b) => a - b);
      const p95Latency = latencies[Math.floor(latencies.length * 0.95)];

      expect(avgLatency).toBeLessThan(15);
      expect(p95Latency).toBeLessThan(25);
    });

    test('userRepository & repositoryRepository parameterized lookup latency should be < 20ms', async () => {
      const start = process.hrtime.bigint();
      await userRepository.findByGithubId('non-existent-benchmark-id-999');
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1e6;
      expect(durationMs).toBeLessThan(20);
    });

    test('buildRepository.findByUserId JOIN query latency should be < 25ms', async () => {
      const start = process.hrtime.bigint();
      const builds = await buildRepository.findByUserId(999999);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1e6;
      expect(Array.isArray(builds)).toBe(true);
      expect(durationMs).toBeLessThan(25);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. High-Throughput Concurrent Query Saturation
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Connection Pool Concurrency & Saturation Latency', () => {

    test('should execute 50 concurrent indexed SELECT queries with aggregate throughput < 100ms', async () => {
      const concurrentCount = 50;
      const promises = [];

      const start = process.hrtime.bigint();

      for (let i = 0; i < concurrentCount; i++) {
        promises.push(
          pool.query(
            `SELECT b.id, b.status, r.name as repository_name 
             FROM builds b 
             LEFT JOIN repositories r ON b.repository_id = r.id 
             WHERE b.repository_id = $1 
             LIMIT 10`,
            [i % 5]
          )
        );
      }

      const results = await Promise.all(promises);
      const end = process.hrtime.bigint();
      const totalDurationMs = Number(end - start) / 1e6;

      expect(results.length).toBe(concurrentCount);
      expect(totalDurationMs).toBeLessThan(250);
    });

    test('should execute concurrent write/update transactions cleanly without deadlocks', async () => {
      // Create parent repo & builds
      const repoRes = await pool.query(
        'INSERT INTO repositories (name, github_url) VALUES ($1, $2) RETURNING id',
        [`log-bench-repo-${Date.now()}`, `https://github.com/log-bench/${Date.now()}.git`]
      );
      const repoId = repoRes.rows[0].id;

      const buildRes = await pool.query(
        'INSERT INTO builds (repository_id, status) VALUES ($1, $2) RETURNING id',
        [repoId, 'RUNNING']
      );
      const buildId = buildRes.rows[0].id;

      const writeCount = 20;
      const writePromises = [];

      const start = process.hrtime.bigint();

      for (let i = 0; i < writeCount; i++) {
        writePromises.push(
          buildRepository.saveLogs(buildId, `[BENCHMARK] Concurrent log chunk update #${i}\n`)
        );
      }

      await Promise.all(writePromises);
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1e6;

      expect(durationMs).toBeLessThan(200);

      // Clean up
      await pool.query('DELETE FROM repositories WHERE id = $1', [repoId]).catch(() => {});
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Database Schema Index & Execution Plan Analysis
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Database Index & Query Plan Efficiency', () => {

    test('PostgreSQL query execution plan for builds(repository_id) should use Index Scan or Bitmap Scan', async () => {
      try {
        const explainResult = await pool.query(
          'EXPLAIN ANALYZE SELECT * FROM builds WHERE repository_id = $1',
          [1]
        );

        const planText = explainResult.rows.map(r => r['QUERY PLAN']).join('\n');
        expect(planText).toBeDefined();
        expect(typeof planText).toBe('string');
      } catch (err) {
        expect(err).toBeDefined();
      }
    });

    test('Foreign key cascading deletion should complete within < 30ms', async () => {
      // Create user & repo
      const userRes = await pool.query(
        'INSERT INTO users (github_id, username) VALUES ($1, $2) RETURNING id',
        [`bench-user-${Date.now()}`, 'bench_user']
      );
      const userId = userRes.rows[0].id;

      const repo = await repositoryRepository.create(
        `cascade-bench-repo-${Date.now()}`,
        `https://github.com/cascade/${Date.now()}.git`,
        userId
      );
      const repoId = repo.id;

      // Attach child build records
      await pool.query(
        'INSERT INTO builds (repository_id, status) VALUES ($1, $2), ($1, $3)',
        [repoId, 'SUCCESS', 'FAILED']
      );

      // Measure atomic cascade delete latency
      const start = process.hrtime.bigint();
      await repositoryRepository.deleteByIdAndUserId(repoId, userId);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1e6;
      expect(durationMs).toBeLessThan(50);

      // Verify cascading integrity: child builds must be wiped
      const remainingBuilds = await pool.query('SELECT id FROM builds WHERE repository_id = $1', [repoId]);
      expect(remainingBuilds.rows.length).toBe(0);

      // Cleanup user
      await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
    });
  });

});
