module.exports = {
  testEnvironment: 'node',
  verbose: true,
  testMatch: [
    '**/unit/**/*.test.js',
    '**/integration/**/*.test.js',
    '**/e2e/**/*.test.js'
  ],
  collectCoverageFrom: [
    '../backend/src/**/*.js',
    '!../backend/src/node_modules/**'
  ],
  coverageReporters: ['text', 'lcov'],
  moduleDirectories: ['node_modules', '../backend/node_modules', '../frontend/node_modules']
};
