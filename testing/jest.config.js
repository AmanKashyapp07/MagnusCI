const path = require('path');

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
  moduleDirectories: ['node_modules', path.resolve(__dirname, '../backend/node_modules')],
  modulePaths: [path.resolve(__dirname, '../backend/node_modules')]
};
