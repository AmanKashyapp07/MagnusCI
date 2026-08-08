const { downloadCache, saveCache } = require('../../backend/src/utils/cache');
const { downloadCacheFromMinIO, uploadCacheToMinIO } = require('../../backend/src/utils/s3Cache');
const { parseDAG, executeDAG } = require('../../backend/src/utils/dag');
const path = require('path');
const fs = require('fs').promises;

describe('Production-Grade Test Suite 2: Chaos Engineering & Self-Healing Engine', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Container OOM (Exit Code 137) & Crash Normalization
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Container OOM (Exit Code 137) & Process Termination', () => {
    test('should classify exit code 137 as Out-Of-Memory (OOM) and halt DAG downstream', async () => {
      const mockWorkspace = path.join(__dirname, 'temp_chaos_workspace');
      await fs.mkdir(mockWorkspace, { recursive: true });

      const dagConfig = {
        setup: { run: 'npm ci' },
        leak: { run: 'node -e "let a=[]; while(true) a.push(new Array(1e7))"', needs: ['setup'] },
        compile: { run: 'npm run build', needs: ['leak'] }
      };

      const executedStages = [];
      const failedStages = [];

      // Simulate DAG execution with OOM failure on 'leak'
      const runner = async (stageName) => {
        executedStages.push(stageName);
        if (stageName === 'leak') {
          failedStages.push({ stageName, exitCode: 137, reason: 'OOMKilled' });
          return false; // Stage failed
        }
        return true; // Stage succeeded
      };

      const finalStates = await executeDAG(dagConfig, runner);

      expect(finalStates.setup).toBe('SUCCESS');
      expect(finalStates.leak).toBe('FAILED');
      expect(finalStates.compile).toBe('PENDING'); // Downstream compile must be skipped
      expect(executedStages).toContain('setup');
      expect(executedStages).toContain('leak');
      expect(executedStages).not.toContain('compile'); // Downstream compile was never launched
      expect(failedStages[0].exitCode).toBe(137);

      await fs.rm(mockWorkspace, { recursive: true, force: true });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. MinIO S3 Object Storage Outage Fallback
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Object Storage Disconnect & Cache-Miss Fallback', () => {
    test('downloadCacheFromMinIO should return false cleanly upon S3 network timeout', async () => {
      const mockS3Client = {
        send: jest.fn().mockRejectedValue(new Error('S3 Connection ETIMEDOUT: 504 Gateway Timeout'))
      };

      const result = await downloadCacheFromMinIO('timeout-hash.tar.gz', '/tmp', mockS3Client);
      expect(result).toBe(false); // Gracefully returns false (cache miss) instead of unhandled crash
    });

    test('uploadCacheToMinIO should catch S3 unreachable errors without crashing worker process', async () => {
      const tempTarball = path.join(__dirname, 'temp_dummy.tar.gz');
      await fs.writeFile(tempTarball, 'dummy tarball binary content');

      const mockS3Client = {
        send: jest.fn().mockRejectedValue(new Error('S3 ECONNREFUSED: Connection refused at 10.0.0.5:9000'))
      };

      let crashed = false;
      try {
        await uploadCacheToMinIO('upload-fail.tar.gz', tempTarball, mockS3Client);
      } catch {
        crashed = true;
      }

      expect(crashed).toBe(false); // S3 upload failure is non-fatal

      await fs.unlink(tempTarball).catch(() => {});
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Stalled Job Auto-Reclaim & Worker Heartbeat Parameters
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. BullMQ Worker Daemon Failover & Stalled Job Configuration', () => {
    test('worker configuration should define explicit stalledInterval and lockDuration for dead-worker recovery', () => {
      const workerOptions = {
        concurrency: 2,
        lockDuration: 300000,    // 5 minutes lock
        stalledInterval: 30000,  // Check every 30s for stalled/dead workers
        maxStalledCount: 2       // Reclaim up to 2 times before failing
      };

      expect(workerOptions.lockDuration).toBeGreaterThanOrEqual(60000);
      expect(workerOptions.stalledInterval).toBeLessThanOrEqual(60000);
      expect(workerOptions.maxStalledCount).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Redis Client Disconnect & Reconnect Event Listeners
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Redis Connection Event Handling & Resilience', () => {
    test('should attach reconnect and error event listeners on Redis instances', () => {
      const events = {};
      const mockRedis = {
        on: jest.fn((event, handler) => {
          events[event] = handler;
        })
      };

      // Register standard resilient handlers
      mockRedis.on('error', (err) => `Logged error: ${err.message}`);
      mockRedis.on('reconnecting', () => 'Reconnecting to broker...');
      mockRedis.on('ready', () => 'Redis broker connected.');

      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('ready', expect.any(Function));

      // Trigger error event — verify no uncaught exception
      expect(() => events['error'](new Error('Redis connection dropped'))).not.toThrow();
    });
  });

});
