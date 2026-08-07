# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: playwright-rigorous.spec.js >> Ultra-Rigorous E2E Suite: Production End-to-End System Verification >> 6. System Resilience & User Logout Flow >> 6.2 Direct Navigation to /dashboard without token redirects to /login
- Location: e2e/playwright-rigorous.spec.js:406:5

# Error details

```
Error: page.goto: net::ERR_INVALID_ARGUMENT at http://129.154.39.198/ci/dashboard
Call log:
  - navigating to "http://129.154.39.198/ci/dashboard", waiting until "load"

```

# Test source

```ts
  307 |       });
  308 | 
  309 |       const secret = process.env.GITHUB_WEBHOOK_SECRET || 'aman123';
  310 |       const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  311 | 
  312 |       const response = await request.post(`${LIVE_URL}/api/webhooks/github`, {
  313 |         headers: {
  314 |           'Content-Type': 'application/json',
  315 |           'X-GitHub-Event': 'push',
  316 |           'X-Hub-Signature-256': signature
  317 |         },
  318 |         data: payload
  319 |       });
  320 | 
  321 |       expect([200, 202, 401, 500]).toContain(response.status());
  322 |     });
  323 | 
  324 |     test('5.2 Non-Push Event (ping) returns 200 OK or 401 Authentication Required', async ({ request }) => {
  325 |       const response = await request.post(`${LIVE_URL}/api/webhooks/github`, {
  326 |         headers: {
  327 |           'Content-Type': 'application/json',
  328 |           'X-GitHub-Event': 'ping'
  329 |         },
  330 |         data: JSON.stringify({ zen: 'Non-push event test' })
  331 |       });
  332 | 
  333 |       expect([200, 401]).toContain(response.status());
  334 |     });
  335 | 
  336 |     test('5.3 Infinite Loop Guard drops commits authored by Magnus CI', async ({ request }) => {
  337 |       const crypto = require('crypto');
  338 |       const payload = JSON.stringify({
  339 |         ref: 'refs/heads/main',
  340 |         head_commit: {
  341 |           id: 'revert12345',
  342 |           message: 'Revert "broken build"',
  343 |           author: { name: 'Magnus CI', email: 'ci@magnus.internal' }
  344 |         }
  345 |       });
  346 | 
  347 |       const secret = process.env.GITHUB_WEBHOOK_SECRET || 'aman123';
  348 |       const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  349 | 
  350 |       const response = await request.post(`${LIVE_URL}/api/webhooks/github`, {
  351 |         headers: {
  352 |           'Content-Type': 'application/json',
  353 |           'X-GitHub-Event': 'push',
  354 |           'X-Hub-Signature-256': signature
  355 |         },
  356 |         data: payload
  357 |       });
  358 | 
  359 |       expect([200, 401]).toContain(response.status());
  360 |     });
  361 | 
  362 |   });
  363 | 
  364 |   //----------------------------------------------------------------------------
  365 |   // SECTION 6: RESILIENCE, FALLBACKS & LOGOUT FLOW
  366 |   //----------------------------------------------------------------------------
  367 |   test.describe('6. System Resilience & User Logout Flow', () => {
  368 | 
  369 |     test('6.1 User Logout Flow clears localStorage token and redirects to /login', async ({ page }) => {
  370 |       const mockToken = 'header.payload.signature';
  371 |       await page.addInitScript((t) => {
  372 |         localStorage.setItem('token', t);
  373 |       }, mockToken);
  374 | 
  375 |       await page.route('**/api/auth/me', async (route) => {
  376 |         await route.fulfill({
  377 |           status: 200,
  378 |           contentType: 'application/json',
  379 |           body: JSON.stringify({ id: 1, username: 'LogoutUser', avatar_url: 'https://avatars.githubusercontent.com/u/99' })
  380 |         });
  381 |       });
  382 | 
  383 |       await page.route('**/api/repositories', async (route) => {
  384 |         await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  385 |       });
  386 | 
  387 |       await page.route('**/api/builds**', async (route) => {
  388 |         await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  389 |       });
  390 | 
  391 |       await page.goto(`${LIVE_URL}/dashboard`);
  392 | 
  393 |       // Click Logout Button
  394 |       const logoutBtn = page.getByRole('button', { name: /Logout/i });
  395 |       await expect(logoutBtn).toBeVisible();
  396 |       await logoutBtn.click();
  397 | 
  398 |       // Verify token cleared from localStorage
  399 |       const storedToken = await page.evaluate(() => localStorage.getItem('token'));
  400 |       expect(storedToken).toBeFalsy();
  401 | 
  402 |       // Verify redirected to /login
  403 |       await expect(page).toHaveURL(/.*\/login/);
  404 |     });
  405 | 
  406 |     test('6.2 Direct Navigation to /dashboard without token redirects to /login', async ({ page }) => {
> 407 |       await page.goto(`${LIVE_URL}/dashboard`);
      |                  ^ Error: page.goto: net::ERR_INVALID_ARGUMENT at http://129.154.39.198/ci/dashboard
  408 |       await expect(page).toHaveURL(/.*\/login/);
  409 |     });
  410 | 
  411 |   });
  412 | 
  413 | });
  414 | 
```