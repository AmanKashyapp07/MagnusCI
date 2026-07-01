# MagnusCI: Core Utility Architecture (`dag.js`, `cache.js`, `githubStatus.js`)

This document provides a deep dive into the inner workings of the three primary helper files in the `backend/src/utils/` directory. Be prepared to explain these files to show a strong grasp of data structures, cryptography, and integration APIs.

---

## 1. `dag.js` — The Pipeline Graph Orchestrator
**Primary Job:** To parse pipeline stage definitions, validate dependencies, detect circular loops, and execute independent tasks concurrently.

* **Presets & Custom Configurations (`loadPipelineStages`):**
  If a developer defines a custom `magnus-ci.json` file, this utility reads and parses the JSON map. If no config file is found, it automatically falls back to our bulletproof language presets (e.g. installing dependencies, running Jest tests with `--passWithNoTests`, and optionally executing build scripts).
  
* **Cycle Detection using Depth-First Search (`hasCycle`):**
  Before starting container execution, `dag.js` validates the dependencies list (the `needs` properties) as a directed graph. It uses a **Depth-First Search (DFS)** cycle detection algorithm. If it identifies a circular dependency loop (e.g., Stage A depends on Stage B, and Stage B depends on Stage A), the build aborts immediately. This prevents memory leaks and lockups.
  
* **Parallel Asynchronous Execution (`executeDAG`):**
  It manages each stage's status state (`PENDING`, `RUNNING`, `SUCCESS`, `FAILED`). It polls dependencies and executes ready stages concurrently using Node.js event-loop asynchronous execution (`Promise.race`), scaling execution across multiple Docker containers in parallel.

---

## 2. `cache.js` — The Smart Pantry (Dependency Caching)
**Primary Job:** To bypass internet dependency downloads (like `npm install` or `pip install`) by restoring and saving localized build environments.

* **Cryptographic Lockfile Hashing (`calculateFileHash`):**
  It checks the repository workspace for lockfiles (`package-lock.json`, `go.sum`, `requirements.txt`). It performs a **SHA-256 cryptographic hash** of the lockfile contents. Since a lockfile's content only changes when dependencies are modified, this hash serves as a unique fingerprint of the exact dependencies required.
  
* **Fast Tarball Restoration (`restoreCache`):**
  It checks the local `caches/tarballs/` directory for an archived file named `[repository_id]-[language]-[hash].tar.gz`. If found (a cache hit), it executes a native extraction command (`tar -xzf`) to unpack `node_modules` directly into the workspace in milliseconds, skipping the download step.
  
* **Archiving for Future Runs (`saveCache`):**
  If a pipeline completes successfully and there was a cache miss, the utility runs a native tar compression command (`tar -czf`) on the target folder and archives it locally. Future builds on the same dependency footprint will hit the cache.

---

## 3. `githubStatus.js` — The GitHub API Gateway
**Primary Job:** To interface with the GitHub REST API and post status badges (ticks and crosses) directly to the target commit.

* **Commit Status API Integration:**
  It exports the `updateGitHubStatus` helper function. During pipeline lifecycles, it sends secure HTTP POST requests to GitHub's status updates endpoint (`https://api.github.com/repos/{owner}/{repo}/statuses/{sha}`).
  
* **Dynamic Feedback Payload:**
  It sets:
  * `state`: mapped to `pending`, `success`, `failure`, or `error`.
  * `context`: labeled as `Magnus CI / Pipeline Status`.
  * `description`: customized output summary (e.g. `Node.js: 6 passed, 6 total`).
  * `target_url`: a redirect URL directing the developer directly from GitHub back to the exact build modal on your React dashboard.
