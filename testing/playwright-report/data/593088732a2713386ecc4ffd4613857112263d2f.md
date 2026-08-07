# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: playwright-rigorous.spec.js >> Ultra-Rigorous E2E Suite: Production End-to-End System Verification >> 3. Authenticated Dashboard Workspace UI Flow >> 3.2 Build Execution Modal Interaction (Open, Terminal, Logs)
- Location: e2e/playwright-rigorous.spec.js:195:5

# Error details

```
Error: page.goto: net::ERR_INVALID_ARGUMENT at http://129.154.39.198/ci/dashboard
Call log:
  - navigating to "http://129.154.39.198/ci/dashboard", waiting until "load"

```

# Test source

```ts
  140 | 
  141 |       await page.route('**/api/auth/me', async (route) => {
  142 |         await route.fulfill({
  143 |           status: 200,
  144 |           contentType: 'application/json',
  145 |           body: JSON.stringify({ id: 1, username: 'AmanKashyapp07', avatar_url: 'https://avatars.githubusercontent.com/u/12345' })
  146 |         });
  147 |       });
  148 | 
  149 |       await page.route('**/api/repositories', async (route) => {
  150 |         if (route.request().method() === 'GET') {
  151 |           await route.fulfill({
  152 |             status: 200,
  153 |             contentType: 'application/json',
  154 |             body: JSON.stringify([
  155 |               { id: 1, name: 'tes', github_url: 'https://github.com/amankashyapp07/tes', created_at: new Date().toISOString() },
  156 |               { id: 2, name: 'Alpha', github_url: 'https://github.com/amankashyapp07/github-test-ci', created_at: new Date().toISOString() }
  157 |             ])
  158 |           });
  159 |         } else {
  160 |           await route.continue();
  161 |         }
  162 |       });
  163 | 
  164 |       await page.route('**/api/builds**', async (route) => {
  165 |         await route.fulfill({
  166 |           status: 200,
  167 |           contentType: 'application/json',
  168 |           body: JSON.stringify([
  169 |             { id: 101, repository_id: 1, repository_name: 'tes', commit_hash: '68a90cf', status: 'SUCCESS', created_at: new Date().toISOString() }
  170 |           ])
  171 |         });
  172 |       });
  173 | 
  174 |       await page.goto(`${LIVE_URL}/dashboard`);
  175 | 
  176 |       // Verify User Avatar & Header Name
  177 |       await expect(page.locator('header').getByText('AmanKashyapp07')).toBeVisible();
  178 | 
  179 |       // Verify Metrics Row Cards
  180 |       await expect(page.getByText('Workspaces', { exact: true }).first()).toBeVisible();
  181 |       await expect(page.getByText('Total Executions', { exact: true }).first()).toBeVisible();
  182 |       await expect(page.getByText('Active Runners', { exact: true }).first()).toBeVisible();
  183 |       await expect(page.getByText('Success Rate', { exact: true }).first()).toBeVisible();
  184 | 
  185 |       // Verify Connect Repository Form Inputs
  186 |       await expect(page.getByPlaceholder('Magnus-core-api')).toBeVisible();
  187 |       await expect(page.getByPlaceholder('https://github.com/user/repo')).toBeVisible();
  188 |       await expect(page.getByRole('button', { name: /Connect Hook/i })).toBeVisible();
  189 | 
  190 |       // Verify Workspace List Items
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
> 240 |       await page.goto(`${LIVE_URL}/dashboard`);
      |                  ^ Error: page.goto: net::ERR_INVALID_ARGUMENT at http://129.154.39.198/ci/dashboard
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
  288 |       const targetDir = process.env.TES_DIR || '/Users/amankashyap/Documents/tes';
  289 | 
  290 |       const result = execSync('npm test', { cwd: targetDir, encoding: 'utf8' });
  291 |       expect(result).toMatch(/Test suite execution finished cleanly|All unit tests passed/);
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
```