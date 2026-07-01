# MagnusCI: Core Execution & Data Ingestion Pipeline (`index.js`, `db.js`, `queue.js`, `worker.js`, `workspace.js`)

This document outlines the architectural responsibilities, patterns, and design details of the core files responsible for bootstrapping, database communication, queuing, and executing container jobs.

---

## 1. `index.js` — The API Gateway & Webhook Bootstrapper
**Primary Job:** To initialize the Express HTTP server, set up WebSockets (or SSE) for real-time telemetry streaming, and mount endpoint routes.

* **The Cryptographic Hack (`rawBody`):**
  GitHub webhook signatures are SHA-256 HMAC values computed over the raw request payload. In standard Express apps, body-parser middleware immediately parses incoming payloads to JSON objects, which strips whitespace and breaks signature validation.
  * **Solution:** `index.js` configures the JSON parser middleware to store the unparsed, raw buffer stream inside `req.rawBody`:
    ```javascript
    app.use(express.json({
      verify: (req, res, buf) => { req.rawBody = buf; }
    }));
    ```
    This ensures that signature validation remains 100% cryptographically accurate.
    
* **Stateless Gateway Design:**
  `index.js` performs no computational database processing or file I/O operations. It accepts requests, checks authorization, enqueues work, and returns status codes immediately. This design allows you to run multiple instances of `index.js` behind a load balancer without data sync issues.

---

## 2. `db.js` — PostgreSQL Database Client Pool
**Primary Job:** To export a singleton PostgreSQL database connection pool.

* **Connection Pool vs. Single Connection:**
  Creating a new database connection TCP handshake for every single query incurs massive latency penalties.
  * **Solution:** `db.js` instantiates a `pg.Pool` containing a fixed pool of persistent TCP connections:
    ```javascript
    const { Pool } = require('pg');
    const pool = new Pool({ ... });
    ```
    When a file executes a query, it grabs a client from the pool, runs the query, and instantly returns the client back to the pool, maintaining high-throughput database communication with minimal overhead.

---

## 3. `queue.js` — Redis Broker Client (BullMQ)
**Primary Job:** To export a singleton instance of the BullMQ message queue.

* **The Decoupling Layer:**
  If a worker fails or is restarted, webhooks pushed from GitHub should not be lost. `queue.js` instantiates a BullMQ `Queue` pointing to the local Redis instance:
  ```javascript
  const { Queue } = require('bullmq');
  const buildQueue = new Queue('build-queue', { connection: redisConfig });
  ```
* **Why Redis?**
  Redis stores the queue inside memory, allowing sub-millisecond job enqueue rates. BullMQ handles atomic state locking (ensuring two workers never pick up the exact same commit).

---

## 4. `worker.js` — The Engine's Orchestrator Daemon
**Primary Job:** The heart of the CI/CD engine. A persistent background process that runs on the build server, listens to the Redis queue, and manages compilation, testing, and telemetry.

* **What it implements (The Grand Lifecycle):**
  1. **Job Consumption:** Instantiates a BullMQ `Worker` loop that continuously polls Redis.
  2. **Workspace Isolation:** Spawns a temporary host folder using `workspace.js`.
  3. **VCS Isolation:** Executes Git Clone and Git Checkout via `simple-git` to target the exact commit hash.
  4. **Dependency Resolution:** Calls `cache.js` to restore cache (tarball zip) or triggers setup.
  5. **Orchestration:** Executes the parallel DAG defined in `dag.js`.
  6. **Sandbox Execution:** Interfaces with the Docker API via `dockerode` to spawn containers, capturing logs and telemetry in real-time.
  7. **Auto-Revert Circuit Breaker:** If a build fails (`exit 1`), it pushes a local revert commit to GitHub.
  8. **Workspace Pruning:** Completely deletes files inside `temp_builds/{buildId}/` to prevent security leaks.

---

## 5. `workspace.js` — Ephemeral Workspace Lifecycle Manager
**Primary Job:** To create and delete temporary files on the build runner host.

* **Stateless Sandboxing:**
  It exports two main functions:
  * `createWorkspace(buildId)`: Generates an absolute path under `temp_builds/{buildId}/` and creates the directory.
  * `pruneWorkspace(workspacePath)`: Safely and recursively removes the build directory after execution completes.
* **Failure Safety:**
  `worker.js` wraps the entire execution block inside a `try {} finally {}` statement. Even if a Docker container crashes, the node process runs out of memory, or a database query fails, the `finally` block guarantees that `pruneWorkspace` is fired, preventing host storage exhaustion.
