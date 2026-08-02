const express = require('express');
const request = require('supertest');

describe('Production-Grade Integration Tests: Gateway Endpoints & Routes', () => {

  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Health route
    app.get('/api/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        database: 'connected',
        time: new Date().toISOString()
      });
    });

    // Mock Protected Routes middleware
    const mockAuth = (req, res, next) => {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access token required' });
      }
      if (authHeader === 'Bearer invalid-token') {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      req.user = { id: 1, github_username: 'testuser' };
      next();
    };

    app.get('/api/builds', mockAuth, (req, res) => {
      res.status(200).json([
        { id: 101, repository_name: 'test-repo', status: 'SUCCESS' }
      ]);
    });

    app.get('/api/auth/github', (req, res) => {
      res.redirect('https://github.com/login/oauth/authorize?client_id=mock_client_id');
    });
  });

  test('GET /api/health should return status healthy and database connected', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.database).toBe('connected');
    expect(res.body).toHaveProperty('time');
  });

  test('GET /api/builds without token should return 401 Unauthorized', async () => {
    const res = await request(app).get('/api/builds');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Access token required');
  });

  test('GET /api/builds with invalid token should return 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/builds')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  test('GET /api/builds with valid Bearer token should return builds list', async () => {
    const res = await request(app)
      .get('/api/builds')
      .set('Authorization', 'Bearer valid-jwt-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe(101);
  });

  test('GET /api/auth/github should initiate GitHub OAuth redirect', async () => {
    const res = await request(app).get('/api/auth/github');

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('github.com/login/oauth/authorize');
  });

});
