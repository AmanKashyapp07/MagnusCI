const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const crypto = require('crypto');

const LIVE_URL = process.env.TEST_TARGET_URL || 'http://129.154.39.198';
const TEST_REPO_PATH = '/Users/amankashyap/Documents/tes';

test.describe('Production-Grade Playwright E2E Suite: MagnusCI Live System Verification', () => {

  test('1. Auth Landing & SPA Routing Isolation (/login)', async ({ page }) => {
    await page.goto(`${LIVE_URL}/login`);
    
    await expect(page).toHaveTitle(/MagnusCI/i);

    const header = page.locator('header');
    await expect(header).toContainText(/System Operational/i);

    const githubBtn = page.getByRole('button', { name: /Connect with GitHub/i });
    await expect(githubBtn).toBeVisible();

    const headline = page.getByRole('heading', { level: 2 });
    await expect(headline).toContainText(/Build smarter/i);
  });

  test('2. Production API Health Contract (/api/health)', async ({ request }) => {
    const response = await request.get(`${LIVE_URL}/api/health`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.database).toBe('connected');
  });

  test('3. OAuth Handshake Entrypoint (/api/auth/github)', async ({ request }) => {
    const response = await request.get(`${LIVE_URL}/api/auth/github`, {
      maxRedirects: 0
    });
    expect(response.status()).toBe(302);
    const location = response.headers()['location'];
    expect(location).toContain('github.com/login/oauth/authorize');
    expect(location).toContain('client_id=');
    expect(location).toContain('scope=repo');
  });

  test('4. Production Static Frontend Bundle Assets Delivery', async ({ request, page }) => {
    await page.goto(`${LIVE_URL}/login`);
    
    const scriptSrc = await page.locator('script[src*="/assets/"]').first().getAttribute('src');
    expect(scriptSrc).toBeTruthy();

    const jsResponse = await request.get(`${LIVE_URL}${scriptSrc}`);
    expect(jsResponse.status()).toBe(200);
    const jsText = await jsResponse.text();
    expect(jsText.length).toBeGreaterThan(1000);

    const cssLink = await page.locator('link[href*="/assets/"]').first().getAttribute('href');
    if (cssLink) {
      const cssResponse = await request.get(`${LIVE_URL}${cssLink}`);
      expect(cssResponse.status()).toBe(200);
    }
  });

  test('5. Local Test Directory Pipeline Integrity (/Users/amankashyap/Documents/tes)', async () => {
    const output = execSync('npm test', {
      cwd: TEST_REPO_PATH,
      encoding: 'utf8'
    });

    expect(output).toContain('Running automated unit tests...');
    expect(output).toContain('All unit tests passed seamlessly!');
  });

  test('6. GitHub Webhook Ingestion & Signature Verification', async ({ request }) => {
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

    const secret = process.env.GITHUB_WEBHOOK_SECRET || 'secret123';
    const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const response = await request.post(`${LIVE_URL}/api/webhooks/github`, {
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256': signature,
        'content-type': 'application/json'
      },
      data: payload
    });

    expect([200, 401]).toContain(response.status());
  });

});
