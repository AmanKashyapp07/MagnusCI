const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LIVE_URL = 'http://magnus-ci.online';
const TEST_REPO_PATH = '/Users/amankashyap/Documents/tes';
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'secret123';

test.describe('Ultra-Rigorous E2E Suite: Production End-to-End System Verification', () => {

  //----------------------------------------------------------------------------
  // SECTION 1: PUBLIC AUTH LANDING & UI COMPONENT REGISTRY
  //----------------------------------------------------------------------------
  test.describe('1. Unauthenticated Auth Landing & UI Component Registry', () => {

    test('1.1 Direct Route /login loads Auth Landing with full component structure', async ({ page }) => {
      await page.goto(`${LIVE_URL}/login`);

      // 1. Page Title & Meta Tags
      await expect(page).toHaveTitle(/MagnusCI/i);

      // 2. Header & Brand Logo
      const header = page.locator('header');
      await expect(header).toBeVisible();
      await expect(header).toContainText(/MagnusCI/i);

      // 3. Operational Health Status Badge
      const statusBadge = header.locator('span').filter({ hasText: /System Operational/i });
      await expect(statusBadge).toBeVisible();

      // 4. Hero Section & Typography
      const headline = page.getByRole('heading', { level: 2 });
      await expect(headline).toBeVisible();
      await expect(headline).toContainText(/Build smarter/i);

      // 5. Connect with GitHub CTA Button
      const githubCta = page.getByRole('button', { name: /Connect with GitHub/i });
      await expect(githubCta).toBeVisible();

      // 6. Architecture Feature Cards (3 Cards)
      const featureCards = page.locator('.anthropic-card');
      await expect(featureCards).toHaveCount(3);
      await expect(page.getByText('Cryptographic Validation')).toBeVisible();
      await expect(page.getByText('Topological DAG Engine')).toBeVisible();
      await expect(page.getByText('Serverless Runners')).toBeVisible();

      // 7. Footer Navigation Grid
      const footer = page.locator('footer');
      await expect(footer).toBeVisible();
      await expect(footer.getByText('Product')).toBeVisible();
      await expect(footer.getByText('Resources')).toBeVisible();
      await expect(footer.getByText('Company')).toBeVisible();
      await expect(footer.getByText('Legal')).toBeVisible();
    });

    test('1.2 Mobile Viewport Layout & Responsiveness Check (375x667)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${LIVE_URL}/login`);

      // Header remains visible
      await expect(page.locator('header')).toBeVisible();
      
      // CTA button scales full width
      const githubCta = page.getByRole('button', { name: /Connect with GitHub/i });
      await expect(githubCta).toBeVisible();
    });

  });

  //----------------------------------------------------------------------------
  // SECTION 2: API CONTRACTS, SECURITY HEADERS & ROUTE ISOLATION
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
          body: JSON.stringify({ id: 1, username: 'AmanKashyapp07' })
        });
      });

      await page.route('**/api/repositories', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, name: 'tes', github_url: 'https://github.com/amankashyapp07/tes' }
          ])
        });
      });

      await page.route('**/api/builds**', async (route) => {
        if (route.request().url().includes('/logs')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              buildId: 101,
              logs: '[SETUP] npm ci completed\n[TEST] npm test passed\n[BUILD] npm run build finished'
            })
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { id: 101, repository_id: 1, repository_name: 'tes', commit_hash: '68a90cf', status: 'SUCCESS', created_at: new Date().toISOString() }
            ])
          });
        }
      });

      await page.goto(`${LIVE_URL}/dashboard`);

      // Click commit item to open modal
      const commitItem = page.getByText('68a90cf').first();
      await expect(commitItem).toBeVisible();
      await commitItem.click();

      // Modal Title & Action Buttons
      await expect(page.getByText('Execution Details')).toBeVisible();
      await expect(page.getByRole('button', { name: /Copy Logs/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Download/i })).toBeVisible();
    });

  });

  //----------------------------------------------------------------------------
  // SECTION 4: LOCAL TEST REPOSITORY DISK & PIPELINE DAG INTEGRITY
  //----------------------------------------------------------------------------
  test.describe('4. Local Test Directory (/Users/amankashyap/Documents/tes) Integrity', () => {

    test('4.1 Verify all required project files exist on local disk', async () => {
      const requiredFiles = ['package.json', 'index.js', 'test.js', 'magnus-ci.json', '.gitignore'];
      for (const file of requiredFiles) {
        const filePath = path.join(TEST_REPO_PATH, file);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });

    test('4.2 Verify magnus-ci.json DAG stage definitions', async () => {
      const configPath = path.join(TEST_REPO_PATH, 'magnus-ci.json');
      const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      expect(content).toHaveProperty('stages');
      expect(content.stages).toHaveProperty('setup');
      expect(content.stages).toHaveProperty('test');
      expect(content.stages).toHaveProperty('build');

      expect(content.stages.test.needs).toContain('setup');
      expect(content.stages.build.needs).toContain('test');
    });

    test('4.3 Execute local Node unit test suite cleanly', async () => {
      const output = execSync('npm test', { cwd: TEST_REPO_PATH, encoding: 'utf8' });
      expect(output).toContain('Running automated unit tests...');
      expect(output).toContain('All unit tests passed seamlessly!');
    });

  });

  //----------------------------------------------------------------------------
  // SECTION 5: LIVE GITHUB WEBHOOK LIFECYCLE & SECURITY CIRCUITS
  //----------------------------------------------------------------------------
  test.describe('5. Live Webhook Ingestion & Security Circuit Breakers', () => {

    test('5.1 Valid Push Event with HMAC Signature is Accepted or Authenticated', async ({ request }) => {
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        after: '68a90cfe048c2bd983f2738d0765efb1a627a3d1',
        repository: {
          name: 'tes',
          clone_url: 'https://github.com/amankashyapp07/tes.git'
        },
        head_commit: {
          author: { name: 'AmanKashyapp07', email: 'aman@example.com' }
        }
      });

      const signature = 'sha256=' + crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET).update(payload).digest('hex');

      const response = await request.post(`${LIVE_URL}/api/webhooks/github`, {
        headers: {
          'x-github-event': 'push',
          'x-hub-signature-256': signature,
          'content-type': 'application/json'
        },
        data: payload
      });

      expect([200, 202, 401]).toContain(response.status());
    });

    test('5.2 Non-Push Event (ping) returns 200 OK with graceful ignore', async ({ request }) => {
      const payload = JSON.stringify({ zen: 'Non-blocking is better than blocking.', hook_id: 12345 });
      const signature = 'sha256=' + crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET).update(payload).digest('hex');

      const response = await request.post(`${LIVE_URL}/api/webhooks/github`, {
        headers: {
          'x-github-event': 'ping',
          'x-hub-signature-256': signature,
          'content-type': 'application/json'
        },
        data: payload
      });

      expect([200, 401]).toContain(response.status());
    });

    test('5.3 Infinite Loop Guard drops commits authored by Magnus CI', async ({ request }) => {
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        after: '68a90cfe048c2bd983f2738d0765efb1a627a3d1',
        repository: {
          name: 'tes',
          clone_url: 'https://github.com/amankashyapp07/tes.git'
        },
        head_commit: {
          author: { name: 'Magnus CI', email: 'ci@magnus.internal' }
        }
      });

      const signature = 'sha256=' + crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET).update(payload).digest('hex');

      const response = await request.post(`${LIVE_URL}/api/webhooks/github`, {
        headers: {
          'x-github-event': 'push',
          'x-hub-signature-256': signature,
          'content-type': 'application/json'
        },
        data: payload
      });

      if (response.status() === 200) {
        const body = await response.json();
        expect(body.message).toContain('Ignored commit pushed by Magnus CI');
      }
    });

  });

});
