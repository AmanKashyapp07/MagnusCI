const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '/tmp/magnus-playwright-results',
  use: {
    baseURL: process.env.TEST_TARGET_URL || 'http://129.154.39.198',
    extraHTTPHeaders: {
      'Host': 'magnus-ci.online'
    },
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
