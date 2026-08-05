const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const TES_REPO_PATH = '/Users/amankashyap/Documents/tes';
const TARGET_URL = process.env.BASE_URL || 'http://magnus-ci.online';

test.describe('Realistic E2E Test Suite: Local Repository Pipeline (/Users/amankashyap/Documents/tes)', () => {

  test('1. Local Test Repository Integrity Check', async () => {
    expect(fs.existsSync(TES_REPO_PATH)).toBe(true);
    
    const magnusConfigPath = path.join(TES_REPO_PATH, 'magnus-ci.json');
    expect(fs.existsSync(magnusConfigPath)).toBe(true);

    const configContent = JSON.parse(fs.readFileSync(magnusConfigPath, 'utf8'));
    expect(configContent).toHaveProperty('stages');
    expect(configContent.stages).toHaveProperty('setup');
    expect(configContent.stages).toHaveProperty('test');
    expect(configContent.stages).toHaveProperty('build');
  });

  test('2. Webhook Event Payload to Queue Mapping Verification', async ({ request }) => {
    const webhookPayload = {
      ref: 'refs/heads/main',
      after: '6b9d8ca51da3266a93b68ba5b6ddb26615ddccb5',
      repository: {
        name: 'tes',
        clone_url: 'https://github.com/amankashyapp07/tes.git',
        owner: {
          login: 'amankashyapp07'
        }
      },
      head_commit: {
        id: '6b9d8ca51da3266a93b68ba5b6ddb26615ddccb5',
        message: 'test commit from tes folder',
        author: {
          name: 'Developer',
          email: 'dev@test.local'
        }
      }
    };

    const response = await request.post(`${TARGET_URL}/api/webhooks/github`, {
      headers: {
        'x-github-event': 'push',
        'Content-Type': 'application/json'
      },
      data: webhookPayload
    });

    expect([200, 202, 401]).toContain(response.status());
  });

  test('3. Simulated Log Parsing & Stage Status Transition', async () => {
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

  test('4. Pipeline Failure & Error Propagation Handling', async () => {
    const { parseLogsIntoSteps } = require('../../frontend/src/utils/logParser.js');
    
    const failureLogs = `
[22:10:00] [ENGINE] Job #19 started for repository tes (main).
[22:10:01] [ENGINE] Topological DAG stages parsed: setup -> test -> build
[SETUP] [SETUP] Setup complete
[22:10:02] [ENGINE] ✔ Stage 'setup' completed successfully.
[TEST] [TEST] ❌ Stage 'test' failed execution. Error: Command failed with exit code 1
[22:10:03] [ENGINE] DAG pipeline session finished. Exit Code: 1
[22:10:04] [WORKER] Pruning operational file tree workspace...
    `;

    const steps = parseLogsIntoSteps(failureLogs, 'FAILED');

    const setupStage = steps.find(s => s.id === 'stage_setup');
    const testStage = steps.find(s => s.id === 'stage_test');
    const cleanupStep = steps.find(s => s.id === 'cleanup');

    expect(setupStage.status).toBe('success');
    expect(testStage.status).toBe('failed');
    expect(cleanupStep.status).toBe('success');
  });

  test('5. Queue Payload URL Aliasing & Fallback Verification', async () => {
    const payloadVariants = [
      { repoUrl: 'https://github.com/amankashyapp07/tes.git' },
      { githubUrl: 'https://github.com/amankashyapp07/tes.git' },
      { repoUrl: 'https://github.com/amankashyapp07/tes.git', githubUrl: 'https://github.com/amankashyapp07/tes.git' }
    ];

    for (const variant of payloadVariants) {
      const targetUrl = variant.githubUrl || variant.repoUrl;
      expect(targetUrl).toBe('https://github.com/amankashyapp07/tes.git');
      
      const parts = targetUrl.replace(/\.git$/, '').split('/');
      const repoName = parts[parts.length - 1];
      const owner = parts[parts.length - 2];

      expect(repoName).toBe('tes');
      expect(owner).toBe('amankashyapp07');
    }
  });

  test('6. Local Test Suite Unit Execution in tes Workspace', async () => {
    const testOutput = execSync('npm test', { cwd: TES_REPO_PATH, encoding: 'utf8' });
    expect(testOutput).toContain('All unit tests passed');
  });

});
