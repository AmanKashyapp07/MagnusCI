# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: testing/e2e/playwright-rigorous.spec.js >> Ultra-Rigorous E2E Suite: Production End-to-End System Verification >> 4. Local Test Directory (/Users/amankashyap/Documents/tes) Integrity >> 4.3 Execute local Node unit test suite cleanly
- Location: testing/e2e/playwright-rigorous.spec.js:286:5

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "All unit tests passed"
Received string:    "
> tes@1.0.0 test
> node test.js·
🚀 Starting MagnusCI Comprehensive Test Suite...·
--- Math Module Tests ---
  ✓ PASSED: add(2, 3) should equal 5
  ✓ PASSED: subtract(10, 4) should equal 6
  ✓ PASSED: multiply(4, 5) should equal 20
  ✓ PASSED: divide(20, 4) should equal 5
  ✓ PASSED: divide by zero should throw Error
  ✓ PASSED: isPrime(7) should be true
  ✓ PASSED: isPrime(10) should be false·
--- String Module Tests ---
  ✓ PASSED: reverseString(\"hello\") should equal \"olleh\"
  ✓ PASSED: isPalindrome(\"racecar\") should be true
  ✓ PASSED: isPalindrome(\"hello\") should be false·
--- Array Module Tests ---
  ✓ PASSED: uniqueArray([1, 2, 2, 3, 3, 4]) should return [1, 2, 3, 4]
  ✓ PASSED: flattenArray([1, [2, [3, 4]]]) should return [1, 2, 3, 4]·
======================================
Results: 12 passed, 0 failed
======================================
✅ Test suite execution finished cleanly!
"
```

# Test source

```ts
  191 |       await expect(page.getByText('tes').first()).toBeVisible();
  192 |       await expect(page.getByText('Alpha').first()).toBeVisible();
  193 |     });
  194 | 
  195 |     test('3.2 Build Execution Modal Interaction (Open, Terminal, Logs)', async ({ page }) => {
  196 |       const mockToken = 'header.payload.signature';
  197 |       await page.addInitScript((t) => {
  198 |         localStorage.setItem('token', t);
  199 |       }, mockToken);
  200 | 
  201 |       await page.route('**/api/auth/me', async (route) => {
  202 |         await route.fulfill({
  203 |           status: 200,
  204 |           contentType: 'application/json',
  205 |           body: JSON.stringify({ id: 1, username: 'AmanKashyapp07', avatar_url: 'https://avatars.githubusercontent.com/u/12345' })
  206 |         });
  207 |       });
  208 | 
  209 |       await page.route('**/api/repositories', async (route) => {
  210 |         await route.fulfill({
  211 |           status: 200,
  212 |           contentType: 'application/json',
  213 |           body: JSON.stringify([
  214 |             { id: 1, name: 'tes', github_url: 'https://github.com/amankashyapp07/tes', created_at: new Date().toISOString() }
  215 |           ])
  216 |         });
  217 |       });
  218 | 
  219 |       await page.route('**/api/builds**', async (route) => {
  220 |         await route.fulfill({
  221 |           status: 200,
  222 |           contentType: 'application/json',
  223 |           body: JSON.stringify([
  224 |             { id: 101, repository_id: 1, repository_name: 'tes', commit_hash: '68a90cf', status: 'SUCCESS', created_at: new Date().toISOString() }
  225 |           ])
  226 |         });
  227 |       });
  228 | 
  229 |       await page.route('**/api/builds/101/logs', async (route) => {
  230 |         await route.fulfill({
  231 |           status: 200,
  232 |           contentType: 'application/json',
  233 |           body: JSON.stringify({
  234 |             build: { id: 101, repository_name: 'tes', status: 'SUCCESS', commit_hash: '68a90cf' },
  235 |             logs: '[ENGINE] Spawning sandbox container...\n[SETUP] npm ci\n[ENGINE] Stage setup completed successfully.\n[TEST] npm test\n[TEST] All 42 tests passed cleanly.'
  236 |           })
  237 |         });
  238 |       });
  239 | 
  240 |       await page.goto(`${LIVE_URL}/dashboard`);
  241 | 
  242 |       // Verify Dashboard Loaded
  243 |       await expect(page.getByText('tes').first()).toBeVisible();
  244 | 
  245 |       // Click execution commit hash to open modal
  246 |       await page.getByText('68a90cf').first().click();
  247 | 
  248 |       // Verify Modal Title
  249 |       const modalTitle = page.getByText('Execution Details');
  250 |       await expect(modalTitle).toBeVisible();
  251 | 
  252 |       // Close Modal by clicking the close button (title="Close")
  253 |       await page.getByTitle('Close').click();
  254 |       await expect(modalTitle).not.toBeVisible();
  255 |     });
  256 | 
  257 |   });
  258 | 
  259 |   //----------------------------------------------------------------------------
  260 |   // SECTION 4: LOCAL TEST DIRECTORY INTEGRITY (/Users/amankashyap/Documents/tes)
  261 |   //----------------------------------------------------------------------------
  262 |   test.describe('4. Local Test Directory (/Users/amankashyap/Documents/tes) Integrity', () => {
  263 | 
  264 |     test('4.1 Verify all required project files exist on local disk', async () => {
  265 |       const fs = require('fs');
  266 |       const path = require('path');
  267 |       const targetDir = '/Users/amankashyap/Documents/tes';
  268 | 
  269 |       expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
  270 |       expect(fs.existsSync(path.join(targetDir, 'magnus-ci.json'))).toBe(true);
  271 |       expect(fs.existsSync(path.join(targetDir, 'test.js'))).toBe(true);
  272 |     });
  273 | 
  274 |     test('4.2 Verify magnus-ci.json DAG stage definitions', async () => {
  275 |       const fs = require('fs');
  276 |       const path = require('path');
  277 |       const targetDir = '/Users/amankashyap/Documents/tes';
  278 | 
  279 |       const configData = JSON.parse(fs.readFileSync(path.join(targetDir, 'magnus-ci.json'), 'utf8'));
  280 |       expect(configData).toHaveProperty('stages');
  281 |       expect(configData.stages).toHaveProperty('setup');
  282 |       expect(configData.stages).toHaveProperty('test');
  283 |       expect(configData.stages.test.needs).toContain('setup');
  284 |     });
  285 | 
  286 |     test('4.3 Execute local Node unit test suite cleanly', async () => {
  287 |       const { execSync } = require('child_process');
  288 |       const targetDir = '/Users/amankashyap/Documents/tes';
  289 | 
  290 |       const result = execSync('npm test', { cwd: targetDir, encoding: 'utf8' });
> 291 |       expect(result).toContain('All unit tests passed');
      |                      ^ Error: expect(received).toContain(expected) // indexOf
  292 |     });
  293 | 
  294 |   });
  295 | 
  296 |   //----------------------------------------------------------------------------
  297 |   // SECTION 5: LIVE WEBHOOK INGESTION & SECURITY CIRCUIT BREAKERS
  298 |   //----------------------------------------------------------------------------
  299 |   test.describe('5. Live Webhook Ingestion & Security Circuit Breakers', () => {
  300 | 
  301 |     test('5.1 Valid Push Event with HMAC Signature is Accepted or Authenticated', async ({ request }) => {
  302 |       const crypto = require('crypto');
  303 |       const payload = JSON.stringify({
  304 |         ref: 'refs/heads/main',
  305 |         repository: { name: 'tes', full_name: 'amankashyapp07/tes', clone_url: 'https://github.com/amankashyapp07/tes.git' },
  306 |         head_commit: { id: '68a90cf123456789', message: 'test commit', author: { name: 'Aman Kashyap' } }
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
```