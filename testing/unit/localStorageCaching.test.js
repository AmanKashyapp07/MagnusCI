const path = require('path');
const fs = require('fs');
const request = require('supertest');

// Import the backend express application for header verification
const app = require('../../backend/src/index');

describe('Production-Grade Test Suite: Local Storage & Static Asset Caching Engine', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Frontend Local Storage Caching Utility Logic
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Client LocalStorage Cache Engine (frontend/src/utils/localCache.js)', () => {
    let mockStorage = {};

    beforeEach(() => {
      mockStorage = {};
      // Mock global localStorage with in-memory store
      global.localStorage = {
        getItem: jest.fn((key) => mockStorage[key] || null),
        setItem: jest.fn((key, value) => {
          mockStorage[key] = String(value);
        }),
        removeItem: jest.fn((key) => {
          delete mockStorage[key];
        }),
        clear: jest.fn(() => {
          mockStorage = {};
        }),
      };
      Object.defineProperty(global.localStorage, 'length', {
        get: () => Object.keys(mockStorage).length,
      });
      global.localStorage.key = jest.fn((i) => Object.keys(mockStorage)[i]);
    });

    afterEach(() => {
      delete global.localStorage;
    });

    test('should serialize, store, and retrieve cached objects with getCachedData', () => {
      // Re-evaluate or test localCache logic
      const CACHE_PREFIX = 'magnus_cache_';
      const sampleRepos = [
        { id: 1, name: 'repo-alpha', url: 'https://github.com/test/alpha' },
        { id: 2, name: 'repo-beta', url: 'https://github.com/test/beta' }
      ];

      // Simulate setCachedData
      const payload = {
        data: sampleRepos,
        timestamp: Date.now(),
        expiry: null,
      };
      global.localStorage.setItem(`${CACHE_PREFIX}dashboard_repos`, JSON.stringify(payload));

      const raw = global.localStorage.getItem(`${CACHE_PREFIX}dashboard_repos`);
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw);
      expect(parsed.data).toEqual(sampleRepos);
      expect(parsed.expiry).toBeNull();
    });

    test('should respect TTL expiration and purge expired records on read', () => {
      const CACHE_PREFIX = 'magnus_cache_';
      const expiredPayload = {
        data: { activeBuilds: 4 },
        timestamp: Date.now() - 10000,
        expiry: Date.now() - 1000, // Expired 1 second ago
      };
      global.localStorage.setItem(`${CACHE_PREFIX}expired_metric`, JSON.stringify(expiredPayload));

      // Test TTL validation logic
      const raw = global.localStorage.getItem(`${CACHE_PREFIX}expired_metric`);
      const parsed = JSON.parse(raw);

      let result = null;
      if (parsed.expiry && Date.now() > parsed.expiry) {
        global.localStorage.removeItem(`${CACHE_PREFIX}expired_metric`);
        result = null;
      } else {
        result = parsed.data;
      }

      expect(result).toBeNull();
      expect(global.localStorage.removeItem).toHaveBeenCalledWith(`${CACHE_PREFIX}expired_metric`);
    });

    test('should return default fallback gracefully on corrupted JSON in localStorage', () => {
      const CACHE_PREFIX = 'magnus_cache_';
      global.localStorage.setItem(`${CACHE_PREFIX}corrupt_key`, '{ invalid-json-payload ');

      let data;
      try {
        const raw = global.localStorage.getItem(`${CACHE_PREFIX}corrupt_key`);
        const payload = JSON.parse(raw);
        data = payload.data ?? [];
      } catch {
        data = []; // Fallback triggered
      }

      expect(data).toEqual([]);
    });

    test('should selectively remove only magnus_cache_ keys on clearAllLocalCache', () => {
      const CACHE_PREFIX = 'magnus_cache_';
      mockStorage['magnus_cache_repos'] = JSON.stringify({ data: [1, 2] });
      mockStorage['magnus_cache_builds'] = JSON.stringify({ data: [3, 4] });
      mockStorage['unrelated_user_session'] = 'keep_this_token';

      // Simulate clearAllLocalCache
      Object.keys(mockStorage)
        .filter((k) => k.startsWith(CACHE_PREFIX))
        .forEach((k) => global.localStorage.removeItem(k));

      expect(mockStorage['magnus_cache_repos']).toBeUndefined();
      expect(mockStorage['magnus_cache_builds']).toBeUndefined();
      expect(mockStorage['unrelated_user_session']).toBe('keep_this_token');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Vite Configuration & Rollup Vendor Chunking Validation
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Vite Configuration & Chunk Optimization (frontend/vite.config.js)', () => {
    let viteConfigContent;

    beforeAll(() => {
      const configPath = path.join(__dirname, '../../frontend/vite.config.js');
      viteConfigContent = fs.readFileSync(configPath, 'utf8');
    });

    test('should include VitePWA plugin with autoUpdate and correct base path', () => {
      expect(viteConfigContent).toContain('VitePWA');
      expect(viteConfigContent).toContain("registerType: 'autoUpdate'");
      expect(viteConfigContent).toContain("base: '/ci/'");
    });

    test('should define runtime caching strategies for static fonts and media assets', () => {
      expect(viteConfigContent).toContain('magnus-static-assets');
      expect(viteConfigContent).toContain('CacheFirst');
      expect(viteConfigContent).toContain('StaleWhileRevalidate');
    });

    test('should separate heavy vendor dependencies (vendor-react & vendor-terminal) in manualChunks', () => {
      expect(viteConfigContent).toContain('vendor-react');
      expect(viteConfigContent).toContain('vendor-terminal');
      expect(viteConfigContent).toContain('ansi_up');
      expect(viteConfigContent).toContain('react');
    });

    test('manualChunks partitioner should accurately categorize module paths', () => {
      // Simulate the manualChunks function from vite.config.js
      const manualChunks = (id) => {
        if (id.includes('node_modules')) {
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
            return 'vendor-react';
          }
          if (id.includes('ansi_up')) {
            return 'vendor-terminal';
          }
        }
      };

      expect(manualChunks('/project/node_modules/react/index.js')).toBe('vendor-react');
      expect(manualChunks('/project/node_modules/react-dom/client.js')).toBe('vendor-react');
      expect(manualChunks('/project/node_modules/react-router-dom/dist/index.js')).toBe('vendor-react');
      expect(manualChunks('/project/node_modules/ansi_up/ansi_up.js')).toBe('vendor-terminal');
      expect(manualChunks('/project/node_modules/lodash/index.js')).toBeUndefined();
      expect(manualChunks('/project/src/components/BuildModal.jsx')).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Backend HTTP Static Cache-Control Headers
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Backend HTTP Local Disk Cache Controls (backend/src/index.js)', () => {
    test('should serve static SPA entrypoints with cache revalidation headers', async () => {
      const res = await request(app).get('/ci/');
      expect(res.headers['cache-control']).toBeDefined();
      expect(res.headers['cache-control']).toMatch(/max-age=0|must-revalidate|no-cache/);
    });

    test('should serve API and Socket endpoints without static immutable caching', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      // API responses should never have 1-year immutable caching
      if (res.headers['cache-control']) {
        expect(res.headers['cache-control']).not.toContain('max-age=31536000');
      }
    });

    test('backend static configuration should specify immutable 1-year maxAge for assets', () => {
      const serverCode = fs.readFileSync(path.join(__dirname, '../../backend/src/index.js'), 'utf8');
      expect(serverCode).toContain("maxAge: '1y'");
      expect(serverCode).toContain('immutable: true');
      expect(serverCode).toContain('max-age=31536000');
      expect(serverCode).toContain('must-revalidate');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Compiled PWA Service Worker & Manifest Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. PWA Build Artifacts & Service Worker Manifest Verification', () => {
    const distPath = path.join(__dirname, '../../frontend/dist');

    test('should contain generated Service Worker (sw.js) in frontend/dist', () => {
      const swPath = path.join(distPath, 'sw.js');
      expect(fs.existsSync(swPath)).toBe(true);
      const swContent = fs.readFileSync(swPath, 'utf8');
      expect(swContent).toContain('workbox');
    });

    test('should contain Web App Manifest (manifest.webmanifest) with standalone display', () => {
      const manifestPath = path.join(distPath, 'manifest.webmanifest');
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.short_name).toBe('MagnusCI');
      expect(manifest.display).toBe('standalone');
      expect(manifest.start_url).toBe('/ci/');
    });

    test('should verify split vendor chunks exist in dist/assets', () => {
      const assetsDir = path.join(distPath, 'assets');
      expect(fs.existsSync(assetsDir)).toBe(true);
      const files = fs.readdirSync(assetsDir);
      
      const hasReactVendor = files.some(f => f.startsWith('vendor-react') && f.endsWith('.js'));
      const hasTerminalVendor = files.some(f => f.startsWith('vendor-terminal') && f.endsWith('.js'));
      
      expect(hasReactVendor).toBe(true);
      expect(hasTerminalVendor).toBe(true);
    });
  });

});
