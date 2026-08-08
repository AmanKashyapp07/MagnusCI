const request = require('supertest');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const app = require('../../backend/src/index');
const previewService = require('../../backend/src/services/previewService');

describe('Production-Grade Test Suite: Dynamic Live Preview Environments Engine', () => {

  const testWorkspace = path.join(__dirname, 'temp_preview_workspace');
  const buildId = 5555;

  beforeAll(async () => {
    // Create simulated frontend build artifact (dist/index.html & dist/assets/app.js)
    const distPath = path.join(testWorkspace, 'dist');
    const assetsPath = path.join(distPath, 'assets');
    await fs.mkdir(assetsPath, { recursive: true });

    await fs.writeFile(path.join(distPath, 'index.html'), '<!DOCTYPE html><html><head><title>Preview App</title></head><body><h1>Magnus Live Preview</h1></body></html>');
    await fs.writeFile(path.join(assetsPath, 'app.js'), 'console.log("preview running");');
    await fs.writeFile(path.join(assetsPath, 'style.css'), 'body { background: #000; }');
  });

  afterAll(async () => {
    await fs.rm(testWorkspace, { recursive: true, force: true });
    await previewService.deletePreview(buildId);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Preview Deployment & Artifact Extraction
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Static Preview Artifact Deployment', () => {

    test('previewService should discover dist/ folder and deploy preview environment', async () => {
      const result = await previewService.deployPreview(buildId, testWorkspace);

      expect(result.deployed).toBe(true);
      expect(result.previewUrl).toBe(`/preview/${buildId}/`);
      expect(result.totalFiles).toBeGreaterThanOrEqual(3);
      expect(result.totalBytes).toBeGreaterThan(50);
    });

    test('previewService should return null when workspace has no frontend build output', async () => {
      const emptyDir = path.join(__dirname, 'temp_empty_preview');
      await fs.mkdir(emptyDir, { recursive: true });

      const result = await previewService.deployPreview(9999, emptyDir);
      expect(result.deployed).toBe(false);
      expect(result.previewUrl).toBeNull();

      await fs.rm(emptyDir, { recursive: true, force: true });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. HTTP Preview Routes & Staging Delivery
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. HTTP Preview Delivery & Metadata Routing', () => {

    test('GET /api/builds/:id/preview should return preview status and metadata', async () => {
      const res = await request(app).get(`/api/builds/${buildId}/preview`);
      expect(res.status).toBe(200);
      expect(res.body.deployed).toBe(true);
      expect(res.body.previewUrl).toBe(`/preview/${buildId}/`);
      expect(res.body.totalFiles).toBeGreaterThan(0);
      expect(res.body.expiresAt).toBeDefined();
    });

    test('GET /api/builds/:id/preview for non-existent build should return 404', async () => {
      const res = await request(app).get('/api/builds/888888/preview');
      expect(res.status).toBe(404);
      expect(res.body.deployed).toBe(false);
    });

    test('GET /preview/:buildId/index.html should serve static HTML preview', async () => {
      const res = await request(app).get(`/preview/${buildId}/index.html`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Magnus Live Preview');
      expect(res.headers['content-type']).toContain('text/html');
    });

    test('GET /preview/:buildId/assets/app.js should serve JavaScript asset', async () => {
      const res = await request(app).get(`/preview/${buildId}/assets/app.js`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('preview running');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. TTL Expiration & Pruning
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Automated TTL Expiration & Cleanup', () => {

    test('expired preview environments should be pruned automatically', async () => {
      const expiredBuildId = 6666;
      await previewService.deployPreview(expiredBuildId, testWorkspace);

      // Force expired timestamp in metadata
      const meta = previewService.getPreview(expiredBuildId);
      if (meta) {
        meta.expiresAt = Date.now() - 1000; // 1s in the past
      }

      await previewService.pruneExpiredPreviews();
      const afterPrune = previewService.getPreview(expiredBuildId);

      expect(afterPrune).toBeNull();
    });
  });

});
