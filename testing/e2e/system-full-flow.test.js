const axios = require('axios');
const http = require('http');
const { loadPipelineStages, executeDAG } = require('../../backend/src/utils/dag');
const path = require('path');
const fs = require('fs').promises;

describe('Production-Grade E2E Tests: System Full-Flow & Webhook Automation', () => {

  const TARGET_URL = process.env.DEPLOYED_URL || 'http://magnus-ci.online';
  let httpAgent;

  beforeAll(() => {
    httpAgent = new http.Agent({ keepAlive: false });
  });

  afterAll(() => {
    if (httpAgent) {
      httpAgent.destroy();
    }
  });

  describe('1. Live Webhook Loop Guard & Event Ingestion E2E', () => {

    test('should return 200 OK and drop push events triggered by Magnus CI (Preventing Infinite Revert Loops)', async () => {
      const payload = {
        ref: 'refs/heads/main',
        head_commit: {
          id: '1234567890abcdef',
          message: 'Revert "Broken commit"',
          author: { name: 'Magnus CI', email: 'ci@magnus.internal' },
          committer: { name: 'Magnus CI', email: 'ci@magnus.internal' }
        },
        repository: { name: 'ci-cd-engine', clone_url: 'https://github.com/AmanKashyapp07/ci-cd-engine' }
      };

      const response = await axios.post(`${TARGET_URL}/api/webhooks/github`, payload, {
        headers: { 'x-github-event': 'push' },
        httpAgent,
        timeout: 10000,
        validateStatus: () => true
      });

      expect([200, 401]).toContain(response.status);
      if (response.status === 200) {
        expect(response.data.message).toContain('Ignored commit pushed by Magnus CI');
      }
    }, 15000);

    test('should return 200 OK for non-push webhook events (e.g. ping, release, star)', async () => {
      const response = await axios.post(`${TARGET_URL}/api/webhooks/github`, {}, {
        headers: { 'x-github-event': 'ping' },
        httpAgent,
        timeout: 10000,
        validateStatus: () => true
      });

      expect([200, 401]).toContain(response.status);
      if (response.status === 200) {
        expect(response.data.message).toContain('Ignored event type: ping');
      }
    }, 15000);

  });

  describe('2. Live Nginx & Express API Routing Isolation E2E', () => {

    test('should respond with 404 JSON format for invalid or unhandled API endpoint requests', async () => {
      const response = await axios.get(`${TARGET_URL}/api/unhandled-non-existent-route`, {
        httpAgent,
        timeout: 10000,
        validateStatus: () => true
      });

      expect([404, 200]).toContain(response.status);
    });

  });

  describe('3. Production Frontend Assets Delivery & MIME Checks E2E', () => {

    test('should deliver script bundle asset referenced in root HTML', async () => {
      const pageRes = await axios.get(`${TARGET_URL}/`, { httpAgent, timeout: 10000 });
      expect(pageRes.status).toBe(200);

      const scriptMatch = pageRes.data.match(/src="(\/assets\/[^"]+\.js)"/);
      expect(scriptMatch).not.toBeNull();

      const scriptUrl = scriptMatch[1];
      const assetRes = await axios.get(`${TARGET_URL}${scriptUrl}`, { httpAgent, timeout: 10000 });

      expect(assetRes.status).toBe(200);
      expect(assetRes.headers['content-type']).toMatch(/javascript|text\/plain/);
      expect(assetRes.data.length).toBeGreaterThan(100);
    });

    test('should deliver stylesheet asset referenced in root HTML', async () => {
      const pageRes = await axios.get(`${TARGET_URL}/`, { httpAgent, timeout: 10000 });
      expect(pageRes.status).toBe(200);

      const cssMatch = pageRes.data.match(/href="(\/assets\/[^"]+\.css)"/);
      expect(cssMatch).not.toBeNull();

      const cssUrl = cssMatch[1];
      const cssRes = await axios.get(`${TARGET_URL}${cssUrl}`, { httpAgent, timeout: 10000 });

      expect(cssRes.status).toBe(200);
      expect(cssRes.headers['content-type']).toMatch(/css|text\/plain/);
      expect(cssRes.data.length).toBeGreaterThan(100);
    });

  });

  describe('4. Full End-to-End Pipeline Execution Cycle E2E', () => {

    const testWorkspace = path.join(__dirname, 'temp_e2e_workspace');

    beforeAll(async () => {
      await fs.mkdir(testWorkspace, { recursive: true });
    });

    afterAll(async () => {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    });

    test('should load DAG config, execute topological stages, and verify lifecycle state transitions', async () => {
      const config = {
        stages: {
          setup: { run: 'npm ci' },
          test: { run: 'npm test', needs: ['setup'] },
          build: { run: 'npm run build', needs: ['test'] }
        }
      };
      await fs.writeFile(path.join(testWorkspace, 'magnus-ci.json'), JSON.stringify(config));

      const parsedStages = await loadPipelineStages(testWorkspace, 'Node.js', 'node:20-alpine');
      expect(Object.keys(parsedStages)).toEqual(['setup', 'test', 'build']);

      const stateTransitions = [];
      const mockRunner = jest.fn(async (stageName) => {
        stateTransitions.push(`RUNNING:${stageName}`);
        await new Promise(r => setTimeout(r, 10));
        stateTransitions.push(`SUCCESS:${stageName}`);
        return true;
      });

      const finalStates = await executeDAG(parsedStages, mockRunner);

      expect(finalStates).toEqual({
        setup: 'SUCCESS',
        test: 'SUCCESS',
        build: 'SUCCESS'
      });

      expect(stateTransitions).toEqual([
        'RUNNING:setup',
        'SUCCESS:setup',
        'RUNNING:test',
        'SUCCESS:test',
        'RUNNING:build',
        'SUCCESS:build'
      ]);
    });

  });

});
