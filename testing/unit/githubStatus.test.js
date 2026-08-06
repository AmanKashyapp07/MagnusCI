const { updateGitHubStatus } = require('../../backend/src/utils/githubStatus');
const db = require('../../backend/src/db');
const config = require('../../backend/src/config/env');

jest.mock('../../backend/src/db', () => ({
  query: jest.fn()
}));

global.fetch = jest.fn();

describe('Unit Tests: GitHub Commit Status Updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should match repository case-insensitively using ILIKE and post status', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ access_token: 'gho_mock_token_123' }]
    });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    });

    await updateGitHubStatus('AmanKashyapp07', 'tes2', '8783e41', 'success', 'All tests passed', 'http://localhost/dashboard');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ILIKE'),
      ['%AmanKashyapp07/tes2%']
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/AmanKashyapp07/tes2/statuses/8783e41',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer gho_mock_token_123'
        }),
        body: JSON.stringify({
          state: 'success',
          description: 'All tests passed',
          context: 'Magnus CI / Pipeline Status',
          target_url: 'http://localhost/dashboard'
        })
      })
    );
  });

  test('should fallback to any user token in database if repository user match is null', async () => {
    // Direct repo query returns empty
    db.query.mockResolvedValueOnce({ rows: [] });
    // Fallback user query returns a token
    db.query.mockResolvedValueOnce({ rows: [{ access_token: 'gho_fallback_token_456' }] });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    });

    await updateGitHubStatus('AmanKashyapp07', 'tes2', '8783e41', 'pending', 'Pipeline starting...', 'http://localhost/dashboard');

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/AmanKashyapp07/tes2/statuses/8783e41',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer gho_fallback_token_456'
        })
      })
    );
  });
});
