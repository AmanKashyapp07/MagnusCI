const userRepository = require('../../backend/src/repositories/userRepository');
const buildRepository = require('../../backend/src/repositories/buildRepository');
const repositoryRepository = require('../../backend/src/repositories/repositoryRepository');
const db = require('../../backend/src/db');

jest.mock('../../backend/src/db', () => ({
  query: jest.fn()
}));

describe('Production-Grade Unit Tests: Repository Data Access Layer', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. UserRepository', () => {

    test('findByGithubId should execute parameterized SQL query', async () => {
      const mockUser = { id: 1 };
      db.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await userRepository.findByGithubId('12345');

      expect(db.query).toHaveBeenCalledWith(
        'SELECT id FROM users WHERE github_id = $1',
        ['12345']
      );
      expect(result).toEqual(mockUser);
    });

    test('findByGithubId should return null when user does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const result = await userRepository.findByGithubId('99999');

      expect(result).toBeNull();
    });

    test('findById should return user by primary key', async () => {
      const mockUser = { id: 42, username: 'testuser', avatar_url: 'https://avatar.url', access_token: 'tok' };
      db.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await userRepository.findById(42);

      expect(db.query).toHaveBeenCalledWith(
        'SELECT id, username, avatar_url, access_token FROM users WHERE id = $1',
        [42]
      );
      expect(result).toEqual(mockUser);
    });

    test('createUser should insert new user securely and return id', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 10 }] });

      const newId = await userRepository.createUser('gh123', 'Aman', 'https://avatar.url', 'token123');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        ['gh123', 'Aman', 'https://avatar.url', 'token123']
      );
      expect(newId).toBe(10);
    });

    test('updateUser should execute UPDATE SQL query', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await userRepository.updateUser(10, 'AmanNew', 'https://avatar2.url', 'token456');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        ['AmanNew', 'https://avatar2.url', 'token456', 10]
      );
    });

  });

  describe('2. BuildRepository', () => {

    test('findByUserId should query builds joined with repositories', async () => {
      const mockBuilds = [
        { id: 101, repository_name: 'tes', commit_hash: 'abc1234', status: 'SUCCESS' }
      ];
      db.query.mockResolvedValueOnce({ rows: mockBuilds });

      const result = await buildRepository.findByUserId(1);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN repositories'),
        [1]
      );
      expect(result).toEqual(mockBuilds);
    });

    test('updateStatus should update status and completion timestamp', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await buildRepository.updateStatus(101, 'SUCCESS');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE builds SET status = $1'),
        ['SUCCESS', 101]
      );
    });

    test('findLogsByBuildId should return log message string', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ log_message: 'Build successful' }] });

      const logs = await buildRepository.findLogsByBuildId(101);

      expect(db.query).toHaveBeenCalledWith(
        'SELECT log_message FROM build_logs WHERE build_id = $1',
        [101]
      );
      expect(logs).toBe('Build successful');
    });

  });

  describe('3. RepositoryRepository', () => {

    test('create should bind repository to user', async () => {
      const mockRepo = { id: 5, user_id: 1, name: 'tes', github_url: 'https://github.com/a/b' };
      db.query.mockResolvedValueOnce({ rows: [mockRepo] });

      const result = await repositoryRepository.create('tes', 'https://github.com/a/b', 1);

      expect(db.query).toHaveBeenCalledWith(
        'INSERT INTO repositories (name, github_url, user_id) VALUES ($1, $2, $3) RETURNING *',
        ['tes', 'https://github.com/a/b', 1]
      );
      expect(result).toEqual(mockRepo);
    });

    test('findByUserId should fetch all workspaces owned by user', async () => {
      const mockRepos = [{ id: 1, name: 'tes' }, { id: 2, name: 'Alpha' }];
      db.query.mockResolvedValueOnce({ rows: mockRepos });

      const result = await repositoryRepository.findByUserId(1);

      expect(db.query).toHaveBeenCalledWith(
        'SELECT * FROM repositories WHERE user_id = $1 ORDER BY created_at DESC',
        [1]
      );
      expect(result).toEqual(mockRepos);
    });

  });

});
