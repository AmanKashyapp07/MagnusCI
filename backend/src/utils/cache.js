const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const CACHE_CONFIG = {
  'Node.js': {
    lockfiles: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
    folder: 'node_modules',
  },
  'Python': {
    lockfiles: ['requirements.txt', 'poetry.lock', 'Pipfile.lock'],
    folder: '.pip_cache',
  },
  'Go': {
    lockfiles: ['go.sum'],
    folder: '.go_cache',
  },
  'Java (Maven)': {
    lockfiles: ['pom.xml'],
    folder: '.m2_cache',
  },
  'Java (Gradle)': {
    lockfiles: ['build.gradle'],
    folder: '.gradle_cache',
  }
};

function getCacheConfig(language) {
  if (!language) return null;
  for (const key of Object.keys(CACHE_CONFIG)) {
    if (language === key || language.includes(key) || 
        (key.includes('Maven') && language.includes('Maven')) || 
        (key.includes('Gradle') && language.includes('Gradle'))) {
      return CACHE_CONFIG[key];
    }
  }
  return null;
}

async function calculateFileHash(filePath) {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (err) {
    return null;
  }
}

async function restoreCache(workspacePath, language, repoId) {
  const config = getCacheConfig(language);
  if (!config) {
    return { success: false, reason: 'unsupported_language', message: `Dependency caching is not supported for ${language}.` };
  }

  // 1. Find the lockfile
  let lockfileFound = null;
  let lockfileName = '';
  for (const file of config.lockfiles) {
    const fullPath = path.join(workspacePath, file);
    try {
      await fs.access(fullPath);
      lockfileFound = fullPath;
      lockfileName = file;
      break;
    } catch {}
  }

  if (!lockfileFound) {
    return { success: false, reason: 'lockfile_not_found', message: `No lockfiles (${config.lockfiles.join(', ')}) found. Skipping cache restore.` };
  }

  // 2. Hash lockfile
  const hash = await calculateFileHash(lockfileFound);
  if (!hash) {
    return { success: false, reason: 'hash_failed', message: `Failed to calculate hash of ${lockfileName}. Skipping cache restore.` };
  }

  // 3. Check if tarball exists
  const cachesDir = path.join(__dirname, '../../caches/tarballs');
  await fs.mkdir(cachesDir, { recursive: true });
  const cacheFileName = `${repoId}-${language.replace(/[^a-zA-Z0-9]/g, '_')}-${hash}.tar.gz`;
  const cacheFilePath = path.join(cachesDir, cacheFileName);

  try {
    await fs.access(cacheFilePath);
  } catch (err) {
    // Cache miss
    return { success: false, reason: 'cache_miss', hash, message: `Cache miss for ${lockfileName} (Hash: ${hash.slice(0, 12)}). Dependencies will download fresh.` };
  }

  // 4. Cache hit! Extract it
  try {
    // Run tar command
    await execPromise(`tar -xzf "${cacheFilePath}" -C "${workspacePath}"`);
    return { 
      success: true, 
      hash, 
      message: `Cache hit! Restored dependency folder '${config.folder}' from archive: ${cacheFileName} (Hash: ${hash.slice(0, 12)}).` 
    };
  } catch (err) {
    console.error(`[CACHE] Failed to extract cache: ${err.message}`);
    // If extraction failed, the archive might be corrupt. Delete it so next run pulls fresh.
    try {
      await fs.unlink(cacheFilePath);
    } catch {}
    return { success: false, reason: 'extract_failed', hash, message: `Failed to restore cache: archive corrupt. Cleaned up cache file.` };
  }
}

async function saveCache(workspacePath, language, repoId, hash) {
  const config = getCacheConfig(language);
  if (!config || !hash) {
    return { success: false, reason: 'invalid_context', message: 'Skipping cache save: invalid context or hash.' };
  }

  const folderPath = path.join(workspacePath, config.folder);
  try {
    await fs.access(folderPath);
  } catch (err) {
    return { success: false, reason: 'folder_not_found', message: `Dependency folder '${config.folder}' not found. Skipping cache save.` };
  }

  const cachesDir = path.join(__dirname, '../../caches/tarballs');
  await fs.mkdir(cachesDir, { recursive: true });
  const cacheFileName = `${repoId}-${language.replace(/[^a-zA-Z0-9]/g, '_')}-${hash}.tar.gz`;
  const cacheFilePath = path.join(cachesDir, cacheFileName);

  try {
    // tar -czf [cacheFilePath] -C [workspacePath] [folderName]
    await execPromise(`tar -czf "${cacheFilePath}" -C "${workspacePath}" "${config.folder}"`);
    return { success: true, message: `Cache saved successfully for ${language} dependency folder '${config.folder}' (Hash: ${hash.slice(0, 12)}).` };
  } catch (err) {
    console.error(`[CACHE] Failed to create cache tarball: ${err.message}`);
    return { success: false, reason: 'compress_failed', message: `Failed to compress cache: ${err.message}` };
  }
}

module.exports = {
  restoreCache,
  saveCache,
  getCacheConfig
};
