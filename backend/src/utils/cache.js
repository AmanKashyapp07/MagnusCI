////////////////////////////////////////////////////////////////////////////////
// Dependency Caching & Compression Manager
//
// File Purpose:
// This module provides lockfile fingerprinting and cached package folder
// restoration/archiving to optimize build speeds by avoiding redundant
// network package downloads (e.g. npm ci / pip install).
//
// High-Level Architecture:
// 1. Lockfile Mapping: Matches detected language environments to specific
//    dependency lockfiles (e.g. package-lock.json, go.sum).
// 2. Cryptographic Fingerprinting: Hashes lockfile contents using SHA-256
//    to calculate a unique key for the dependency tree state.
// 3. Native Tar Extraction: Restores package folders from cached tarball archives
//    on the host using shell commands.
// 4. Native Tar Compression: Compresses package folders back into tarball archives
//    on successful builds for future reuse.
//
// Interview Topics:
// - Cryptographic hashing (Why SHA-256? Collision properties).
// - Performance trade-offs of native shell tools vs JavaScript libraries.
// - Concurrency and filesystem isolation to prevent cache corruption.
// - Corrupt-cache recovery strategies.
//
// Dependencies: crypto, fs, path, child_process
////////////////////////////////////////////////////////////////////////////////

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

//------------------------------------------------------------------------------
// Cache Configuration Schema
//
// Maps detected environments to their corresponding lockfiles and cached target folders.
//------------------------------------------------------------------------------
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

////////////////////////////////////////////////////////////////////////////////
// Function: getCacheConfig
// Purpose: Matches language strings to cache config mappings.
// Inputs: language (string)
// Outputs: Cache config object, or null
// Side Effects: None
// Time Complexity: O(K) where K is configurations size.
////////////////////////////////////////////////////////////////////////////////
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

////////////////////////////////////////////////////////////////////////////////
// Function: calculateFileHash
// Purpose: Computes a cryptographic SHA-256 fingerprint of a file.
// Inputs: filePath (string)
// Outputs: Hash string (hexadecimal), or null on failure
// Side Effects: Reads file.
// Time Complexity: O(N) where N is file size.
//
// Interview Q&A:
// Q: Why did you choose SHA-256?
// A: SHA-256 is a standard cryptographic hash function. It is deterministic,
//    meaning the same input always produces the exact same 256-bit output.
//    Its collision resistance guarantees that distinct lockfiles will not
//    produce the same hash, preventing the cache from returning incorrect packages.
////////////////////////////////////////////////////////////////////////////////
async function calculateFileHash(filePath) {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (err) {
    return null;
  }
}

////////////////////////////////////////////////////////////////////////////////
// Function: restoreCache
// Purpose: Checks for and extracts a cached dependency archive.
// Inputs: workspacePath (string), language (string), repoId (number)
// Outputs: Result object { success: boolean, hash: string, message: string }
// Side Effects: Resolves file access, runs shell extraction command.
// Time Complexity: O(N) where N is size of the tarball archive.
//
// Logic Details:
// 1. Locates the lockfile matching the language configuration.
// 2. Calculates its SHA-256 hash.
// 3. Checks if an archive named `{repoId}-{language}-{hash}.tar.gz` exists in
//    caches/tarballs/.
// 4. If it exists, extracts it directly into the workspace using a native `tar`
//    command execution:
//    `tar -xzf [cacheFilePath] -C [workspacePath]`
//
// Error Recovery:
// If extraction fails, the catch block deletes the corrupted tarball using
// `fs.unlink`, preventing it from corrupting future builds.
//
// Security & Concurrency Consideration:
// Q: Why include repoId in the cache filename?
// A: This prevents cross-tenant pollution. A developer on Repo A cannot access
//    or corrupt Repo B's cached dependencies.
// Q: How is concurrency handled if two builds of the same repo run?
// A: Each build runs in its own UUID-named directory. The tarball is extracted
//    into this isolated workspace, preventing concurrent file writes.
////////////////////////////////////////////////////////////////////////////////
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

////////////////////////////////////////////////////////////////////////////////
// Function: saveCache
// Purpose: Compresses a package directory into a tarball archive.
// Inputs: workspacePath (string), language (string), repoId (number), hash (string)
// Outputs: Result object { success: boolean, message: string }
// Side Effects: Creates tarball archive.
// Time Complexity: O(N) where N is size of the package directory.
//
// Logic Details:
// 1. Verifies the dependency directory exists in the workspace.
// 2. Compresses the directory into a tarball using the native `tar` utility:
//    `tar -czf [cacheFilePath] -C [workspacePath] [folderName]`
//
// Interview Discussion:
// Q: Why did you use child_process native command lines instead of JS libraries?
// A: Performance. Native Linux `tar` commands are compiled C binaries that run
//    much faster than JavaScript implementations. They also avoid memory limits
//    in the Node runtime.
////////////////////////////////////////////////////////////////////////////////
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

