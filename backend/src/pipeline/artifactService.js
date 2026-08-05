/**
 * MagnusCI Production Artifact Harvesting Service
 * 
 * Scans build workspaces to harvest test coverage reports (Jest/lcov, Python htmlcov)
 * and compiled application binaries (.jar, .war, .zip, executables).
 */

const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

/**
 * Scans a completed build workspace and copies generated artifacts to static public storage.
 * 
 * @param {string} workspacePath - Path to build workspace directory
 * @param {number|string} buildId - Build ID
 * @returns {Promise<Array<{ name: string, path: string, type: string }>>} Array of artifact metadata
 */
async function harvestArtifacts(workspacePath, buildId) {
  const artifacts = [];
  const publicArtifactsDir = path.join(__dirname, '../../public/artifacts', String(buildId));
  await fs.mkdir(publicArtifactsDir, { recursive: true });

  const fileExists = async (p) => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  };

  // 1. Jest Lcov Coverage Report
  const jestCoveragePath = path.join(workspacePath, 'coverage/lcov-report');
  if (await fileExists(jestCoveragePath)) {
    const dest = path.join(publicArtifactsDir, 'coverage');
    await fs.mkdir(dest, { recursive: true });
    await fs.cp(jestCoveragePath, dest, { recursive: true });
    artifacts.push({
      name: 'Jest Test Coverage Report',
      path: `/artifacts/${buildId}/coverage/index.html`,
      type: 'html'
    });
  }

  // 2. Python Htmlcov Coverage Report
  const pyCoveragePath = path.join(workspacePath, 'htmlcov');
  if (await fileExists(pyCoveragePath)) {
    const dest = path.join(publicArtifactsDir, 'htmlcov');
    await fs.mkdir(dest, { recursive: true });
    await fs.cp(pyCoveragePath, dest, { recursive: true });
    artifacts.push({
      name: 'Python Test Coverage Report',
      path: `/artifacts/${buildId}/htmlcov/index.html`,
      type: 'html'
    });
  }

  // 3. Compiled Executables & Binaries Scanning
  const scanDirs = [
    path.join(workspacePath, 'target'),
    path.join(workspacePath, 'build/libs'),
    workspacePath
  ];

  for (const dir of scanDirs) {
    if (await fileExists(dir)) {
      try {
        const files = await fs.readdir(dir, { withFileTypes: true });
        for (const file of files) {
          if (file.isFile()) {
            const ext = path.extname(file.name).toLowerCase();
            const srcFile = path.join(dir, file.name);

            let isExecutable = false;
            try {
              const stats = await fs.stat(srcFile);
              isExecutable = !!(stats.mode & 0o111);
            } catch {
              // Ignore stat errors
            }

            const isSourceOrConfig = ['.cpp', '.c', '.h', '.hpp', '.o', '.js', '.json', '.md', '.txt', '.yml', '.yaml', '.sh'].includes(ext);

            const isAllowedArtifact = 
              ['.jar', '.war', '.zip', '.exe', '.msi', '.out', '.bin'].includes(ext) ||
              file.name.endsWith('.tar.gz') ||
              file.name.endsWith('.tgz') ||
              (ext === '' && isExecutable && !file.name.startsWith('.') && !isSourceOrConfig);

            if (isAllowedArtifact) {
              const destFileDir = path.join(publicArtifactsDir, 'bin');
              await fs.mkdir(destFileDir, { recursive: true });
              const destFile = path.join(destFileDir, file.name);
              await fs.copyFile(srcFile, destFile);
              artifacts.push({
                name: `Built Binary (${file.name})`,
                path: `/artifacts/${buildId}/bin/${file.name}`,
                type: 'file'
              });
            }
          }
        }
      } catch (err) {
        logger.error(`Error scanning directory ${dir} for artifacts:`, err.message);
      }
    }
  }

  return artifacts;
}

module.exports = {
  harvestArtifacts
};
