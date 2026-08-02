const axios = require('axios');

describe('Production-Grade E2E Tests: Live Deployed Deployment (http://magnus-ci.online)', () => {

  const TARGET_URL = process.env.DEPLOYED_URL || 'http://magnus-ci.online';

  test('1. Health Endpoint Verification: /api/health should respond with healthy status & DB connected', async () => {
    const startTime = Date.now();
    const response = await axios.get(`${TARGET_URL}/api/health`, { timeout: 10000 });
    const duration = Date.now() - startTime;

    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(response.data.status).toBe('healthy');
    expect(response.data.database).toBe('connected');
    expect(duration).toBeLessThan(3000);
  });

  test('2. Frontend Static Delivery: / should serve React SPA HTML', async () => {
    const response = await axios.get(`${TARGET_URL}/`, { timeout: 10000 });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.data).toContain('<div id="root"></div>');
    expect(response.data).toContain('script type="module"');
  });

  test('3. OAuth Handshake Entrypoint: /api/auth/github should initiate redirect to GitHub', async () => {
    try {
      const response = await axios.get(`${TARGET_URL}/api/auth/github`, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      });
      expect([301, 302, 307, 308]).toContain(response.status);
      expect(response.headers.location).toContain('github.com');
    } catch (err) {
      if (err.response && [301, 302, 307, 308].includes(err.response.status)) {
        expect(err.response.headers.location).toContain('github.com');
      } else {
        throw err;
      }
    }
  });

  test('4. Security & CORS Headers Check', async () => {
    const response = await axios.get(`${TARGET_URL}/api/health`, { timeout: 10000 });
    expect(response.headers['access-control-allow-origin']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeDefined();
  });

});
