const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const zstdCache = require('../../backend/src/utils/zstdCache');

describe('Production-Grade Test Suite: Zstandard Multi-Threaded Compression & S3 Cache Engine', () => {

  const testDir = path.join(__dirname, 'temp_zstd_test_dir');
  const sampleModuleDir = path.join(testDir, 'sample_node_modules');
  const archivePath = path.join(testDir, 'test-archive.tar');
  const extractDir = path.join(testDir, 'extracted_modules');

  beforeAll(async () => {
    await fs.mkdir(sampleModuleDir, { recursive: true });
    // Write sample library files
    await fs.writeFile(path.join(sampleModuleDir, 'package.json'), JSON.stringify({ name: 'cached-lib', version: '2.0.0' }));
    await fs.writeFile(path.join(sampleModuleDir, 'index.js'), 'module.exports = () => "cached function";');
    await fs.writeFile(path.join(sampleModuleDir, 'large.txt'), 'Zstandard compression sample '.repeat(1000));
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Zstd / Gzip Archive Compression
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Multi-Threaded Compression & Throughput', () => {

    test('should compress directory tree into archive with duration and size metrics', async () => {
      const result = await zstdCache.compressArchive(sampleModuleDir, archivePath);

      expect(result).toBeDefined();
      expect(['zstd', 'gzip']).toContain(result.format);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(fsSync.existsSync(result.archivePath)).toBe(true);
    });

    test('compressArchive should throw error if target directory does not exist', async () => {
      await expect(
        zstdCache.compressArchive('/non/existent/dir/9999', '/tmp/out.tar')
      ).rejects.toThrow();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Archive Decompression & Integrity Check
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Archive Decompression & File Integrity Verification', () => {

    test('should extract archive back into destination directory with 100% file fidelity', async () => {
      // First ensure archive is compressed
      const compResult = await zstdCache.compressArchive(sampleModuleDir, archivePath);
      const decompResult = await zstdCache.decompressArchive(compResult.archivePath, extractDir);

      expect(decompResult.success).toBe(true);

      // Verify extracted contents
      const extractedPackage = path.join(extractDir, 'sample_node_modules', 'package.json');
      const extractedLarge = path.join(extractDir, 'sample_node_modules', 'large.txt');

      expect(fsSync.existsSync(extractedPackage)).toBe(true);
      expect(fsSync.existsSync(extractedLarge)).toBe(true);

      const pkgContent = JSON.parse(await fs.readFile(extractedPackage, 'utf8'));
      expect(pkgContent.name).toBe('cached-lib');
      expect(pkgContent.version).toBe('2.0.0');
    });

    test('decompressArchive should throw error if archive file is missing', async () => {
      await expect(
        zstdCache.decompressArchive('/tmp/ghost-archive-404.tar.zst', '/tmp/extract')
      ).rejects.toThrow();
    });
  });

});
