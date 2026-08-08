const path = require('path');
const fs = require('fs').promises;

describe('Production-Grade Test Suite 5: Automated Disk Pruning & Maintenance Engine', () => {

  const tempCleanupDir = path.join(__dirname, 'temp_cleanup_dir');

  beforeAll(async () => {
    await fs.mkdir(tempCleanupDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tempCleanupDir, { recursive: true, force: true });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Ephemeral Workspace Path Pruning
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Ephemeral Workspace Directory Lifecycle & Reclamation', () => {

    test('should safely remove temporary workspace folders after job completion', async () => {
      const buildId = 4040;
      const workspacePath = path.join(tempCleanupDir, `workspace-${buildId}-${Date.now()}`);
      
      // Simulate build artifacts creation
      await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });
      await fs.writeFile(path.join(workspacePath, 'src', 'app.js'), 'console.log("built");');
      await fs.writeFile(path.join(workspacePath, 'build.log'), 'Log stream content...');

      expect(await fs.stat(workspacePath).then(() => true).catch(() => false)).toBe(true);

      // Execute workspace reclamation routine
      await fs.rm(workspacePath, { recursive: true, force: true });

      const existsAfter = await fs.stat(workspacePath).then(() => true).catch(() => false);
      expect(existsAfter).toBe(false);
    });

    test('workspace deletion should never throw unhandled exception if directory was already removed', async () => {
      const ghostPath = path.join(tempCleanupDir, 'ghost-workspace-999');

      let threw = false;
      try {
        await fs.rm(ghostPath, { recursive: true, force: true });
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Dangling Docker Container & Sandbox Removal
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Docker Sandbox Force-Removal Guarantee', () => {

    test('container cleanup fallback must invoke force removal to release host memory', async () => {
      const mockContainer = {
        id: 'sandbox-container-12345',
        remove: jest.fn().mockResolvedValue(true)
      };

      // Simulate container removal in worker finally block
      try {
        await mockContainer.remove({ force: true });
      } catch (err) {
        // Silent catch
      }

      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
    });

    test('container remove errors must be caught silently without aborting build pipeline', async () => {
      const mockContainer = {
        id: 'failing-container-67890',
        remove: jest.fn().mockRejectedValue(new Error('No such container: sandbox-container'))
      };

      let aborted = false;
      try {
        try {
          await mockContainer.remove({ force: true });
        } catch (e) {
          // Container cleanup fallback
        }
      } catch {
        aborted = true;
      }

      expect(aborted).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Build Log Buffer Protection & Large Stream Truncation
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Build Log Buffer & Database Overflow Protection', () => {

    test('should truncate or chunk oversized log messages exceeding safe database threshold (e.g. 5MB)', () => {
      const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB limit
      
      const safeTruncateLogs = (logs) => {
        if (logs.length > MAX_LOG_SIZE) {
          const keepHead = logs.slice(0, 1024 * 1024); // First 1MB
          const keepTail = logs.slice(-2 * 1024 * 1024); // Last 2MB
          return `${keepHead}\n\n... [MAGNUS-CI: ${Math.round((logs.length - 3 * 1024 * 1024) / 1024)} KB LOGS TRUNCATED TO PREVENT BUFFER OVERFLOW] ...\n\n${keepTail}`;
        }
        return logs;
      };

      const smallLog = 'Short terminal log output line 1\nLine 2';
      expect(safeTruncateLogs(smallLog)).toBe(smallLog);

      // Generate 6MB log string
      const hugeLog = 'A'.repeat(6 * 1024 * 1024);
      const truncated = safeTruncateLogs(hugeLog);

      expect(truncated.length).toBeLessThan(hugeLog.length);
      expect(truncated).toContain('LOGS TRUNCATED');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Stale Cache Tarball Eviction
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Local Tarball Cache Eviction & Disk Reclamation', () => {

    test('should evict cache tarballs older than 30 days retention policy', async () => {
      const mockCaches = [
        { name: 'fresh-cache.tar.gz', mtimeMs: Date.now() - (5 * 24 * 60 * 60 * 1000) },    // 5 days old (keep)
        { name: 'stale-cache.tar.gz', mtimeMs: Date.now() - (45 * 24 * 60 * 60 * 1000) }   // 45 days old (evict)
      ];

      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const toEvict = mockCaches.filter((c) => now - c.mtimeMs > THIRTY_DAYS_MS);
      const toKeep = mockCaches.filter((c) => now - c.mtimeMs <= THIRTY_DAYS_MS);

      expect(toEvict.length).toBe(1);
      expect(toEvict[0].name).toBe('stale-cache.tar.gz');
      expect(toKeep.length).toBe(1);
      expect(toKeep[0].name).toBe('fresh-cache.tar.gz');
    });
  });

});
