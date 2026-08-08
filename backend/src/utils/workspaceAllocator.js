const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Ephemeral Workspace Allocator
 * 
 * Allocates build workspaces on ultra-fast Linux tmpfs (RAM-disk) when available,
 * falling back to host disk storage (/tmp) if RAM-disk is constrained or absent.
 */
class WorkspaceAllocator {
  constructor(options = {}) {
    this.ramDiskPath = options.ramDiskPath || '/dev/shm';
    this.fallbackPath = options.fallbackPath || process.env.HOST_WORKSPACE_PATH || '/tmp';
    this.minFreeRamBytes = options.minFreeRamBytes || 256 * 1024 * 1024; // 256MB minimum headroom
  }

  /**
   * Checks if Linux tmpfs RAM disk is mounted and has sufficient free memory.
   */
  async isRamDiskAvailable() {
    try {
      if (!fsSync.existsSync(this.ramDiskPath)) {
        return false;
      }

      // Check writable permissions on /dev/shm
      await fs.access(this.ramDiskPath, fs.constants.W_OK | fs.constants.R_OK);

      // Check statfs if supported in environment
      if (typeof fs.statfs === 'function') {
        const stats = await fs.statfs(this.ramDiskPath);
        const freeBytes = stats.bavail * stats.bsize;
        if (freeBytes < this.minFreeRamBytes) {
          logger.warn(`tmpfs RAM-disk space low (${Math.round(freeBytes / 1024 / 1024)}MB free). Falling back to disk.`);
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Allocates an ephemeral workspace path for the specified buildId.
   * 
   * @param {number|string} buildId - Build identifier
   * @returns {Promise<{ workspacePath: string, isRamDisk: boolean }>}
   */
  async allocateWorkspace(buildId) {
    const isRamDisk = await this.isRamDiskAvailable();
    const baseDir = isRamDisk ? this.ramDiskPath : this.fallbackPath;
    const workspacePath = path.join(baseDir, `magnus-builds`, `workspace-${buildId}-${Date.now()}`);

    await fs.mkdir(workspacePath, { recursive: true });
    logger.info(`Allocated ephemeral workspace [${isRamDisk ? 'tmpfs RAM-Disk' : 'Host Disk'}]: ${workspacePath}`);

    return { workspacePath, isRamDisk };
  }

  /**
   * Recursively purges the ephemeral workspace directory.
   */
  async purgeWorkspace(workspacePath) {
    if (!workspacePath) return;
    try {
      if (fsSync.existsSync(workspacePath)) {
        await fs.rm(workspacePath, { recursive: true, force: true });
        logger.info(`Purged ephemeral workspace: ${workspacePath}`);
      }
    } catch (err) {
      logger.warn(`Failed to cleanly purge workspace ${workspacePath}: ${err.message}`);
    }
  }
}

module.exports = new WorkspaceAllocator();
