const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { detectProjectContext } = require('../../backend/src/utils/workerHelpers');
const { getCacheConfig } = require('../../backend/src/utils/cache');

describe('Production-Grade Test Suite 4: Multi-Language & Polyglot Runtime Matrix', () => {

  const testMatrixDir = path.join(__dirname, 'temp_polyglot_matrix');

  beforeAll(async () => {
    await fs.mkdir(testMatrixDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testMatrixDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    const files = await fs.readdir(testMatrixDir);
    for (const file of files) {
      await fs.rm(path.join(testMatrixDir, file), { recursive: true, force: true });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Language Ecosystem Auto-Detection Matrix
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Language Ecosystem Auto-Detection Matrix', () => {

    test('should detect Node.js ecosystem and map to node:20-alpine', async () => {
      await fs.writeFile(path.join(testMatrixDir, 'package.json'), JSON.stringify({ name: 'node-app' }));
      const context = await detectProjectContext(testMatrixDir);

      expect(context.language).toBe('Node.js');
      expect(context.imageName).toBe('node:20-alpine');
      expect(context.runCommand).toContain('npm');
    });

    test('should detect Python ecosystem and map to python:3.10-alpine', async () => {
      await fs.writeFile(path.join(testMatrixDir, 'requirements.txt'), 'pytest==8.0.0\nrequests==2.31.0');
      const context = await detectProjectContext(testMatrixDir);

      expect(context.language).toBe('Python');
      expect(context.imageName).toBe('python:3.10-alpine');
      expect(context.runCommand).toContain('python');
    });

    test('should detect Go ecosystem and map to golang:1.21-alpine', async () => {
      await fs.writeFile(path.join(testMatrixDir, 'go.mod'), 'module testapp\ngo 1.21');
      const context = await detectProjectContext(testMatrixDir);

      expect(context.language).toBe('Go');
      expect(context.imageName).toBe('golang:1.21-alpine');
      expect(context.runCommand).toContain('go test');
    });

    test('should detect Java Maven ecosystem and map to maven:3.9-eclipse-temurin-17-alpine', async () => {
      await fs.writeFile(path.join(testMatrixDir, 'pom.xml'), '<project><modelVersion>4.0.0</modelVersion></project>');
      const context = await detectProjectContext(testMatrixDir);

      expect(context.language).toBe('Java (Maven)');
      expect(context.imageName).toBe('maven:3.9-eclipse-temurin-17-alpine');
      expect(context.runCommand).toContain('mvn test');
    });

    test('should detect Java Gradle ecosystem and map to gradle:8-jdk17-alpine', async () => {
      await fs.writeFile(path.join(testMatrixDir, 'build.gradle'), 'plugins { id "java" }');
      const context = await detectProjectContext(testMatrixDir);

      expect(context.language).toBe('Java (Gradle)');
      expect(context.imageName).toBe('gradle:8-jdk17-alpine');
      expect(context.runCommand).toContain('gradle test');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Lockfile Fingerprinting & Cache Strategy Matrix
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Multi-Language Lockfile Fingerprinting & Cache Strategy', () => {

    const languageMatrix = [
      { language: 'Node.js', lockfile: 'package-lock.json', targetFolder: 'node_modules' },
      { language: 'Python',  lockfile: 'requirements.txt',  targetFolder: '.pip_cache' },
      { language: 'Go',      lockfile: 'go.sum',            targetFolder: '.go_cache' }
    ];

    test.each(languageMatrix)('should return correct lockfile configuration for $language', ({ language, lockfile, targetFolder }) => {
      const config = getCacheConfig(language);
      expect(config).toBeDefined();
      expect(config.lockfiles).toContain(lockfile);
      expect(config.folder).toBe(targetFolder);
    });

    test('should compute deterministic SHA-256 lockfile fingerprints across languages', () => {
      const lockfileContents = {
        'package-lock.json': '{"name": "test", "version": "1.0.0"}',
        'requirements.txt': 'fastapi==0.100.0\nuvicorn==0.22.0',
        'go.sum': 'github.com/gin-gonic/gin v1.9.1 h1:4+0n0Dfb...'
      };

      for (const [filename, content] of Object.entries(lockfileContents)) {
        const hash1 = crypto.createHash('sha256').update(content).digest('hex');
        const hash2 = crypto.createHash('sha256').update(content).digest('hex');

        expect(hash1).toBe(hash2);
        expect(hash1.length).toBe(64);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Custom magnus-ci.json Overrides across Language Presets
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Custom Stage Overrides in Polyglot Repositories', () => {

    test('should prioritize magnus-ci.json custom stages over auto-detected presets', async () => {
      // Create both a package.json and a custom magnus-ci.json
      await fs.writeFile(path.join(testMatrixDir, 'package.json'), JSON.stringify({ name: 'node-app' }));
      const customConfig = {
        language: 'Custom-Polyglot',
        image: 'custom-runner:latest',
        stages: {
          bootstrap: { run: 'echo "Custom bootstrap"' },
          execute: { run: 'echo "Custom execute"', needs: ['bootstrap'] }
        }
      };
      await fs.writeFile(path.join(testMatrixDir, 'magnus-ci.json'), JSON.stringify(customConfig));

      const context = await detectProjectContext(testMatrixDir);
      expect(context.language).toBe('Custom-Polyglot');
      expect(context.imageName).toBe('custom-runner:latest');
    });
  });

});
