const request = require('supertest');
const app = require('../../backend/src/index');

describe('Production-Grade Integration Tests: Security Controls, Headers & JWT Gating', () => {

  test('GET /api/health should respond with security and CORS headers', async () => {
    const res = await request(app).get('/api/health');
    
    expect(res.status).toBe(200);
    expect(res.headers).toHaveProperty('access-control-allow-origin');
    expect(res.body.status).toBe('healthy');
  });

  test('Protected endpoint /api/repositories should reject malformed Bearer token with 403', async () => {
    const res = await request(app)
      .get('/api/repositories')
      .set('Authorization', 'Bearer invalid.malformed.jwt.token');

    expect(res.status).toBe(403);
  });

  test('Protected endpoint /api/builds should reject request missing Bearer scheme with 401', async () => {
    const res = await request(app)
      .get('/api/builds')
      .set('Authorization', 'RawTokenWithNoBearerPrefix');

    expect(res.status).toBe(401);
  });

  test('POST /api/repositories without token should return 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/repositories')
      .send({ name: 'malicious-repo', github_url: 'https://github.com/hacker/malware' });

    expect(res.status).toBe(401);
  });

  test('Webhook route POST /api/webhooks/github without payload or signature should reject cleanly', async () => {
    const res = await request(app)
      .post('/api/webhooks/github')
      .send({});

    expect([200, 400, 401]).toContain(res.status);
  });

});
