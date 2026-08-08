const githubPrBot = require('../../backend/src/utils/githubPrBot');

describe('Production-Grade Test Suite: Automated GitHub Pull Request Bot', () => {

  const sampleBuildData = {
    buildId: 101,
    commitSha: 'a1b2c3d4e5f6',
    branch: 'feature/login-speedup',
    status: 'SUCCESS',
    durationSeconds: 14,
    stages: [
      { name: 'setup', command: 'npm ci', durationSeconds: 3, status: 'SUCCESS' },
      { name: 'lint', command: 'npm run lint', durationSeconds: 2, status: 'SUCCESS' },
      { name: 'test', command: 'npm test', durationSeconds: 5, status: 'SUCCESS' },
      { name: 'compile', command: 'npm run build', durationSeconds: 4, status: 'SUCCESS' }
    ],
    previewUrl: '/preview/101/',
    artifacts: [
      { name: 'bundle.tar.gz', url: 'http://129.154.39.198/ci/artifacts/bundle.tar.gz' }
    ]
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Markdown Comment Formatting Engine
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Rich Markdown Comment Generator', () => {

    test('should generate clean GitHub Markdown summary with status, commit, and duration', () => {
      const md = githubPrBot.formatCommentBody(sampleBuildData);

      expect(md).toContain('### ⚡ MagnusCI Pipeline Execution Report');
      expect(md).toContain('✅ **PASSED**');
      expect(md).toContain('`#101`');
      expect(md).toContain('`a1b2c3d`');
      expect(md).toContain('⏱️ **14s**');
    });

    test('should render DAG stage execution breakdown table', () => {
      const md = githubPrBot.formatCommentBody(sampleBuildData);

      expect(md).toContain('#### ⏱️ DAG Stage Execution Breakdown');
      expect(md).toContain('`setup`');
      expect(md).toContain('`npm ci`');
      expect(md).toContain('`compile`');
      expect(md).toContain('✅ SUCCESS');
    });

    test('should include live staging preview URL alert callout when previewUrl is present', () => {
      const md = githubPrBot.formatCommentBody(sampleBuildData);

      expect(md).toContain('> 🌐 **Live Staging Preview URL**');
      expect(md).toContain('http://129.154.39.198/preview/101/');
    });

    test('should render artifacts download links when artifacts are provided', () => {
      const md = githubPrBot.formatCommentBody(sampleBuildData);

      expect(md).toContain('#### 📊 Build Artifacts & Logs');
      expect(md).toContain('📦 [bundle.tar.gz]');
      expect(md).toContain('http://129.154.39.198/ci/artifacts/bundle.tar.gz');
    });

    test('should handle failed builds and empty artifact lists cleanly', () => {
      const failedData = {
        ...sampleBuildData,
        status: 'FAILED',
        previewUrl: null,
        artifacts: []
      };

      const md = githubPrBot.formatCommentBody(failedData);

      expect(md).toContain('❌ **FAILED**');
      expect(md).not.toContain('🌐 **Live Staging Preview URL**');
      expect(md).toContain('* **Artifacts**: None generated');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. GitHub API Comment Dispatch & Token Resolution
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. GitHub API Dispatch & Error Guardrails', () => {

    test('postPullRequestComment should return posted: false when owner, repo, or pullNumber is missing', async () => {
      const result = await githubPrBot.postPullRequestComment({
        owner: null,
        repo: 'ci-cd-engine',
        pullNumber: 12,
        buildData: sampleBuildData
      });

      expect(result.posted).toBe(false);
      expect(result.commentUrl).toBeNull();
    });

    test('postPullRequestComment should successfully dispatch comment payload via GitHub API', async () => {
      const originalFetch = global.fetch;

      // Mock successful GitHub API response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ html_url: 'https://github.com/org/repo/pull/12#issuecomment-12345' })
      });

      const result = await githubPrBot.postPullRequestComment({
        owner: 'AmanKashyapp07',
        repo: 'ci-cd-engine',
        pullNumber: 12,
        token: 'ghp_mock_token_12345',
        buildData: sampleBuildData
      });

      expect(result.posted).toBe(true);
      expect(result.commentUrl).toBe('https://github.com/org/repo/pull/12#issuecomment-12345');

      global.fetch = originalFetch;
    });
  });

});
