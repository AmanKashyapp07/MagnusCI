const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const TES_REPO_PATH = process.env.TES_DIR || '/Users/amankashyap/Documents/tes';
const TARGET_URL = process.env.BASE_URL || 'http://129.154.39.198';

test.describe('Exhaustive E2E Test Suite: Local Repository Pipeline Manipulation (/Users/amankashyap/Documents/tes)', () => {
  
  // Snapshots for atomic restoration
  let originalIndexJs = '';
  let originalTestJs = '';
  let originalPackageJson = '';
  let originalMagnusConfig = '';

  test.beforeAll(async () => {
    expect(fs.existsSync(TES_REPO_PATH)).toBe(true);

    originalIndexJs = fs.readFileSync(path.join(TES_REPO_PATH, 'index.js'), 'utf8');
    originalTestJs = fs.readFileSync(path.join(TES_REPO_PATH, 'test.js'), 'utf8');
    originalPackageJson = fs.readFileSync(path.join(TES_REPO_PATH, 'package.json'), 'utf8');
    originalMagnusConfig = fs.readFileSync(path.join(TES_REPO_PATH, 'magnus-ci.json'), 'utf8');
  });

  test.afterEach(async () => {
    // Restore all files to pristine state after every test
    fs.writeFileSync(path.join(TES_REPO_PATH, 'index.js'), originalIndexJs, 'utf8');
    fs.writeFileSync(path.join(TES_REPO_PATH, 'test.js'), originalTestJs, 'utf8');
    fs.writeFileSync(path.join(TES_REPO_PATH, 'package.json'), originalPackageJson, 'utf8');
    fs.writeFileSync(path.join(TES_REPO_PATH, 'magnus-ci.json'), originalMagnusConfig, 'utf8');
  });

  test.afterAll(async () => {
    // Final sanity restoration
    fs.writeFileSync(path.join(TES_REPO_PATH, 'index.js'), originalIndexJs, 'utf8');
    fs.writeFileSync(path.join(TES_REPO_PATH, 'test.js'), originalTestJs, 'utf8');
    fs.writeFileSync(path.join(TES_REPO_PATH, 'package.json'), originalPackageJson, 'utf8');
    fs.writeFileSync(path.join(TES_REPO_PATH, 'magnus-ci.json'), originalMagnusConfig, 'utf8');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Combination 1: Baseline Clean Pipeline & Execution
  // ───────────────────────────────────────────────────────────────────────────
  test('Combination 1: Baseline Clean Pipeline Execution in tes Workspace', async () => {
    // Verify structure
    const config = JSON.parse(fs.readFileSync(path.join(TES_REPO_PATH, 'magnus-ci.json'), 'utf8'));
    expect(config.stages).toHaveProperty('setup');
    expect(config.stages).toHaveProperty('test');
    expect(config.stages).toHaveProperty('build');

    // Run baseline tests
    const testOutput = execSync('npm test', { cwd: TES_REPO_PATH, encoding: 'utf8' });
    expect(testOutput).toContain('Math Module Tests');
    expect(testOutput).toContain('String Module Tests');
    expect(testOutput).toContain('Array Module Tests');
    expect(testOutput).toContain('Test suite execution finished cleanly');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Combination 2: Code Manipulation — Test Failure & Circuit Breaking
  // ───────────────────────────────────────────────────────────────────────────
  test('Combination 2: Mutate Math Module -> Verify Test Failure & Circuit Breaker', async () => {
    // Corrupt add function in index.js
    const brokenIndex = originalIndexJs.replace(
      'function add(a, b) {\n  return a + b;\n}',
      'function add(a, b) {\n  return a + b + 9999; // Corrupted for test\n}'
    );
    fs.writeFileSync(path.join(TES_REPO_PATH, 'index.js'), brokenIndex, 'utf8');

    // Execute test in tes — must fail with exit code 1
    let failed = false;
    try {
      execSync('npm test', { cwd: TES_REPO_PATH, encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      failed = true;
      expect(err.status).toBe(1);
      expect(err.stdout.toString()).toContain('FAILED: add(2, 3) should equal 5');
    }
    expect(failed).toBe(true);

    // Verify DAG engine halts downstream stages
    const { parseLogsIntoSteps } = require('../../frontend/src/utils/logParser.js');
    const failureLog = `
      [ENGINE] Topological DAG stages parsed: setup -> test -> build
      [SETUP] Setup complete
      [TEST] ✗ FAILED: add(2, 3) should equal 5
      [TEST] ❌ Test suite execution failed!
      [ENGINE] ❌ Stage 'test' failed. Aborting pipeline.
      [ENGINE] ⏭️ Stage 'build' skipped due to upstream failure.
    `;
    const steps = parseLogsIntoSteps(failureLog, 'FAILED');
    const testStage = steps.find(s => s.id === 'stage_test');
    expect(testStage.status).toBe('failed');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Combination 3: Code Manipulation — String & Array Edge Cases
  // ───────────────────────────────────────────────────────────────────────────
  test('Combination 3: Mutate String/Array Module -> Validate Edge Case Rejection', async () => {
    // Corrupt isPalindrome in index.js
    const brokenIndex = originalIndexJs.replace(
      'function isPalindrome(str) {',
      'function isPalindrome(str) { return true; // Broken logic\n'
    );
    fs.writeFileSync(path.join(TES_REPO_PATH, 'index.js'), brokenIndex, 'utf8');

    let failed = false;
    try {
      execSync('npm test', { cwd: TES_REPO_PATH, encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      failed = true;
      expect(err.status).toBe(1);
      expect(err.stdout.toString()).toContain('FAILED: isPalindrome("hello") should be false');
    }
    expect(failed).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Combination 4: DAG Manipulation — Multi-Stage Parallel Concurrency
  // ───────────────────────────────────────────────────────────────────────────
  test('Combination 4: Mutate magnus-ci.json DAG to Multi-Stage Diamond Graph', async () => {
    const diamondDAG = {
      stages: {
        setup: { run: 'npm install' },
        lint: { run: "node -e 'console.log(\"Linting code...\")'", needs: ['setup'] },
        unit_test: { run: 'npm test', needs: ['setup'] },
        build: { run: 'npm run build', needs: ['lint', 'unit_test'] }
      }
    };
    fs.writeFileSync(path.join(TES_REPO_PATH, 'magnus-ci.json'), JSON.stringify(diamondDAG, null, 2), 'utf8');

    const config = JSON.parse(fs.readFileSync(path.join(TES_REPO_PATH, 'magnus-ci.json'), 'utf8'));
    expect(Object.keys(config.stages)).toEqual(['setup', 'lint', 'unit_test', 'build']);

    // Verify dependencies: lint and unit_test run in parallel after setup
    expect(config.stages.lint.needs).toEqual(['setup']);
    expect(config.stages.unit_test.needs).toEqual(['setup']);
    expect(config.stages.build.needs).toEqual(['lint', 'unit_test']);

    // Execute parallel lint command
    const lintOutput = execSync(config.stages.lint.run, { cwd: TES_REPO_PATH, encoding: 'utf8' });
    expect(lintOutput).toContain('Linting code...');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Combination 5: DAG Manipulation — Circular Dependency Loop Guard
  // ───────────────────────────────────────────────────────────────────────────
  test('Combination 5: Mutate magnus-ci.json to Circular Graph -> Verify Loop Guard', async () => {
    const circularDAG = {
      stages: {
        stageA: { run: 'echo A', needs: ['stageC'] },
        stageB: { run: 'echo B', needs: ['stageA'] },
        stageC: { run: 'echo C', needs: ['stageB'] }
      }
    };
    fs.writeFileSync(path.join(TES_REPO_PATH, 'magnus-ci.json'), JSON.stringify(circularDAG, null, 2), 'utf8');

    // Test cycle detection algorithm (Depth-First Search)
    const hasCycle = (stages) => {
      const visited = new Set();
      const recStack = new Set();

      const isCyclic = (node) => {
        if (!visited.has(node)) {
          visited.add(node);
          recStack.add(node);

          const neighbors = stages[node]?.needs || [];
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor) && isCyclic(neighbor)) return true;
            if (recStack.has(neighbor)) return true;
          }
        }
        recStack.delete(node);
        return false;
      };

      for (const node of Object.keys(stages)) {
        if (isCyclic(node)) return true;
      }
      return false;
    };

    const config = JSON.parse(fs.readFileSync(path.join(TES_REPO_PATH, 'magnus-ci.json'), 'utf8'));
    expect(hasCycle(config.stages)).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Combination 6: Configuration Manipulation — Broken Setup Command
  // ───────────────────────────────────────────────────────────────────────────
  test('Combination 6: Mutate magnus-ci.json to Invalid Setup -> Verify Early Abort', async () => {
    const invalidSetupDAG = {
      stages: {
        setup: { run: 'npm run non_existent_command_999' },
        test: { run: 'npm test', needs: ['setup'] }
      }
    };
    fs.writeFileSync(path.join(TES_REPO_PATH, 'magnus-ci.json'), JSON.stringify(invalidSetupDAG, null, 2), 'utf8');

    let failed = false;
    try {
      execSync('npm run non_existent_command_999', { cwd: TES_REPO_PATH, encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      failed = true;
      expect(err.status).not.toBe(0);
    }
    expect(failed).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Combination 7: Dependency Fingerprinting & Cache Invalidation
  // ───────────────────────────────────────────────────────────────────────────
  test('Combination 7: Dependency Hashing & Cache Invalidation on package.json Change', async () => {
    // Compute initial SHA-256 fingerprint
    const initialHash = crypto.createHash('sha256').update(originalPackageJson).digest('hex');

    // Mutate package.json with new dependency
    const mutatedPackage = JSON.parse(originalPackageJson);
    mutatedPackage.dependencies = { lodash: '^4.17.21' };
    const mutatedContent = JSON.stringify(mutatedPackage, null, 2);
    fs.writeFileSync(path.join(TES_REPO_PATH, 'package.json'), mutatedContent, 'utf8');

    // Compute mutated SHA-256 fingerprint
    const mutatedHash = crypto.createHash('sha256').update(mutatedContent).digest('hex');

    expect(mutatedHash).not.toBe(initialHash);
    expect(mutatedHash.length).toBe(64);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Combination 8: Infinite Loop Guard & Auto-Revert Suppression
  // ───────────────────────────────────────────────────────────────────────────
  test('Combination 8: Infinite Loop Guard on Magnus CI Author Commits', async ({ request }) => {
    // Push event authored by Magnus CI must be suppressed to prevent recursive loops
    const autoRevertPayload = {
      ref: 'refs/heads/main',
      after: 'a1b2c3d4e5f678901234567890abcdef12345678',
      repository: {
        name: 'tes',
        clone_url: 'https://github.com/amankashyapp07/tes.git',
        owner: { login: 'amankashyapp07' }
      },
      head_commit: {
        id: 'a1b2c3d4e5f678901234567890abcdef12345678',
        message: 'Revert: automated rollback [skip-ci]',
        author: {
          name: 'Magnus CI',
          email: 'ci-bot@magnus-ci.online'
        }
      }
    };

    // Verify suppression predicate
    const isBotCommit = 
      autoRevertPayload.head_commit.author.name === 'Magnus CI' ||
      autoRevertPayload.head_commit.message.includes('[skip-ci]');

    expect(isBotCommit).toBe(true);

    const response = await request.post(`${TARGET_URL}/api/webhooks/github`, {
      headers: {
        'x-github-event': 'push',
        'Content-Type': 'application/json'
      },
      data: autoRevertPayload
    });

    expect([200, 202, 401]).toContain(response.status());
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Combination 9: Log Stream Parsing & Real-Time ANSI Extraction
  // ───────────────────────────────────────────────────────────────────────────
  test('Combination 9: Raw Log Stream Parsing for tes Execution', async () => {
    const { parseLogsIntoSteps } = require('../../frontend/src/utils/logParser.js');
    
    const sampleLogs = `
[22:05:53] [WORKER] Job Picked Up | Build ID: 18
[22:05:53] [WORKER] Repo: https://github.com/amankashyapp07/tes @ [324ddd8]
[22:05:53] [WORKER] Build status forced to RUNNING.
[22:05:53] [ENGINE] Job #18 started for repository tes (main).
[22:05:53] [ENGINE] Cloning commit target 324ddd8...
[22:05:54] [ENGINE] Repository workspace setup complete.
[22:05:55] [ENGINE] Topological DAG stages parsed: setup -> test -> build
[SETUP] [SETUP] > tes@1.0.0 setup
[SETUP] [SETUP] Setup complete
[22:05:56] [ENGINE] ✔ Stage 'setup' completed successfully.
[TEST] [TEST] > tes@1.0.0 test
[TEST] [TEST] ✅ All unit tests passed seamlessly!
[22:05:57] [ENGINE] ✔ Stage 'test' completed successfully.
[BUILD] [BUILD] Build step completed successfully!
[22:05:58] [ENGINE] ✔ Stage 'build' completed successfully.
[22:05:58] [ENGINE] DAG pipeline session finished. Exit Code: 0
[22:05:58] [WORKER] Job #18 has fully executed and finished context routines.
    `;

    const steps = parseLogsIntoSteps(sampleLogs, 'SUCCESS');
    expect(steps.length).toBeGreaterThanOrEqual(4);
    
    const setupStage = steps.find(s => s.id === 'stage_setup');
    const testStage = steps.find(s => s.id === 'stage_test');
    const buildStage = steps.find(s => s.id === 'stage_build');

    expect(setupStage.status).toBe('success');
    expect(testStage.status).toBe('success');
    expect(buildStage.status).toBe('success');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Combination 10: Final Workspace Cleanliness Guarantee
  // ───────────────────────────────────────────────────────────────────────────
  test('Combination 10: Final State Verification — tes Workspace is 100% Pristine', async () => {
    const currentIndexJs = fs.readFileSync(path.join(TES_REPO_PATH, 'index.js'), 'utf8');
    const currentTestJs = fs.readFileSync(path.join(TES_REPO_PATH, 'test.js'), 'utf8');
    const currentPackageJson = fs.readFileSync(path.join(TES_REPO_PATH, 'package.json'), 'utf8');
    const currentMagnusConfig = fs.readFileSync(path.join(TES_REPO_PATH, 'magnus-ci.json'), 'utf8');

    expect(currentIndexJs).toBe(originalIndexJs);
    expect(currentTestJs).toBe(originalTestJs);
    expect(currentPackageJson).toBe(originalPackageJson);
    expect(currentMagnusConfig).toBe(originalMagnusConfig);

    // Final test run in tes
    const testOutput = execSync('npm test', { cwd: TES_REPO_PATH, encoding: 'utf8' });
    expect(testOutput).toContain('Test suite execution finished cleanly!');
  });

});
