const userRepository = require('../repositories/userRepository');

class UserService {
  async findOrCreateUserByGithubId(githubId, username, avatarUrl, accessToken = null) {
    const existingUser = await userRepository.findByGithubId(githubId);

    if (existingUser) {
      await userRepository.updateUser(existingUser.id, username, avatarUrl, accessToken);
      return existingUser.id;
    }

    return userRepository.createUser(githubId, username, avatarUrl, accessToken);
  }

  async getUserById(userId) {
    const user = await userRepository.findById(userId);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      avatar_url: user.avatar_url
    };
  }
}

module.exports = new UserService();
