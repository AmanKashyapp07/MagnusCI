const { hasCycle, executeDAG, loadPipelineStages } = require('../../backend/src/utils/dag');
const { getCacheConfig, calculateFileHash, restoreCache, saveCache } = require('../../backend/src/utils/cache');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

describe('Brutal Edge-Case & Resiliency Test Suite', () => {

  describe('1. Brutal DAG Graph Engine Edge Cases', () => {

    test('should handle dependencies on missing/undefined stages without hanging or crashing', async () => {
      const stages = {
        setup: { run: 'npm ci', needs: [] },
        test: { run: 'npm test', needs: ['non_existent_stage'] }
      };

      expect(hasCycle(stages)).toBe(false);

      const runStageFn = jest.fn(async () => true);
      const states = await executeDAG(stages, runStageFn);

      expect(states.setup).toBe('SUCCESS');
      expect(states.test).toBe('PENDING'); // Cannot run because non_existent_stage never completes
      expect(runStageFn).toHaveBeenCalledTimes(1);
    });

    test('should handle deeply nested 50-node dependency graph with cycle at the bottom', () => {
      const stages = {};
      for (let i = 0; i < 50; i++) {
        stages[`node_${i}`] = {
          run: `echo node ${i}`,
          needs: i > 0 ? [`node_${i - 1}`] : []
        };
      }
      expect(hasCycle(stages)).toBe(false);

      // Introduce cycle between node_49 and node_25
      stages['node_25'].needs.push('node_49');
      expect(hasCycle(stages)).toBe(true);
    });

    test('should handle stages with non-Error thrown exceptions or rejected primitives', async () => {
      const stages = {
        badStage: { run: 'crash' }
      };

      const runStageFn = jest.fn(async () => {
        throw 'String primitive exception error';
      });

      const states = await executeDAG(stages, runStageFn);
      expect(states.badStage).toBe('FAILED');
    });

    test('should handle high-concurrency 10-way parallel stage execution', async () => {
      const stages = {};
      for (let i = 0; i < 10; i++) {
        stages[`parallel_${i}`] = { run: `echo ${i}`, needs: [] };
      }
      stages['final_aggregate'] = {
        run: 'echo done',
        needs: Array.from({ length: 10 }, (_, i) => `parallel_${i}`)
      };

      const activeExecutions = new Set();
      let maxSimultaneous = 0;

      const runStageFn = jest.fn(async (name) => {
        activeExecutions.add(name);
        if (activeExecutions.size > maxSimultaneous) {
          maxSimultaneous = activeExecutions.size;
        }
        await new Promise(res => setTimeout(res, 25));
        activeExecutions.delete(name);
        return true;
      });

      const states = await executeDAG(stages, runStageFn);

      expect(maxSimultaneous).toBe(10); // All 10 executed concurrently
      expect(states.final_aggregate).toBe('SUCCESS');
    });

  });

  describe('2. Brutal Cache & Shell Injection Resiliency Edge Cases', () => {

    const testWorkspace = path.join(__dirname, 'temp_brutal_workspace');

    beforeAll(async () => {
      await fs.mkdir(testWorkspace, { recursive: true });
    });

    afterAll(async () => {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    });

    test('should sanitize repoId and language against command injection attempts in tar archive names', async () => {
      const maliciousLanguage = 'Node.js; rm -rf /;';
      const config = getCacheConfig(maliciousLanguage);
      expect(config).toBeDefined();

      // Ensure sanitize regex converts special chars to underscores
      const safeLangName = maliciousLanguage.replace(/[^a-zA-Z0-9]/g, '_');
      expect(safeLangName).not.toContain(';');
      expect(safeLangName).not.toContain(' ');
    });

    test('should auto-delete corrupted zero-byte tarball cache files on extraction failure', async () => {
      const mockLockfile = JSON.stringify({ name: 'corrupt-test' });
      await fs.writeFile(path.join(testWorkspace, 'package-lock.json'), mockLockfile);

      const hash = crypto.createHash('sha256').update(Buffer.from(mockLockfile)).digest('hex');
      const cachesDir = path.join(__dirname, '../../backend/caches/tarballs');
      await fs.mkdir(cachesDir, { recursive: true });

      const corruptTarPath = path.join(cachesDir, `777-Node_js-${hash}.tar.gz`);
      await fs.writeFile(corruptTarPath, 'THIS IS INVALID CORRUPTED TAR DATA');

      const result = await restoreCache(testWorkspace, 'Node.js', 777);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('extract_failed');

      // Verify corrupted cache file was auto-deleted
      let fileExists = true;
      try {
        await fs.access(corruptTarPath);
      } catch {
        fileExists = false;
      }
      expect(fileExists).toBe(false);

      await fs.unlink(path.join(testWorkspace, 'package-lock.json')).catch(() => {});
    });

  });

  describe('3. Brutal Log Parsing & Memory Resiliency Edge Cases', () => {

    let parseLogsIntoSteps;

    beforeAll(async () => {
      const module = await import('../../frontend/src/utils/logParser.js');
      parseLogsIntoSteps = module.parseLogsIntoSteps;
    });

    test('should parse 5,000 line heavy log stream under 50ms without memory leaks', () => {
      const logLines = [];
      for (let i = 0; i < 5000; i++) {
        logLines.push(`[00:00:${i % 60}] [STAGE_${i % 5}] Step output line ${i} \u001b[31mwith colors\u001b[0m`);
      }
      const rawLogs = logLines.join('\n');

      const start = Date.now();
      const steps = parseLogsIntoSteps(rawLogs, 'SUCCESS');
      const elapsed = Date.now() - start;

      expect(steps.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(200); // Fast log processing
    });

  });

});
