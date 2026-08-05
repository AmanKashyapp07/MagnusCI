describe('Production-Grade Unit Tests: Log Stream Processor (utils/logParser.js)', () => {

  let parseLogsIntoSteps;

  beforeAll(() => {
    const module = require('../../frontend/src/utils/logParser.js');
    parseLogsIntoSteps = module.parseLogsIntoSteps;
  });

  test('should return empty steps list when raw logs are null or empty', () => {
    expect(parseLogsIntoSteps('', 'SUCCESS')).toEqual([]);
    expect(parseLogsIntoSteps(null, 'PENDING')).toEqual([]);
  });

  test('should strip ANSI color codes from terminal log streams', () => {
    const rawLogs = '\u001b[32m[SETUP] Packages installed successfully\u001b[0m\n[00:01:05] [TEST] PASS tests/app.test.js';
    const steps = parseLogsIntoSteps(rawLogs, 'SUCCESS');

    expect(steps).toBeDefined();
    expect(steps.length).toBeGreaterThan(0);

    const setupStep = steps.find(s => s.id === 'stage_setup');
    expect(setupStep).toBeDefined();
    expect(setupStep.lines[0]).not.toContain('\u001b[32m');
    expect(setupStep.lines[0]).toContain('[SETUP] Packages installed successfully');
  });

  test('should categorize logs into permanent system steps (setup_workspace, env_detect, cleanup)', () => {
    const logs = `
[00:00:01] Created workspace path /tmp/build-123
[00:00:02] Detecting project language Node.js
[00:00:03] Pruning operational file tree
    `;
    const steps = parseLogsIntoSteps(logs, 'SUCCESS');

    const setupWorkspaceStep = steps.find(s => s.id === 'setup_workspace');
    const envDetectStep = steps.find(s => s.id === 'env_detect');
    const cleanupStep = steps.find(s => s.id === 'cleanup');

    expect(setupWorkspaceStep).toBeDefined();
    expect(envDetectStep).toBeDefined();
    expect(cleanupStep).toBeDefined();

    expect(setupWorkspaceStep.lines[0]).toContain('Created workspace path');
    expect(envDetectStep.lines[0]).toContain('Detecting project language');
    expect(cleanupStep.lines[0]).toContain('Pruning operational file tree');
  });

  test('should extract dynamic stages from log prefixes', () => {
    const logs = `
[00:01:00] [SETUP] Installing dependencies...
[00:01:10] [TEST] Running Jest test runner...
[00:01:20] [BUILD] Compiling production bundle...
    `;
    const steps = parseLogsIntoSteps(logs, 'SUCCESS');

    const stageSetup = steps.find(s => s.id === 'stage_setup');
    const stageTest = steps.find(s => s.id === 'stage_test');
    const stageBuild = steps.find(s => s.id === 'stage_build');

    expect(stageSetup).toBeDefined();
    expect(stageTest).toBeDefined();
    expect(stageBuild).toBeDefined();

    expect(stageSetup.status).toBe('success');
    expect(stageTest.status).toBe('success');
    expect(stageBuild.status).toBe('success');
  });

  test('should parse realistic multi-stage execution log and mark completed stages as success even when buildStatus is RUNNING', () => {
    const realisticLogs = `
[21:57:10] [WORKER] Job Picked Up | Build ID: 16
[21:57:10] [WORKER] Build status forced to RUNNING.
[21:57:10] [ENGINE] Job #16 started for repository tes (main).
[21:57:11] [ENGINE] Repository workspace setup complete.
[21:57:12] [WORKER] Resolving dependency caching strategy...
[21:57:12] [ENGINE] Dependency cache: No lockfiles found.
[21:57:12] [ENGINE] Topological DAG stages parsed: setup -> test -> build
[21:57:12] [ENGINE] Spawning sandbox container for stage: setup
[SETUP] [SETUP] Setup complete
[21:57:15] [ENGINE] ✔ Stage 'setup' completed successfully.
[21:57:15] [ENGINE] Spawning sandbox container for stage: test
[TEST] [TEST] ✅ All unit tests passed seamlessly!
[21:57:18] [ENGINE] ✔ Stage 'test' completed successfully.
[21:57:18] [ENGINE] Spawning sandbox container for stage: build
[BUILD] [BUILD] Build step completed successfully!
[21:57:20] [ENGINE] ✔ Stage 'build' completed successfully.
[21:57:20] [ENGINE] DAG pipeline session finished. Exit Code: 0
[21:57:20] [WORKER] Harvesting build artifacts...
[21:57:20] [WORKER] Pruning operational file tree workspace...
[21:57:20] [WORKER] Job #16 has fully executed and finished context routines.
    `;

    const steps = parseLogsIntoSteps(realisticLogs, 'RUNNING');

    const stageSetup = steps.find(s => s.id === 'stage_setup');
    const stageTest = steps.find(s => s.id === 'stage_test');
    const stageBuild = steps.find(s => s.id === 'stage_build');
    const cleanupStep = steps.find(s => s.id === 'cleanup');

    expect(stageSetup).toBeDefined();
    expect(stageTest).toBeDefined();
    expect(stageBuild).toBeDefined();
    expect(cleanupStep).toBeDefined();

    expect(stageSetup.status).toBe('success');
    expect(stageTest.status).toBe('success');
    expect(stageBuild.status).toBe('success'); // No longer stuck in 'running'!
    expect(cleanupStep.status).toBe('success');
  });

  test('should mark stage status as failed when log contains failure keywords or emojis', () => {
    const logs = `
[00:01:00] [TEST] ❌ Test suite failed with 2 errors
    `;
    const steps = parseLogsIntoSteps(logs, 'FAILED');

    const stageTest = steps.find(s => s.id === 'stage_test');
    expect(stageTest).toBeDefined();
    expect(stageTest.status).toBe('failed');
  });

  test('should filter out transient TTY carriage return spinners like RUNS', () => {
    const logs = `
[00:01:00] [TEST] Executing test suite...
RUNS  ...
    `;
    const steps = parseLogsIntoSteps(logs, 'SUCCESS');

    const testStep = steps.find(s => s.id === 'stage_test');
    expect(testStep).toBeDefined();
    expect(testStep.lines).toContain('[00:01:00] [TEST] Executing test suite...');
    expect(testStep.lines).not.toContain('RUNS  ...');
  });

});
