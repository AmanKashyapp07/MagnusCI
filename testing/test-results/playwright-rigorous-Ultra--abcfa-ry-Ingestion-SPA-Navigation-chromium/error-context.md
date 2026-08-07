# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: playwright-rigorous.spec.js >> Ultra-Rigorous E2E Suite: Production End-to-End System Verification >> 2. API Contracts, Security Headers & Isolation >> 2.5 OAuth URL Token Query Ingestion & SPA Navigation
- Location: e2e/playwright-rigorous.spec.js:90:5

# Error details

```
Error: page.goto: net::ERR_INVALID_ARGUMENT at http://129.154.39.198/ci/?token=header.samplepayload.signature
Call log:
  - navigating to "http://129.154.39.198/ci/?token=header.samplepayload.signature", waiting until "load"

```

# Test source

```ts
  18  |       // Verify Header & System Badge
  19  |       await expect(page.getByText('MagnusCI').first()).toBeVisible();
  20  |       await expect(page.getByText('SYSTEM OPERATIONAL')).toBeVisible();
  21  | 
  22  |       // Verify Main Heading & Subtitle Text
  23  |       await expect(page.getByRole('heading', { name: /Build smarter,\s+ship with precision/i })).toBeVisible();
  24  |       
  25  |       // Verify GitHub OAuth Login Button
  26  |       const connectBtn = page.getByRole('button', { name: /Connect with GitHub/i });
  27  |       await expect(connectBtn).toBeVisible();
  28  | 
  29  |       // Verify Core Value Proposition Cards (Cryptographic, DAG, Serverless)
  30  |       await expect(page.getByRole('heading', { name: /Cryptographic Validation/i })).toBeVisible();
  31  |       await expect(page.getByRole('heading', { name: /Topological DAG Engine/i })).toBeVisible();
  32  |       await expect(page.getByRole('heading', { name: /Serverless Runners/i })).toBeVisible();
  33  |     });
  34  | 
  35  |     test('1.2 Mobile Viewport Layout & Responsiveness Check (375x667)', async ({ page }) => {
  36  |       await page.setViewportSize({ width: 375, height: 667 });
  37  |       await page.goto(`${LIVE_URL}/login`);
  38  | 
  39  |       const connectBtn = page.getByRole('button', { name: /Connect with GitHub/i });
  40  |       await expect(connectBtn).toBeVisible();
  41  |       
  42  |       const boundingBox = await connectBtn.boundingBox();
  43  |       expect(boundingBox).not.toBeNull();
  44  |       expect(boundingBox.width).toBeLessThanOrEqual(375);
  45  |     });
  46  | 
  47  |   });
  48  | 
  49  |   //----------------------------------------------------------------------------
  50  |   // SECTION 2: API CONTRACTS, SECURITY HEADERS & ISOLATION
  51  |   //----------------------------------------------------------------------------
  52  |   test.describe('2. API Contracts, Security Headers & Isolation', () => {
  53  | 
  54  |     test('2.1 Health Check API (/api/health) returns 200 OK & database connected status', async ({ request }) => {
  55  |       const response = await request.get(`${LIVE_URL}/api/health`);
  56  |       expect(response.status()).toBe(200);
  57  | 
  58  |       const body = await response.json();
  59  |       expect(body).toHaveProperty('status', 'healthy');
  60  |       expect(body).toHaveProperty('database', 'connected');
  61  |       expect(body).toHaveProperty('time');
  62  |     });
  63  | 
  64  |     test('2.2 GitHub OAuth Entrypoint (/api/auth/github) initiates secure redirect', async ({ request }) => {
  65  |       const response = await request.get(`${LIVE_URL}/api/auth/github`, { maxRedirects: 0 });
  66  |       expect(response.status()).toBe(302);
  67  |       
  68  |       const location = response.headers()['location'];
  69  |       expect(location).toContain('github.com/login/oauth/authorize');
  70  |       expect(location).toContain('client_id=');
  71  |       expect(location).toContain('scope=repo');
  72  |     });
  73  | 
  74  |     test('2.3 Protected Endpoint Gating returns 401 for unauthenticated requests', async ({ request }) => {
  75  |       const reposRes = await request.get(`${LIVE_URL}/api/repositories`);
  76  |       expect(reposRes.status()).toBe(401);
  77  | 
  78  |       const buildsRes = await request.get(`${LIVE_URL}/api/builds`);
  79  |       expect(buildsRes.status()).toBe(401);
  80  | 
  81  |       const meRes = await request.get(`${LIVE_URL}/api/auth/me`);
  82  |       expect(meRes.status()).toBe(401);
  83  |     });
  84  | 
  85  |     test('2.4 Wildcard Routing Fallback handles unknown paths gracefully', async ({ request }) => {
  86  |       const response = await request.get(`${LIVE_URL}/api/non-existent-route-999`);
  87  |       expect([200, 404]).toContain(response.status());
  88  |     });
  89  | 
  90  |     test('2.5 OAuth URL Token Query Ingestion & SPA Navigation', async ({ page }) => {
  91  |       const sampleToken = 'header.samplepayload.signature';
  92  | 
  93  |       await page.route('**/api/auth/me', async (route) => {
  94  |         await route.fulfill({
  95  |           status: 200,
  96  |           contentType: 'application/json',
  97  |           body: JSON.stringify({ id: 1, username: 'OAuthUser', avatar_url: 'https://avatars.githubusercontent.com/u/99' })
  98  |         });
  99  |       });
  100 | 
  101 |       await page.route('**/api/repositories', async (route) => {
  102 |         await route.fulfill({
  103 |           status: 200,
  104 |           contentType: 'application/json',
  105 |           body: JSON.stringify([])
  106 |         });
  107 |       });
  108 | 
  109 |       await page.route('**/api/builds**', async (route) => {
  110 |         await route.fulfill({
  111 |           status: 200,
  112 |           contentType: 'application/json',
  113 |           body: JSON.stringify([])
  114 |         });
  115 |       });
  116 | 
  117 |       // Simulate GitHub callback redirect with ?token=...
> 118 |       await page.goto(`${LIVE_URL}/?token=${sampleToken}`);
      |                  ^ Error: page.goto: net::ERR_INVALID_ARGUMENT at http://129.154.39.198/ci/?token=header.samplepayload.signature
  119 | 
  120 |       // Verify token was stored in localStorage
  121 |       const storedToken = await page.evaluate(() => localStorage.getItem('magnus_ci_token') || localStorage.getItem('token'));
  122 |       expect(storedToken).toBe(sampleToken);
  123 | 
  124 |       // Verify user lands on /dashboard
  125 |       await expect(page).toHaveURL(/.*\/dashboard/);
  126 |     });
  127 | 
  128 |   });
  129 | 
  130 |   //----------------------------------------------------------------------------
  131 |   // SECTION 3: AUTHENTICATED DASHBOARD WORKSPACE UI FLOW & MODALS
  132 |   //----------------------------------------------------------------------------
  133 |   test.describe('3. Authenticated Dashboard Workspace UI Flow', () => {
  134 | 
  135 |     test('3.1 Authenticated Dashboard Renders Workspace Components & Metrics', async ({ page }) => {
  136 |       const mockToken = 'header.payload.signature';
  137 |       await page.addInitScript((t) => {
  138 |         localStorage.setItem('token', t);
  139 |       }, mockToken);
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
```