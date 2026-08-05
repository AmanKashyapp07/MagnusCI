const { hasCycle, loadPipelineStages, executeDAG } = require('../../backend/src/utils/dag');

describe('Production-Grade Unit Tests: Advanced Topological DAG Engine & Edge Cases', () => {

  test('should detect circular dependency loop in stage graph using hasCycle', () => {
    const cyclicConfig = {
      stages: {
        stageA: { run: 'echo A', needs: ['stageB'] },
        stageB: { run: 'echo B', needs: ['stageA'] }
      }
    };

    expect(hasCycle(cyclicConfig.stages)).toBe(true);
  });

  test('should return false for acyclic dependency graph using hasCycle', () => {
    const acyclicConfig = {
      stages: {
        setup: { run: 'echo setup', needs: [] },
        test: { run: 'echo test', needs: ['setup'] },
        deploy: { run: 'echo deploy', needs: ['test'] }
      }
    };

    expect(hasCycle(acyclicConfig.stages)).toBe(false);
  });

  test('should execute independent parallel stages in proper order', async () => {
    const stages = {
      setup: { run: 'echo setup', needs: [] },
      test_unit: { run: 'echo unit', needs: ['setup'] },
      test_integration: { run: 'echo integration', needs: ['setup'] },
      deploy: { run: 'echo deploy', needs: ['test_unit', 'test_integration'] }
    };

    const logHistory = [];
    const mockExecutor = async (stageName) => {
      logHistory.push(stageName);
      return true;
    };

    const finalStates = await executeDAG(stages, mockExecutor);

    expect(finalStates.setup).toBe('SUCCESS');
    expect(finalStates.test_unit).toBe('SUCCESS');
    expect(finalStates.test_integration).toBe('SUCCESS');
    expect(finalStates.deploy).toBe('SUCCESS');
    expect(logHistory[0]).toBe('setup');
    expect(logHistory[3]).toBe('deploy');
  });

  test('should halt downstream stage execution immediately if upstream stage fails', async () => {
    const stages = {
      setup: { run: 'echo setup', needs: [] },
      test: { run: 'exit 1', needs: ['setup'] },
      deploy: { run: 'echo deploy', needs: ['test'] }
    };

    const executedStages = [];
    const mockExecutor = async (stageName) => {
      executedStages.push(stageName);
      if (stageName === 'test') {
        return false; // stage fails
      }
      return true;
    };

    const finalStates = await executeDAG(stages, mockExecutor);

    expect(executedStages).toContain('setup');
    expect(executedStages).toContain('test');
    expect(executedStages).not.toContain('deploy');
    expect(finalStates.test).toBe('FAILED');
    expect(finalStates.deploy).toBe('PENDING');
  });

});
