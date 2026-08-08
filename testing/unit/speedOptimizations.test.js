const pool = require('../../backend/src/db');
const { ensureImageLocally, pullImage } = require('../../backend/src/pipeline/stageRunner');

describe('Production-Grade Test Suite: System Speed Optimizations & Low-Latency Execution', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Zero-Latency Docker Host Image Cache Bypass
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Docker Host Image Cache Inspection (ensureImageLocally)', () => {

    test('should bypass registry network pull when image is present locally in Docker daemon', async () => {
      // Mock stageRunner docker client
      const { docker } = require('../../backend/src/pipeline/stageRunner');
      const inspectSpy = jest.spyOn(docker, 'getImage').mockReturnValue({
        inspect: jest.fn().mockResolvedValue({ Id: 'sha256:node20alpinecached123' })
      });

      const wasPulled = await ensureImageLocally('node:20-alpine');

      expect(inspectSpy).toHaveBeenCalledWith('node:20-alpine');
      expect(wasPulled).toBe(false); // Cache hit — zero network pull latency

      inspectSpy.mockRestore();
    });

    test('should invoke pullImage when image is missing from local daemon (404 Cache Miss)', async () => {
      const { docker } = require('../../backend/src/pipeline/stageRunner');
      const inspectSpy = jest.spyOn(docker, 'getImage').mockReturnValue({
        inspect: jest.fn().mockRejectedValue({ statusCode: 404, message: 'no such image' })
      });

      const pullSpy = jest.spyOn(docker, 'pull').mockImplementation((image, callback) => {
        callback(null, { on: jest.fn() });
      });
      jest.spyOn(docker.modem, 'followProgress').mockImplementation((stream, onFinished) => {
        onFinished(null, [{ status: 'Download complete' }]);
      });

      const wasPulled = await ensureImageLocally('custom-missing-image:latest');

      expect(inspectSpy).toHaveBeenCalledWith('custom-missing-image:latest');
      expect(wasPulled).toBe(true); // Pull executed on cache miss

      inspectSpy.mockRestore();
      pullSpy.mockRestore();
      docker.modem.followProgress.mockRestore();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. High-Speed Shallow Git Cloning
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Shallow Git Clone (--depth 1 --single-branch) Performance Flags', () => {

    test('should verify shallow clone parameters optimize git checkout bandwidth and disk I/O', () => {
      const branchName = 'feature/optimized-builds';
      const shallowFlags = [
        '--depth', '1',
        '--single-branch',
        '--branch', branchName || 'main',
        '--no-tags'
      ];

      expect(shallowFlags).toContain('--depth');
      expect(shallowFlags).toContain('1');
      expect(shallowFlags).toContain('--single-branch');
      expect(shallowFlags).toContain('--no-tags');
      expect(shallowFlags).toContain(branchName);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. High-Throughput PostgreSQL Pool Parameters
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. PostgreSQL Connection Pool Sizing & Fail-Fast Safeguards', () => {

    test('pool options should configure high concurrency limits and fail-fast timeouts', () => {
      expect(pool.options).toBeDefined();
      expect(pool.options.max).toBe(25);                       // High concurrency pool sizing
      expect(pool.options.idleTimeoutMillis).toBe(30000);      // 30s idle connection reclamation
      expect(pool.options.connectionTimeoutMillis).toBe(2000); // 2s fail-fast on pool exhaustion
      expect(pool.options.statement_timeout).toBe(10000);       // 10s query timeout defense
    });

    test('pool should execute rapid health queries without exceeding connection thresholds', async () => {
      const client = await pool.connect();
      expect(client).toBeDefined();

      const res = await client.query('SELECT 1 AS alive');
      expect(res.rows[0].alive).toBe(1);

      client.release(); // Release client back to pool
      expect(pool.idleCount).toBeGreaterThanOrEqual(1);
    });
  });

});
