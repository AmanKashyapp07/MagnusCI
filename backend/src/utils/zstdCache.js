const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const zlib = require('zlib');
const logger = require('./logger');

const execAsync = promisify(exec);

class ZstdCacheManager {
  constructor() {
    this._zstdAvailable = null;
  }

  /**
   * Checks if native zstd binary is installed on the host system.
   */
  async isZstdAvailable() {
    if (this._zstdAvailable !== null) return this._zstdAvailable;
    try {
      await execAsync('zstd --version');
      this._zstdAvailable = true;
    } catch {
      this._zstdAvailable = false;
    }
    return this._zstdAvailable;
  }

  /**
   * Compresses a source directory into a high-performance archive.
   * Uses multi-threaded zstd (-T0) when available, falling back to gzip.
   * 
   * @param {string} sourceDir - Directory to archive (e.g. node_modules)
   * @param {string} outputArchive - Destination file path (e.g. cache.tar.zst)
   * @returns {Promise<{ format: string, durationMs: number, sizeBytes: number }>}
   */
  async compressArchive(sourceDir, outputArchive) {
    if (!fsSync.existsSync(sourceDir)) {
      throw new Error(`Source directory ${sourceDir} does not exist.`);
    }

    const start = process.hrtime.bigint();
    const useZstd = await this.isZstdAvailable();
    const parentDir = path.dirname(sourceDir);
    const baseName = path.basename(sourceDir);

    if (useZstd) {
      const zstdTarget = outputArchive.endsWith('.zst') ? outputArchive : `${outputArchive}.zst`;
      // -T0: utilize all CPU cores, -3: optimal speed-to-compression ratio, -f: force overwrite existing
      await execAsync(`tar -cf - -C "${parentDir}" "${baseName}" | zstd -T0 -3 -f -o "${zstdTarget}"`);
      
      const stat = await fs.stat(zstdTarget);
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(`Zstd archive compressed in ${Math.round(durationMs)}ms (${Math.round(stat.size / 1024)} KB)`);

      return { format: 'zstd', durationMs, sizeBytes: stat.size, archivePath: zstdTarget };
    } else {
      const gzipTarget = outputArchive.endsWith('.gz') ? outputArchive : `${outputArchive}.tar.gz`;
      await execAsync(`tar -czf "${gzipTarget}" -C "${parentDir}" "${baseName}"`);

      const stat = await fs.stat(gzipTarget);
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(`Gzip archive compressed in ${Math.round(durationMs)}ms (${Math.round(stat.size / 1024)} KB)`);

      return { format: 'gzip', durationMs, sizeBytes: stat.size, archivePath: gzipTarget };
    }
  }

  /**
   * Decompresses an archive back into the target destination directory.
   */
  async decompressArchive(archivePath, destinationDir) {
    if (!fsSync.existsSync(archivePath)) {
      throw new Error(`Archive ${archivePath} does not exist.`);
    }

    await fs.mkdir(destinationDir, { recursive: true });
    const start = process.hrtime.bigint();

    if (archivePath.endsWith('.zst')) {
      // Multi-threaded fast extraction
      await execAsync(`zstd -dc -T0 "${archivePath}" | tar -xf - -C "${destinationDir}"`);
    } else {
      await execAsync(`tar -xzf "${archivePath}" -C "${destinationDir}"`);
    }

    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info(`Archive decompressed in ${Math.round(durationMs)}ms`);
    return { success: true, durationMs };
  }
}

module.exports = new ZstdCacheManager();
