const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { loadPipelineStages, hasCycle, executeDAG } = require('../../backend/src/utils/dag');

describe('Production-Grade Unit Tests: DAG Engine (utils/dag.js)', () => {

  describe('1. DFS Cycle Detection (hasCycle)', () => {
    test('should return false for valid linear DAG (A -> B -> C)', () => {
      const stages = {
        setup: {},
        test: { needs: ['setup'] },
        build: { needs: ['test'] }
      };
      expect(hasCycle(stages)).toBe(false);
    });

    test('should return false for valid diamond DAG (Parallel branch execution)', () => {
      const stages = {
        setup: {},
        unit_test: { needs: ['setup'] },
        lint: { needs: ['setup'] },
        deploy: { needs: ['unit_test', 'lint'] }
      };
      expect(hasCycle(stages)).toBe(false);
    });

    test('should return true for self-referential stage cycle (A -> A)', () => {
      const stages = {
        setup: { needs: ['setup'] }
      };
      expect(hasCycle(stages)).toBe(true);
    });

    test('should return true for direct 2-node cycle (A -> B -> A)', () => {
      const stages = {
        stageA: { needs: ['stageB'] },
        stageB: { needs: ['stageA'] }
      };
      expect(hasCycle(stages)).toBe(true);
    });

    test('should return true for indirect multi-stage cycle (A -> B -> C -> D -> A)', () => {
      const stages = {
        stageA: { needs: ['stageB'] },
        stageB: { needs: ['stageC'] },
        stageC: { needs: ['stageD'] },
        stageD: { needs: ['stageA'] }
      };
      expect(hasCycle(stages)).toBe(true);
    });

    test('should return false for empty or single-node stages', () => {
      expect(hasCycle({})).toBe(false);
      expect(hasCycle({ single: {} })).toBe(false);
    });

    test('should handle string needs as well as array needs', () => {
      const stages = {
        stageA: { needs: 'stageB' },
        stageB: { needs: 'stageA' }
      };
      expect(hasCycle(stages)).toBe(true);
    });
  });

  describe('2. Pipeline Configuration Loader (loadPipelineStages)', () => {
    let tempDir;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dag-test-'));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('should load custom magnus-ci.json DAG stages when present', async () => {
      const customConfig = {
        stages: {
          custom_setup: { run: 'echo "hello"' }
        }
      };
      await fs.writeFile(path.join(tempDir, 'magnus-ci.json'), JSON.stringify(customConfig));

      const stages = await loadPipelineStages(tempDir, 'Node.js');
      expect(stages).toHaveProperty('custom_setup');
      expect(stages.custom_setup.run).toBe('echo "hello"');
    });

    test('should fallback to language presets when magnus-ci.json is absent', async () => {
      const stages = await loadPipelineStages(tempDir, 'Node.js', 'node:20-alpine');
      expect(stages).toHaveProperty('setup');
      expect(stages).toHaveProperty('test');
      expect(stages).toHaveProperty('build');
      expect(stages.test.needs).toEqual(['setup']);
    });

    test('should fallback to default baseline test stage for unknown language', async () => {
      const stages = await loadPipelineStages(tempDir, 'UnknownLang', 'alpine:latest');
      expect(stages).toHaveProperty('test');
      expect(stages.test.run).toContain('npm test');
    });
  });

  describe('3. Topological Parallel Execution Engine (executeDAG)', () => {
    test('should execute independent stages in proper order', async () => {
      const executionOrder = [];
      const stages = {
        stage1: {},
        stage2: { needs: ['stage1'] },
        stage3: { needs: ['stage1'] },
        stage4: { needs: ['stage2', 'stage3'] }
      };

      const stageRunner = async (stageName) => {
        executionOrder.push(stageName);
        await new Promise(res => setTimeout(res, 10));
        return true;
      };

      const results = await executeDAG(stages, stageRunner);

      expect(results).toEqual({
        stage1: 'SUCCESS',
        stage2: 'SUCCESS',
        stage3: 'SUCCESS',
        stage4: 'SUCCESS'
      });

      expect(executionOrder[0]).toBe('stage1');
      expect(executionOrder[3]).toBe('stage4');
    });

    test('should skip downstream stages if a prerequisite stage fails', async () => {
      const executionOrder = [];
      const stages = {
        setup: {},
        test: { needs: ['setup'] },
        deploy: { needs: ['test'] }
      };

      const stageRunner = async (stageName) => {
        executionOrder.push(stageName);
        if (stageName === 'test') {
          return false; // Fail test stage
        }
        return true;
      };

      const results = await executeDAG(stages, stageRunner);

      expect(results.setup).toBe('SUCCESS');
      expect(results.test).toBe('FAILED');
      expect(results.deploy).toBe('PENDING'); // Skipped
      expect(executionOrder).not.toContain('deploy');
    });

    test('should handle thrown exceptions in stage runner gracefully', async () => {
      const stages = {
        flaky: {}
      };

      const stageRunner = async () => {
        throw new Error('Container crashed out of memory');
      };

      const results = await executeDAG(stages, stageRunner);
      expect(results.flaky).toBe('FAILED');
    });
  });

});
