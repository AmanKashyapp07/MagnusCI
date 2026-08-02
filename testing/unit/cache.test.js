const { getCacheConfig, restoreCache, saveCache } = require('../../backend/src/utils/cache');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

describe('Production-Grade Unit Tests: Dependency Caching Engine (utils/cache.js)', () => {

  describe('1. Environment Configuration Mapper (getCacheConfig)', () => {
    test('should return correct lockfiles and target folder for Node.js', () => {
      const config = getCacheConfig('Node.js');
      expect(config).toBeDefined();
      expect(config.lockfiles).toContain('package-lock.json');
      expect(config.folder).toBe('node_modules');
    });

    test('should return correct configuration for Python', () => {
      const config = getCacheConfig('Python');
      expect(config.lockfiles).toContain('requirements.txt');
      expect(config.folder).toBe('.pip_cache');
    });

    test('should return correct configuration for Go', () => {
      const config = getCacheConfig('Go');
      expect(config.lockfiles).toContain('go.sum');
      expect(config.folder).toBe('.go_cache');
    });

    test('should return null for unsupported language', () => {
      expect(getCacheConfig('Brainfuck')).toBeNull();
      expect(getCacheConfig(null)).toBeNull();
    });
  });

  describe('2. Lockfile Fingerprinting & Cache Restoration', () => {
    const testWorkspace = path.join(__dirname, 'temp_cache_workspace');

    beforeAll(async () => {
      await fs.mkdir(testWorkspace, { recursive: true });
    });

    afterAll(async () => {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    });

    test('should report missing lockfile gracefully when no lockfile exists', async () => {
      const result = await restoreCache(testWorkspace, 'Node.js', 999);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('lockfile_not_found');
    });

    test('should calculate SHA-256 lockfile fingerprint and return cache_miss when no tarball exists', async () => {
      const mockLockfile = JSON.stringify({ name: 'test-package', version: '1.0.0' });
      await fs.writeFile(path.join(testWorkspace, 'package-lock.json'), mockLockfile);

      const expectedHash = crypto.createHash('sha256').update(Buffer.from(mockLockfile)).digest('hex');

      const result = await restoreCache(testWorkspace, 'Node.js', 999);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('cache_miss');
      expect(result.hash).toBe(expectedHash);

      await fs.unlink(path.join(testWorkspace, 'package-lock.json'));
    });

    test('should handle saveCache gracefully if target folder is missing', async () => {
      const result = await saveCache(testWorkspace, 'Node.js', 999, 'mockhash123');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('folder_not_found');
    });
  });

});
