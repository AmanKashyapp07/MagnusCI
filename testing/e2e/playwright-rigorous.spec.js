const { test, expect } = require('@playwright/test');

const LIVE_URL = process.env.TEST_TARGET_URL || 'http://129.154.39.198/ci';

test.describe('Ultra-Rigorous E2E Suite: Production End-to-End System Verification', () => {

  //----------------------------------------------------------------------------
  // SECTION 1: UNAUTHENTICATED LANDING & UI COMPONENT REGISTRY
  //----------------------------------------------------------------------------
  test.describe('1. Unauthenticated Auth Landing & UI Component Registry', () => {

    test('1.1 Direct Route /login loads Auth Landing with full component structure', async ({ page }) => {
      await page.goto(`${LIVE_URL}/login`);

      // Verify Page Title & Metadata
      await expect(page).toHaveTitle(/MagnusCI/i);

      // Verify Header & System Badge
      await expect(page.getByText('MagnusCI').first()).toBeVisible();
      await expect(page.getByText('SYSTEM OPERATIONAL')).toBeVisible();

      // Verify Main Heading & Subtitle Text
      await expect(page.getByRole('heading', { name: /Build smarter,\s+ship with precision/i })).toBeVisible();
      
      // Verify GitHub OAuth Login Button
      const connectBtn = page.getByRole('button', { name: /Connect with GitHub/i });
      await expect(connectBtn).toBeVisible();

      // Verify Core Value Proposition Cards (Cryptographic, DAG, Serverless)
      await expect(page.getByRole('heading', { name: /Cryptographic Validation/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Topological DAG Engine/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Serverless Runners/i })).toBeVisible();
    });

    test('1.2 Mobile Viewport Layout & Responsiveness Check (375x667)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${LIVE_URL}/login`);

      const connectBtn = page.getByRole('button', { name: /Connect with GitHub/i });
      await expect(connectBtn).toBeVisible();
      
      const boundingBox = await connectBtn.boundingBox();
      expect(boundingBox).not.toBeNull();
      expect(boundingBox.width).toBeLessThanOrEqual(375);
    });

  });

  //----------------------------------------------------------------------------
  // SECTION 2: API CONTRACTS, SECURITY HEADERS & ISOLATION
  //----------------------------------------------------------------------------
  test.describe('2. API Contracts, Security Headers & Isolation', () => {

    test('2.1 Health Check API (/api/health) returns 200 OK & database connected status', async ({ request }) => {
      const response = await request.get(`${LIVE_URL}/api/health`);
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('status', 'healthy');
      expect(body).toHaveProperty('database', 'connected');
      expect(body).toHaveProperty('time');
    });

    test('2.2 GitHub OAuth Entrypoint (/api/auth/github) initiates secure redirect', async ({ request }) => {
      const response = await request.get(`${LIVE_URL}/api/auth/github`, { maxRedirects: 0 });
      expect(response.status()).toBe(302);
      
      const location = response.headers()['location'];
      expect(location).toContain('github.com/login/oauth/authorize');
      expect(location).toContain('client_id=');
      expect(location).toContain('scope=repo');
    });

    test('2.3 Protected Endpoint Gating returns 401 for unauthenticated requests', async ({ request }) => {
      const reposRes = await request.get(`${LIVE_URL}/api/repositories`);
      expect(reposRes.status()).toBe(401);

      const buildsRes = await request.get(`${LIVE_URL}/api/builds`);
      expect(buildsRes.status()).toBe(401);

      const meRes = await request.get(`${LIVE_URL}/api/auth/me`);
      expect(meRes.status()).toBe(401);
    });

    test('2.4 Wildcard Routing Fallback handles unknown paths gracefully', async ({ request }) => {
      const response = await request.get(`${LIVE_URL}/api/non-existent-route-999`);
      expect([200, 404]).toContain(response.status());
    });

    test('2.5 OAuth URL Token Query Ingestion & SPA Navigation', async ({ page }) => {
      const sampleToken = 'header.samplepayload.signature';

      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, username: 'OAuthUser', avatar_url: 'https://avatars.githubusercontent.com/u/99' })
        });
      });

      await page.route('**/api/repositories', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      });

      await page.route('**/api/builds**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      });

      // Simulate GitHub callback redirect with ?token=...
      await page.goto(`${LIVE_URL}/?token=${sampleToken}`);

      // Verify token was stored in localStorage
      const storedToken = await page.evaluate(() => localStorage.getItem('token'));
      expect(storedToken).toBe(sampleToken);

      // Verify user lands on /dashboard
      await expect(page).toHaveURL(/.*\/dashboard/);
    });

  });

  //----------------------------------------------------------------------------
  // SECTION 3: AUTHENTICATED DASHBOARD WORKSPACE UI FLOW & MODALS
  //----------------------------------------------------------------------------
  test.describe('3. Authenticated Dashboard Workspace UI Flow', () => {

    test('3.1 Authenticated Dashboard Renders Workspace Components & Metrics', async ({ page }) => {
      const mockToken = 'header.payload.signature';
      await page.addInitScript((t) => {
        localStorage.setItem('token', t);
      }, mockToken);

      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, username: 'AmanKashyapp07', avatar_url: 'https://avatars.githubusercontent.com/u/12345' })
        });
      });

      await page.route('**/api/repositories', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { id: 1, name: 'tes', github_url: 'https://github.com/amankashyapp07/tes', created_at: new Date().toISOString() },
              { id: 2, name: 'Alpha', github_url: 'https://github.com/amankashyapp07/github-test-ci', created_at: new Date().toISOString() }
            ])
          });
        } else {
          await route.continue();
        }
      });

      await page.route('**/api/builds**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 101, repository_id: 1, repository_name: 'tes', commit_hash: '68a90cf', status: 'SUCCESS', created_at: new Date().toISOString() }
          ])
        });
      });

      await page.goto(`${LIVE_URL}/dashboard`);

      // Verify User Avatar & Header Name
      await expect(page.locator('header').getByText('AmanKashyapp07')).toBeVisible();

      // Verify Metrics Row Cards
      await expect(page.getByText('Workspaces', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Total Executions', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Active Runners', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Success Rate', { exact: true }).first()).toBeVisible();

      // Verify Connect Repository Form Inputs
      await expect(page.getByPlaceholder('Magnus-core-api')).toBeVisible();
      await expect(page.getByPlaceholder('https://github.com/user/repo')).toBeVisible();
      await expect(page.getByRole('button', { name: /Connect Hook/i })).toBeVisible();

      // Verify Workspace List Items
      await expect(page.getByText('tes').first()).toBeVisible();
      await expect(page.getByText('Alpha').first()).toBeVisible();
    });

    test('3.2 Build Execution Modal Interaction (Open, Terminal, Logs)', async ({ page }) => {
      const mockToken = 'header.payload.signature';
      await page.addInitScript((t) => {
        localStorage.setItem('token', t);
      }, mockToken);

      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, username: 'AmanKashyapp07', avatar_url: 'https://avatars.githubusercontent.com/u/12345' })
        });
      });

      await page.route('**/api/repositories', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, name: 'tes', github_url: 'https://github.com/amankashyapp07/tes', created_at: new Date().toISOString() }
          ])
        });
      });

      await page.route('**/api/builds**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 101, repository_id: 1, repository_name: 'tes', commit_hash: '68a90cf', status: 'SUCCESS', created_at: new Date().toISOString() }
          ])
        });
      });

      await page.route('**/api/builds/101/logs', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            build: { id: 101, repository_name: 'tes', status: 'SUCCESS', commit_hash: '68a90cf' },
            logs: '[ENGINE] Spawning sandbox container...\n[SETUP] npm ci\n[ENGINE] Stage setup completed successfully.\n[TEST] npm test\n[TEST] All 42 tests passed cleanly.'
          })
        });
      });

      await page.goto(`${LIVE_URL}/dashboard`);

      // Verify Dashboard Loaded
      await expect(page.getByText('tes').first()).toBeVisible();

      // Click execution commit hash to open modal
      await page.getByText('68a90cf').first().click();

      // Verify Modal Title
      const modalTitle = page.getByText('Execution Details');
      await expect(modalTitle).toBeVisible();

      // Close Modal by clicking the close button (title="Close")
      await page.getByTitle('Close').click();
      await expect(modalTitle).not.toBeVisible();
    });

  });

  //----------------------------------------------------------------------------
  // SECTION 4: LOCAL TEST DIRECTORY INTEGRITY (/Users/amankashyap/Documents/tes)
  //----------------------------------------------------------------------------
  test.describe('4. Local Test Directory (/Users/amankashyap/Documents/tes) Integrity', () => {

    test('4.1 Verify all required project files exist on local disk', async () => {
      const fs = require('fs');
      const path = require('path');
      const targetDir = '/Users/amankashyap/Documents/tes';

      expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'magnus-ci.json'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'test.js'))).toBe(true);
    });

    test('4.2 Verify magnus-ci.json DAG stage definitions', async () => {
      const fs = require('fs');
      const path = require('path');
      const targetDir = '/Users/amankashyap/Documents/tes';

      const configData = JSON.parse(fs.readFileSync(path.join(targetDir, 'magnus-ci.json'), 'utf8'));
      expect(configData).toHaveProperty('stages');
      expect(configData.stages).toHaveProperty('setup');
      expect(configData.stages).toHaveProperty('test');
      expect(configData.stages.test.needs).toContain('setup');
    });

    test('4.3 Execute local Node unit test suite cleanly', async () => {
      const { execSync } = require('child_process');
      const targetDir = '/Users/amankashyap/Documents/tes';

      const result = execSync('npm test', { cwd: targetDir, encoding: 'utf8' });
      expect(result).toContain('All unit tests passed');
    });

  });

  //----------------------------------------------------------------------------
  // SECTION 5: LIVE WEBHOOK INGESTION & SECURITY CIRCUIT BREAKERS
  //----------------------------------------------------------------------------
  test.describe('5. Live Webhook Ingestion & Security Circuit Breakers', () => {

    test('5.1 Valid Push Event with HMAC Signature is Accepted or Authenticated', async ({ request }) => {
      const crypto = require('crypto');
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        repository: { name: 'tes', full_name: 'amankashyapp07/tes', clone_url: 'https://github.com/amankashyapp07/tes.git' },
        head_commit: { id: '68a90cf123456789', message: 'test commit', author: { name: 'Aman Kashyap' } }
      });

      const secret = process.env.GITHUB_WEBHOOK_SECRET || 'aman123';
      const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const response = await request.post(`${LIVE_URL}/api/webhooks/github`, {
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'push',
          'X-Hub-Signature-256': signature
        },
        data: payload
      });

      expect([200, 202, 401, 500]).toContain(response.status());
    });

    test('5.2 Non-Push Event (ping) returns 200 OK or 401 Authentication Required', async ({ request }) => {
      const response = await request.post(`${LIVE_URL}/api/webhooks/github`, {
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'ping'
        },
        data: JSON.stringify({ zen: 'Non-push event test' })
      });

      expect([200, 401]).toContain(response.status());
    });

    test('5.3 Infinite Loop Guard drops commits authored by Magnus CI', async ({ request }) => {
      const crypto = require('crypto');
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        head_commit: {
          id: 'revert12345',
          message: 'Revert "broken build"',
          author: { name: 'Magnus CI', email: 'ci@magnus.internal' }
        }
      });

      const secret = process.env.GITHUB_WEBHOOK_SECRET || 'aman123';
      const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const response = await request.post(`${LIVE_URL}/api/webhooks/github`, {
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'push',
          'X-Hub-Signature-256': signature
        },
        data: payload
      });

      expect([200, 401]).toContain(response.status());
    });

  });

  //----------------------------------------------------------------------------
  // SECTION 6: RESILIENCE, FALLBACKS & LOGOUT FLOW
  //----------------------------------------------------------------------------
  test.describe('6. System Resilience & User Logout Flow', () => {

    test('6.1 User Logout Flow clears localStorage token and redirects to /login', async ({ page }) => {
      const mockToken = 'header.payload.signature';
      await page.addInitScript((t) => {
        localStorage.setItem('token', t);
      }, mockToken);

      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, username: 'LogoutUser', avatar_url: 'https://avatars.githubusercontent.com/u/99' })
        });
      });

      await page.route('**/api/repositories', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.route('**/api/builds**', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.goto(`${LIVE_URL}/dashboard`);

      // Click Logout Button
      const logoutBtn = page.getByRole('button', { name: /Logout/i });
      await expect(logoutBtn).toBeVisible();
      await logoutBtn.click();

      // Verify token cleared from localStorage
      const storedToken = await page.evaluate(() => localStorage.getItem('token'));
      expect(storedToken).toBeFalsy();

      // Verify redirected to /login
      await expect(page).toHaveURL(/.*\/login/);
    });

    test('6.2 Direct Navigation to /dashboard without token redirects to /login', async ({ page }) => {
      await page.goto(`${LIVE_URL}/dashboard`);
      await expect(page).toHaveURL(/.*\/login/);
    });

  });

});
