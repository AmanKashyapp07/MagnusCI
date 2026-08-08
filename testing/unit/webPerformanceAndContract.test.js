const path = require('path');
const fs = require('fs');
const request = require('supertest');
const app = require('../../backend/src/index');

describe('Production-Grade Test Suite 6: Web Performance, Budget Gating & API Contract Integrity', () => {

  const distPath = path.join(__dirname, '../../frontend/dist');

  // ───────────────────────────────────────────────────────────────────────────
  // 1. PWA Manifest & Service Worker Cache Contract
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. PWA Manifest & Service Worker Contract', () => {

    test('manifest.webmanifest must satisfy valid PWA specification', () => {
      const manifestPath = path.join(distPath, 'manifest.webmanifest');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.name).toBe('Magnus CI/CD Engine');
      expect(manifest.short_name).toBe('MagnusCI');
      expect(manifest.theme_color).toBe('#0f172a');
      expect(manifest.background_color).toBe('#0f172a');
      expect(manifest.display).toBe('standalone');
      expect(manifest.start_url).toBe('/ci/');
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThan(0);
    });

    test('sw.js must contain precache manifest and workbox routing rules', () => {
      const swPath = path.join(distPath, 'sw.js');
      expect(fs.existsSync(swPath)).toBe(true);

      const swCode = fs.readFileSync(swPath, 'utf8');
      expect(swCode).toContain('precacheAndRoute');
      expect(swCode).toContain('workbox');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Static Bundle Size Budget Gating
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Static Bundle Size Budget Gating', () => {

    test('vendor chunks and application bundles must stay within strict performance budgets', () => {
      const assetsDir = path.join(distPath, 'assets');
      expect(fs.existsSync(assetsDir)).toBe(true);

      const files = fs.readdirSync(assetsDir);

      // Budgets (Uncompressed size caps)
      const BUDGETS = {
        'vendor-react': 300 * 1024,     // Max 300KB
        'vendor-terminal': 50 * 1024,   // Max 50KB
        'index': 150 * 1024,            // Max 150KB
        'css': 60 * 1024                // Max 60KB
      };

      files.forEach((file) => {
        const filePath = path.join(assetsDir, file);
        const stat = fs.statSync(filePath);

        if (file.startsWith('vendor-react') && file.endsWith('.js')) {
          expect(stat.size).toBeLessThan(BUDGETS['vendor-react']);
        } else if (file.startsWith('vendor-terminal') && file.endsWith('.js')) {
          expect(stat.size).toBeLessThan(BUDGETS['vendor-terminal']);
        } else if (file.startsWith('index') && file.endsWith('.js')) {
          expect(stat.size).toBeLessThan(BUDGETS['index']);
        } else if (file.endsWith('.css')) {
          expect(stat.size).toBeLessThan(BUDGETS['css']);
        }
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. API Contract & Schema Integrity
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. API Schema & JSON Response Contract Verification', () => {

    test('GET /api/health schema must strictly match health contract', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);

      const body = res.body;
      expect(typeof body.status).toBe('string');
      expect(body.status).toBe('healthy');
      expect(typeof body.database).toBe('string');
      expect(body.database).toBe('connected');
      expect(body.time).toBeDefined();
    });

    test('GET /api/builds must reject unauthenticated requests with 401 Unauthorized schema', async () => {
      const res = await request(app).get('/api/builds');
      expect([401, 403]).toContain(res.status);
      expect(res.body).toBeDefined();
      expect(res.body.error || res.body.message).toBeDefined();
    });

    test('GET /ci/api/repositories must reject unauthenticated requests with 401 Unauthorized schema', async () => {
      const res = await request(app).get('/ci/api/repositories');
      expect([401, 403]).toContain(res.status);
      expect(res.body).toBeDefined();
    });

    test('Artifact route GET /artifacts/nonexistent should return 404', async () => {
      const res = await request(app).get('/artifacts/nonexistent-artifact-file-12345.tar');
      expect(res.status).toBe(404);
    });
  });

});
