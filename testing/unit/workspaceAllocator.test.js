const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const workspaceAllocator = require('../../backend/src/utils/workspaceAllocator');

describe('Production-Grade Test Suite: Ephemeral tmpfs RAM-Disk Workspace Allocator', () => {

  const allocatedPaths = [];

  afterAll(async () => {
    for (const p of allocatedPaths) {
      await workspaceAllocator.purgeWorkspace(p);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. tmpfs RAM-Disk Allocation & Fallback
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. RAM-Disk Discovery & Ephemeral Allocation', () => {

    test('should allocate an isolated workspace directory and report storage medium', async () => {
      const buildId = 7070;
      const { workspacePath, isRamDisk } = await workspaceAllocator.allocateWorkspace(buildId);
      allocatedPaths.push(workspacePath);

      expect(workspacePath).toBeDefined();
      expect(typeof isRamDisk).toBe('boolean');
      expect(fsSync.existsSync(workspacePath)).toBe(true);
      expect(workspacePath).toContain(`workspace-${buildId}`);
    });

    test('should fallback gracefully to host disk if ramDiskPath is non-existent', async () => {
      const CustomAllocator = workspaceAllocator.constructor;
      const fallbackAllocator = new CustomAllocator({
        ramDiskPath: '/non/existent/ramdisk/path/12345',
        fallbackPath: '/tmp'
      });

      const { workspacePath, isRamDisk } = await fallbackAllocator.allocateWorkspace(8080);
      allocatedPaths.push(workspacePath);

      expect(isRamDisk).toBe(false);
      expect(workspacePath.startsWith('/tmp')).toBe(true);
      expect(fsSync.existsSync(workspacePath)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Atomic Workspace Purging
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Atomic Workspace Purging & Cleanup', () => {

    test('purgeWorkspace should cleanly delete allocated directory tree without leaving traces', async () => {
      const { workspacePath } = await workspaceAllocator.allocateWorkspace(9090);
      
      // Write sample nested files
      const srcDir = path.join(workspacePath, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'index.js'), 'console.log("RAM disk build");');

      expect(fsSync.existsSync(workspacePath)).toBe(true);

      // Execute purge
      await workspaceAllocator.purgeWorkspace(workspacePath);
      expect(fsSync.existsSync(workspacePath)).toBe(false);
    });

    test('purgeWorkspace should not throw if called on non-existent path', async () => {
      await expect(workspaceAllocator.purgeWorkspace('/tmp/ghost-workspace-123')).resolves.not.toThrow();
    });
  });

});
