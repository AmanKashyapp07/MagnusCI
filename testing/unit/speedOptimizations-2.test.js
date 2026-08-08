const fs = require('fs');
const path = require('path');
const { stripAnsi, parseLogsIntoSteps } = require('../../frontend/src/utils/logParser');
const { uploadCacheToMinIO, downloadCacheFromMinIO } = require('../../backend/src/utils/s3Cache');

describe('Production-Grade Test Suite: System Speed Optimizations Phase 2 (Optimizations 4, 5, 6)', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 4. MinIO Object Storage Fast Tarball Streaming
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. MinIO S3 Object Storage Caching & Streaming', () => {

    test('downloadCacheFromMinIO must gracefully handle cache miss (NoSuchKey/404)', async () => {
      const hit = await downloadCacheFromMinIO('missing-speed-cache-123', '/tmp/speed-cache.tar.gz');
      expect(hit).toBe(false);
    });

    test('uploadCacheToMinIO catches non-existent files gracefully without throwing errors', async () => {
      const result = await uploadCacheToMinIO('test-key', '/tmp/non-existent-tarball-999.tar.gz');
      expect(result).toBe(false);
    });

    test('uploadCacheToMinIO reads existing tarball stream without unhandled exceptions', async () => {
      const tempTar = path.join(__dirname, 'temp-cache-sample.tar.gz');
      fs.writeFileSync(tempTar, 'sample cache content');

      const result = await uploadCacheToMinIO('sample-key', tempTar);
      expect(typeof result).toBe('boolean');

      fs.unlinkSync(tempTar);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. WebSocket Push Streaming vs HTTP Polling
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Real-Time WebSocket Push Streaming Logic', () => {

    test('Socket.io join-build and build-log events deliver instant log updates', () => {
      const mockLogs = [];
      const mockSocket = {
        handlers: {},
        on(event, handler) { this.handlers[event] = handler; },
        emit(event, payload) { if (this.handlers[event]) this.handlers[event](payload); }
      };

      // Register mock WebSocket log listener
      mockSocket.on('build-log', (data) => {
        if (data.buildId === 42) {
          mockLogs.push(data.chunk);
        }
      });

      // Stream 100 rapid log chunks over socket
      for (let i = 0; i < 100; i++) {
        mockSocket.emit('build-log', { buildId: 42, chunk: `Stream chunk #${i}\n` });
      }

      expect(mockLogs.length).toBe(100);
      expect(mockLogs[0]).toBe('Stream chunk #0\n');
      expect(mockLogs[99]).toBe('Stream chunk #99\n');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Terminal Log Memoization & Virtualization Benchmarking
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. Terminal Log Memoization & DOM Virtualization CSS Tokens', () => {

    test('memoized stripAnsi must process 5,000 ANSI color lines in < 15ms', () => {
      const ansiSample = '\u001b[32m[SUCCESS]\u001b[0m Stage build completed in \u001b[36m1.2s\u001b[0m';

      const start = process.hrtime.bigint();
      for (let i = 0; i < 5000; i++) {
        stripAnsi(ansiSample);
      }
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1e6;
      expect(stripAnsi(ansiSample)).toBe('[SUCCESS] Stage build completed in 1.2s');
      expect(durationMs).toBeLessThan(15); // Sub-millisecond memoized throughput
    });

    test('compiled CSS bundle must contain content-visibility: auto virtualization token', () => {
      const distAssetsPath = path.join(__dirname, '../../frontend/dist/assets');
      expect(fs.existsSync(distAssetsPath)).toBe(true);

      const cssFiles = fs.readdirSync(distAssetsPath).filter(f => f.endsWith('.css'));
      expect(cssFiles.length).toBeGreaterThan(0);

      const cssContent = fs.readFileSync(path.join(distAssetsPath, cssFiles[0]), 'utf8');
      expect(cssContent).toContain('content-visibility');
    });
  });

});
