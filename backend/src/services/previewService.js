const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class PreviewService {
  constructor(options = {}) {
    this.previewBaseDir = options.previewBaseDir || '/tmp/magnus-previews';
    this.defaultTTLMs = options.defaultTTLMs || 24 * 60 * 60 * 1000; // 24 hours
    this.previewMetadata = new Map();
  }

  /**
   * Discovers and deploys frontend build artifacts (dist, build, public, out)
   * into an isolated preview environment.
   * 
   * @param {number|string} buildId - Build identifier
   * @param {string} workspacePath - Path to build workspace
   * @returns {Promise<{ deployed: boolean, previewUrl: string, totalFiles: number, totalBytes: number }>}
   */
  async deployPreview(buildId, workspacePath) {
    if (!workspacePath || !fsSync.existsSync(workspacePath)) {
      return { deployed: false, previewUrl: null, totalFiles: 0, totalBytes: 0 };
    }

    const candidateFolders = ['dist', 'build', 'public', 'out'];
    let sourceDir = null;

    for (const folder of candidateFolders) {
      const candidatePath = path.join(workspacePath, folder);
      if (fsSync.existsSync(candidatePath) && fsSync.statSync(candidatePath).isDirectory()) {
        sourceDir = candidatePath;
        break;
      }
    }

    if (!sourceDir) {
      return { deployed: false, previewUrl: null, totalFiles: 0, totalBytes: 0 };
    }

    const targetDir = path.join(this.previewBaseDir, `build-${buildId}`);
    await fs.mkdir(targetDir, { recursive: true });

    // Copy static files recursively
    await this.copyRecursive(sourceDir, targetDir);

    const stats = await this.calculateDirectoryStats(targetDir);
    const previewUrl = `/preview/${buildId}/`;

    const metadata = {
      buildId,
      previewUrl,
      targetDir,
      totalFiles: stats.totalFiles,
      totalBytes: stats.totalBytes,
      deployedAt: Date.now(),
      expiresAt: Date.now() + this.defaultTTLMs
    };

    this.previewMetadata.set(String(buildId), metadata);
    logger.info(`Live preview deployed for build #${buildId} at ${previewUrl} (${stats.totalFiles} files, ${Math.round(stats.totalBytes / 1024)} KB)`);

    return {
      deployed: true,
      previewUrl,
      totalFiles: stats.totalFiles,
      totalBytes: stats.totalBytes
    };
  }

  /**
   * Retrieves preview metadata for a build.
   */
  getPreview(buildId) {
    const meta = this.previewMetadata.get(String(buildId));
    if (!meta) return null;

    if (Date.now() > meta.expiresAt) {
      this.deletePreview(buildId);
      return null;
    }
    return meta;
  }

  /**
   * Recursively copies a directory tree.
   */
  async copyRecursive(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Calculates total file count and size in bytes for a directory.
   */
  async calculateDirectoryStats(dir) {
    let totalFiles = 0;
    let totalBytes = 0;

    const walk = async (currentDir) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else {
          totalFiles++;
          const stat = await fs.stat(fullPath);
          totalBytes += stat.size;
        }
      }
    };

    if (fsSync.existsSync(dir)) {
      await walk(dir);
    }

    return { totalFiles, totalBytes };
  }

  /**
   * Deletes a preview environment from disk.
   */
  async deletePreview(buildId) {
    const meta = this.previewMetadata.get(String(buildId));
    const targetDir = meta?.targetDir || path.join(this.previewBaseDir, `build-${buildId}`);
    
    this.previewMetadata.delete(String(buildId));
    if (fsSync.existsSync(targetDir)) {
      await fs.rm(targetDir, { recursive: true, force: true });
      logger.info(`Pruned preview environment for build #${buildId}`);
    }
  }

  /**
   * Prunes all expired preview environments.
   */
  async pruneExpiredPreviews() {
    const now = Date.now();
    for (const [buildId, meta] of this.previewMetadata.entries()) {
      if (now > meta.expiresAt) {
        await this.deletePreview(buildId);
      }
    }
  }
}

module.exports = new PreviewService();
