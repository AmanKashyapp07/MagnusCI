const { hasCycle, loadPipelineStages, executeDAG } = require('../../backend/src/utils/dag');
const path = require('path');
const fs = require('fs').promises;

describe('Production-Grade Unit Tests: DAG Engine (utils/dag.js)', () => {

  describe('1. DFS Cycle Detection (hasCycle)', () => {
    test('should return false for valid linear DAG (A -> B -> C)', () => {
      const stages = {
        setup: { run: 'npm ci', needs: [] },
        test: { run: 'npm test', needs: ['setup'] },
        build: { run: 'npm run build', needs: ['test'] }
      };
      expect(hasCycle(stages)).toBe(false);
    });

    test('should return false for valid diamond DAG (Parallel branch execution)', () => {
      const stages = {
        setup: { run: 'npm ci', needs: [] },
        lint: { run: 'npm run lint', needs: ['setup'] },
        test: { run: 'npm test', needs: ['setup'] },
        deploy: { run: 'npm run deploy', needs: ['lint', 'test'] }
      };
      expect(hasCycle(stages)).toBe(false);
    });

    test('should return true for self-referential stage cycle (A -> A)', () => {
      const stages = {
        build: { run: 'make', needs: ['build'] }
      };
      expect(hasCycle(stages)).toBe(true);
    });

    test('should return true for direct 2-node cycle (A -> B -> A)', () => {
      const stages = {
        stageA: { run: 'echo A', needs: ['stageB'] },
        stageB: { run: 'echo B', needs: ['stageA'] }
      };
      expect(hasCycle(stages)).toBe(true);
    });

    test('should return true for indirect multi-stage cycle (A -> B -> C -> D -> A)', () => {
      const stages = {
        stageA: { run: 'echo A', needs: [] },
        stageB: { run: 'echo B', needs: ['stageA'] },
        stageC: { run: 'echo C', needs: ['stageB'] },
        stageD: { run: 'echo D', needs: ['stageC'] }
      };
      // Introduce cycle
      stages.stageA.needs = ['stageD'];
      expect(hasCycle(stages)).toBe(true);
    });

    test('should return false for empty or single-node stages', () => {
      expect(hasCycle({})).toBe(false);
      expect(hasCycle({ init: { run: 'echo hello' } })).toBe(false);
    });

    test('should handle string needs as well as array needs', () => {
      const stages = {
        setup: { run: 'npm ci' },
        test: { run: 'npm test', needs: 'setup' }
      };
      expect(hasCycle(stages)).toBe(false);
    });
  });

  describe('2. Pipeline Configuration Loader (loadPipelineStages)', () => {
    const tempDir = path.join(__dirname, 'temp_test_workspace');

    beforeAll(async () => {
      await fs.mkdir(tempDir, { recursive: true });
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('should load custom magnus-ci.json DAG stages when present', async () => {
      const config = {
        stages: {
          setup: { run: 'npm ci', image: 'node:20-alpine' },
          test: { run: 'npm test', needs: ['setup'] }
        }
      };
      await fs.writeFile(path.join(tempDir, 'magnus-ci.json'), JSON.stringify(config));

      const stages = await loadPipelineStages(tempDir, 'Node.js', 'node:20-alpine');
      expect(stages).toHaveProperty('setup');
      expect(stages).toHaveProperty('test');
      expect(stages.test.needs).toEqual(['setup']);
      expect(stages.setup.run).toBe('npm ci');

      await fs.unlink(path.join(tempDir, 'magnus-ci.json'));
    });

    test('should fallback to language presets when magnus-ci.json is absent', async () => {
      const stages = await loadPipelineStages(tempDir, 'Node.js', 'node:20-alpine');
      expect(stages).toHaveProperty('setup');
      expect(stages).toHaveProperty('test');
      expect(stages).toHaveProperty('build');
    });

    test('should fallback to default baseline test stage for unknown language', async () => {
      const stages = await loadPipelineStages(tempDir, 'UnknownLang', 'alpine:latest');
      expect(stages).toHaveProperty('test');
      expect(stages.test.run).toBe('npm test');
    });
  });

  describe('3. Topological Parallel Execution Engine (executeDAG)', () => {
    test('should execute independent stages in proper order', async () => {
      const stages = {
        setup: { run: 'echo setup', needs: [] },
        lint: { run: 'echo lint', needs: ['setup'] },
        test: { run: 'echo test', needs: ['setup'] },
        compile: { run: 'echo compile', needs: ['lint', 'test'] }
      };

      const executionLog = [];
      const runStageFn = jest.fn(async (stageName) => {
        executionLog.push(`start:${stageName}`);
        await new Promise(resolve => setTimeout(resolve, 10));
        executionLog.push(`finish:${stageName}`);
        return true; // stage succeeded
      });

      const finalStates = await executeDAG(stages, runStageFn);

      expect(finalStates).toEqual({
        setup: 'SUCCESS',
        lint: 'SUCCESS',
        test: 'SUCCESS',
        compile: 'SUCCESS'
      });

      expect(executionLog[0]).toBe('start:setup');
      expect(executionLog[1]).toBe('finish:setup');
      expect(executionLog).toContain('start:lint');
      expect(executionLog).toContain('start:test');
      expect(executionLog[executionLog.length - 1]).toBe('finish:compile');
    });

    test('should skip downstream stages if a prerequisite stage fails', async () => {
      const stages = {
        setup: { run: 'echo setup', needs: [] },
        test: { run: 'echo test', needs: ['setup'] },
        deploy: { run: 'echo deploy', needs: ['test'] }
      };

      const runStageFn = jest.fn(async (stageName) => {
        if (stageName === 'test') {
          return false; // test stage fails
        }
        return true;
      });

      const finalStates = await executeDAG(stages, runStageFn);

      expect(finalStates.setup).toBe('SUCCESS');
      expect(finalStates.test).toBe('FAILED');
      expect(finalStates.deploy).toBe('PENDING'); // skipped because dependency failed
    });

    test('should handle thrown exceptions in stage runner gracefully', async () => {
      const stages = {
        setup: { run: 'echo setup' }
      };

      const runStageFn = jest.fn(async () => {
        throw new Error('Container crashed');
      });

      const finalStates = await executeDAG(stages, runStageFn);
      expect(finalStates.setup).toBe('FAILED');
    });
  });

});
