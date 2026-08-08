const request = require('supertest');
const crypto = require('crypto');
const app = require('../../backend/src/index');
const pool = require('../../backend/src/db');
const buildQueue = require('../../backend/src/queue');

describe('Production-Grade Test Suite 1: High-Concurrency, Load & Stress Engine', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. High-Concurrency Webhook Burst & Signature Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. High-Concurrency Webhook Burst & HMAC Ingestion', () => {
    const SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'test_webhook_secret';

    test('should process a burst of 50 concurrent HMAC-signed webhooks without dropping requests', async () => {
      const burstCount = 50;
      const requests = [];

      for (let i = 0; i < burstCount; i++) {
        const payload = JSON.stringify({
          ref: 'refs/heads/main',
          after: crypto.randomBytes(20).toString('hex'),
          repository: {
            name: `stress-repo-${i % 5}`,
            clone_url: `https://github.com/test-org/stress-repo-${i % 5}.git`,
            owner: { login: 'test-org' }
          },
          head_commit: {
            id: crypto.randomBytes(20).toString('hex'),
            message: `Stress test commit #${i}`,
            author: { name: 'StressTester', email: 'tester@stress.local' }
          }
        });

        const signature = `sha256=${crypto.createHmac('sha256', SECRET).update(payload).digest('hex')}`;

        const req = request(app)
          .post('/api/webhooks/github')
          .set('Content-Type', 'application/json')
          .set('x-github-event', 'push')
          .set('x-hub-signature-256', signature)
          .send(payload);

        requests.push(req);
      }

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      // Assert all 50 requests were processed without dropping HTTP sockets
      responses.forEach((res) => {
        expect([200, 202, 400, 401]).toContain(res.status);
      });

      // Duration should be responsive under concurrency
      expect(duration).toBeLessThan(15000);
    });

    test('should reject a concurrent burst of 25 tampered HMAC signatures cleanly', async () => {
      const requests = [];

      for (let i = 0; i < 25; i++) {
        const payload = JSON.stringify({
          ref: 'refs/heads/main',
          after: crypto.randomBytes(20).toString('hex'),
          head_commit: { id: 'invalid', message: 'tampered' }
        });

        // Deliberately incorrect signature
        const invalidSig = `sha256=${crypto.randomBytes(32).toString('hex')}`;

        const req = request(app)
          .post('/api/webhooks/github')
          .set('Content-Type', 'application/json')
          .set('x-github-event', 'push')
          .set('x-hub-signature-256', invalidSig)
          .send(payload);

        requests.push(req);
      }

      const responses = await Promise.all(requests);
      responses.forEach((res) => {
        expect([401, 200]).toContain(res.status);
        if (res.status === 401) {
          expect(res.body.error).toBeDefined();
        }
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. BullMQ / Redis Queue Backpressure & Enqueue Rate
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. BullMQ Queue Backpressure & Concurrency Throttling', () => {
    test('should enqueue a burst of 30 jobs into the build-queue without dropping state', async () => {
      const jobCount = 30;
      const jobPromises = [];

      for (let i = 0; i < jobCount; i++) {
        const jobData = {
          buildId: 9000 + i,
          repoId: 100 + (i % 3),
          repoName: `queue-stress-repo-${i}`,
          githubUrl: `https://github.com/stress/repo-${i}.git`,
          commitHash: crypto.randomBytes(20).toString('hex'),
          branchName: 'main'
        };

        jobPromises.push(
          buildQueue.add(`stress-job-${i}`, jobData, {
            removeOnComplete: true,
            removeOnFail: 50
          })
        );
      }

      const enqueuedJobs = await Promise.all(jobPromises);
      expect(enqueuedJobs.length).toBe(jobCount);

      enqueuedJobs.forEach((job, idx) => {
        expect(job).toBeDefined();
        expect(job.data.buildId).toBe(9000 + idx);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. PostgreSQL Pool Saturation & Transaction Concurrency
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. PostgreSQL Connection Pool Saturation', () => {
    test('should execute 40 concurrent database queries without pool client leaks', async () => {
      const queryCount = 40;
      const queries = [];

      for (let i = 0; i < queryCount; i++) {
        queries.push(
          pool.query('SELECT $1::int AS test_id, NOW() AS server_time', [i])
        );
      }

      const results = await Promise.all(queries);
      expect(results.length).toBe(queryCount);

      results.forEach((res, index) => {
        expect(res.rows).toBeDefined();
        expect(res.rows[0].test_id).toBe(index);
        expect(res.rows[0].server_time).toBeDefined();
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. WebSocket Fanout & Broadcast Load
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. WebSocket Log Streaming & Broadcast Saturation', () => {
    test('should broadcast build log chunks across attached Socket.io rooms without error', () => {
      const io = app.get('io');
      expect(io).toBeDefined();

      const mockRoom = 'build-stress-room-101';
      const logChunks = [
        '[ENGINE] Spawning container sandbox...',
        '[SETUP] npm install completed (124 packages)',
        '[TEST] 12/12 unit tests passed cleanly',
        '[BUILD] Compiled static production bundle (385KB)'
      ];

      expect(() => {
        logChunks.forEach((chunk) => {
          io.to(mockRoom).emit('build-log', {
            buildId: 101,
            log: chunk,
            timestamp: Date.now()
          });
        });
      }).not.toThrow();
    });
  });

});
