# MagnusCI: Internal Technologies & Concepts — Deep Dive Reference

*A comprehensive reference document covering every technology, concept, and engineering decision used to build MagnusCI. Written for interview preparation — understand each section deeply enough to explain it out loud.*

---

## Table of Contents

1. [Node.js & Express — The Ingestion Gateway](#1-nodejs--express)
2. [HMAC SHA-256 — Cryptographic Webhook Security](#2-hmac-sha-256--cryptographic-security)
3. [PostgreSQL — Relational Data Model](#3-postgresql--relational-data-model)
4. [Redis & BullMQ — Distributed Job Queue](#4-redis--bullmq--distributed-job-queue)
5. [Docker — Container Sandboxing Engine](#5-docker--container-sandboxing)
6. [Dockerode — Programmatic Docker API](#6-dockerode--programmatic-docker-api)
7. [DAG (Directed Acyclic Graph) — Pipeline Orchestration](#7-dag--pipeline-orchestration)
8. [Dependency Caching — SHA-256 Lockfile Hashing](#8-dependency-caching--sha-256-lockfile-hashing)
9. [WebSockets / Socket.io — Real-Time Log Streaming](#9-websockets--socketio--real-time-streaming)
10. [GitHub OAuth & JWT — Authentication](#10-github-oauth--jwt--authentication)
11. [GitHub Status API — Commit Checks Integration](#11-github-status-api--commit-checks)
12. [Auto-Revert Engine — Self-Healing Git](#12-auto-revert-engine--self-healing-git)
13. [React + Tailwind CSS v4 — Developer Dashboard](#13-react--tailwind-css-v4--developer-dashboard)
14. [Promise.race — Timeout Safeguards](#14-promiserace--timeout-safeguards)
15. [ANSI Scrubber & Log Parser](#15-ansi-scrubber--log-parser)

---

## 1. Node.js & Express

### What it is
**Node.js** is a JavaScript runtime built on Chrome's V8 engine. It runs JavaScript outside the browser, on a server. Its key trait is that it is **single-threaded and non-blocking** — it uses an event loop to handle many concurrent requests without creating a new thread per request.

**Express** is a lightweight web framework for Node.js that makes it easy to define HTTP routes, attach middleware, and handle requests.

### How MagnusCI uses it
- The **Ingestion Gateway** is an Express server running on port `5001`.
- It exposes a `POST /api/webhooks/github` route that receives GitHub webhook payloads.
- A critical Express configuration is used here:
  ```javascript
  app.use(express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf; // Preserve raw bytes for HMAC signature verification
    }
  }));
  ```
  By default, Express discards the raw request buffer after parsing JSON. MagnusCI overrides this to keep the raw bytes, which are needed for cryptographic signature verification.

### Why this choice
Node.js's event-driven model is ideal for an ingestion gateway — it can accept thousands of concurrent webhook requests without blocking, because each request is handled asynchronously. The gateway does almost no CPU work (just signature verification and a DB insert), so Node.js's single-threaded event loop is perfectly suited to this workload.

---

## 2. HMAC SHA-256 — Cryptographic Security

### What it is
**HMAC** stands for Hash-based Message Authentication Code. It is a mechanism for verifying both the **data integrity** and the **authenticity** of a message using a shared secret key.

**SHA-256** is the hashing algorithm used — it produces a 256-bit (64 hex character) fingerprint of any input data.

### How it works
1. You and GitHub share a secret key (stored in `.env` as `GITHUB_WEBHOOK_SECRET`).
2. When GitHub sends a webhook, it hashes the entire raw request body using your shared secret with HMAC-SHA256.
3. GitHub attaches this hash in the request header: `X-Hub-Signature-256: sha256=<hash>`.
4. Your server receives the request, independently computes the HMAC hash of the raw body using the same secret, and compares the two hashes.
5. If they match → the request is authentic. If they don't → it's a forgery. Return `401 Unauthorized`.

### The Timing Attack problem
A naive comparison like `computedHash === receivedHash` is vulnerable to a **timing attack**. An attacker can send thousands of slightly different payloads and measure tiny differences in response time to guess the secret character by character.

**MagnusCI's solution**: Use `crypto.timingSafeEqual()` — a Node.js built-in that always compares the full string regardless of where the first mismatch occurs, taking constant time every time.

```javascript
const trusted = Buffer.from(`sha256=${computedSignature}`);
const received = Buffer.from(receivedSignature);
if (!crypto.timingSafeEqual(trusted, received)) {
  return res.status(401).json({ error: 'Invalid signature.' });
}
```

---

## 3. PostgreSQL — Relational Data Model

### What it is
**PostgreSQL** is an open-source relational database. It stores data in tables with strict schemas, enforces foreign key relationships, supports ACID transactions, and validates data types at the DB level.

### Why PostgreSQL over MongoDB
- The data in MagnusCI is **highly relational**: a `user` owns many `repositories`, a `repository` has many `builds`, a `build` has many `build_logs`. This 1-to-Many chain maps perfectly to relational tables with foreign keys.
- Postgres **enums** enforce that `build.status` can only be `PENDING`, `RUNNING`, `SUCCESS`, or `FAILED` — not arbitrary strings.
- ACID transactions ensure that if a build record is created but the queue enqueue fails, the whole operation can be rolled back cleanly.

### Database Schema (4 Tables)
| Table | Purpose |
|---|---|
| `users` | Stores authenticated GitHub users (from OAuth) |
| `repositories` | Stores registered GitHub repo URLs, linked to a user |
| `builds` | Tracks each build run with status, commit hash, and timestamps |
| `build_logs` | Stores the full stdout/stderr output captured from Docker containers |

### URL Normalization
Before saving a repository URL, the system normalizes it to prevent duplicates:
- `HTTPS://GITHUB.COM/user/Repo.git/` → `https://github.com/user/repo`
- Converts to lowercase, trims whitespace, strips `.git` suffix and trailing slashes.

### Connection Pooling
Instead of opening a new database connection for every request (expensive), MagnusCI uses `pg.Pool` — a pool of pre-established connections that requests can borrow and return instantly.

---

## 4. Redis & BullMQ — Distributed Job Queue

### What Redis is
**Redis** is an in-memory key-value data store. It is extremely fast (sub-millisecond reads/writes) because it operates entirely in RAM. MagnusCI uses it as a **message broker** — a middle layer that holds build jobs between the gateway and the worker.

### What BullMQ is
**BullMQ** is a Node.js library built on top of Redis that implements a robust, production-grade job queue. It provides:
- **Job persistence**: Jobs survive server restarts (they live in Redis, not in memory).
- **Retry logic**: Failed jobs can be automatically retried with configurable backoff.
- **Concurrency control**: Limit the number of simultaneous jobs a worker processes.
- **State machine**: Jobs move through defined states: `waiting → active → completed / failed`.
- **Atomic transitions**: Uses Redis Lua scripts to ensure a job cannot be picked up by two workers simultaneously.

### Why not just an in-memory array?
If the worker crashes with pending jobs in an array, those jobs are **lost forever**. With Redis/BullMQ, pending jobs survive crashes. The worker reconnects and resumes exactly where it left off.

### Why not Kafka?
Kafka is designed for high-throughput event streaming with millions of events per second. It requires significant infrastructure (ZooKeeper/KRaft, brokers, partitions) and doesn't natively support delayed retries, job prioritization, or a clean worker abstraction. BullMQ/Redis is the right tool for a task queue at this scale.

### The Flow
```
Gateway                  Redis (BullMQ)              Worker
  |                           |                        |
  |-- addJob(buildPayload) -->|                        |
  |<-- jobId returned --------|                        |
  |-- return 202 Accepted --->|                        |
                              |<-- pull next job ------|
                              |-- job data ----------->|
                                                       |
                                                [Execute Build]
```

---

## 5. Docker — Container Sandboxing

### What Docker is
Docker is a platform for running applications in **containers** — isolated, lightweight, portable execution environments.

- **Image**: A read-only blueprint (like a class). `node:20-alpine` is an image containing a minimal Linux OS + Node.js 20.
- **Container**: A running instance of an image (like an object). It has its own filesystem, process space, and network namespace, fully isolated from the host.
- **Registry (Docker Hub)**: A public repository of pre-built images that MagnusCI pulls from on demand.

### Containers vs. Virtual Machines
| | Container | Virtual Machine |
|---|---|---|
| **Size** | MBs | GBs |
| **Startup** | Milliseconds | Minutes |
| **OS** | Shares host kernel | Full separate OS |
| **Isolation** | Process-level | Hardware-level |

### Why Docker for MagnusCI
Running `npm test` from a user's repository directly on the host server is dangerous:
- A script could run `rm -rf /` and wipe the server.
- A script could read environment variables containing secrets.
- Two concurrent builds could conflict over the same `node_modules` folder.

Docker solves all three. MagnusCI runs every build inside a fresh, isolated container with:
- Only the cloned workspace bind-mounted in (not the full host filesystem).
- No `--privileged` flag (containers cannot escalate to root on the host).
- `AutoRemove: true` — container is automatically destroyed when it exits, leaving no zombie containers.

### Multi-Language Support
MagnusCI auto-detects the project's language from the workspace files:
| File Found | Language | Docker Image Used |
|---|---|---|
| `package.json` | Node.js | `node:20-alpine` |
| `go.mod` | Go | `golang:1.21-alpine` |
| `requirements.txt` | Python | `python:3.10-alpine` |
| `pom.xml` | Java (Maven) | `maven:3.9-alpine` |
| `CMakeLists.txt` | C/C++ | `gcc` image |
| `magnus-ci.json` | Custom | User-specified image |

---

## 6. Dockerode — Programmatic Docker API

### What it is
**Dockerode** is a Node.js library that communicates with the Docker Daemon through the **Unix Domain Socket** at `/var/run/docker.sock`. Instead of running shell commands like `docker run ...` (which are vulnerable to shell injection), MagnusCI uses Dockerode to make structured API calls to the Docker Engine over a local socket.

### How it works
The Docker Daemon (`dockerd`) exposes a REST-style API over a Unix socket file. Dockerode wraps this with a clean JavaScript API:
```javascript
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const container = await docker.createContainer({
  Image: 'node:20-alpine',
  Cmd: ['sh', '-c', 'npm install && npm test'],
  Tty: true, // Merges stdout + stderr into one stream
  HostConfig: {
    Binds: [`${workspacePath}:/app`], // Mount workspace
    AutoRemove: true,                  // Self-destruct on exit
    WorkingDir: '/app'
  }
});

await container.start();
const logStream = await container.attach({ stream: true, stdout: true, stderr: true });
```

### Why not `child_process.exec('docker run ...')`?
- Shell command injection: If a repository path contains spaces or special characters, `exec` could break or be exploited.
- No structured response: You get raw strings back, not typed objects.
- Dockerode gives full, programmatic control: create, start, stop, kill, inspect, and attach streams — all from JavaScript.

---

## 7. DAG — Pipeline Orchestration

### What a DAG is
A **Directed Acyclic Graph** is a graph where nodes are connected by directed edges (arrows pointing one way) and there are no cycles (you can never loop back to a node you've already visited).

In MagnusCI, each **build stage** is a node, and `needs` relationships are directed edges.

### How the `magnus-ci.json` Config Works
```json
{
  "stages": {
    "setup":   { "run": "npm install" },
    "lint":    { "run": "npm run lint",  "needs": ["setup"] },
    "test":    { "run": "npm test",      "needs": ["setup"] },
    "compile": { "run": "npm run build", "needs": ["lint", "test"] }
  }
}
```

This defines the graph:
```
setup ──> lint  ──┐
     └──> test ──┘──> compile
```

### How MagnusCI Executes It
1. **Topological Sort**: The DAG parser resolves the dependency graph and identifies stages with no unfulfilled `needs` as "ready to run".
2. **Circular Dependency Detection**: If `A needs B` and `B needs A`, the parser throws an error rather than hanging forever.
3. **Parallel Execution**: Stages with resolved dependencies are launched simultaneously as concurrent JavaScript promises. In an actual build (Job #22), `lint` and `test` containers were both spawned at the exact same second (`20:08:20`).
4. **Sequential Gates**: `compile` only starts after both `lint` and `test` promises resolve successfully.

### Real Proof from Job #22 Logs
```
[20:08:20] [WORKER] Spawning sandbox container for stage: lint
[20:08:20] [WORKER] Spawning sandbox container for stage: test  ← Same second = true parallelism
[20:09:22] [WORKER] Spawning sandbox container for stage: compile ← Only after both finished
```

---

## 8. Dependency Caching — SHA-256 Lockfile Hashing

### The Problem
Every time a container spins up, running `npm install` downloads hundreds of packages from the internet. This takes 30–90 seconds and fails if npm is down. For repeat builds where dependencies haven't changed, this is completely wasteful.

### The Solution: Lockfile Fingerprinting
MagnusCI hashes the lockfile (e.g., `package-lock.json`) using **SHA-256**. The lockfile contains the exact version of every single dependency. If it hasn't changed, the dependencies haven't changed.

### The 4-Stage Cache Cycle
```
1. Clone repo
2. Hash lockfile → compute cache key: {repoId}-{language}-{sha256hash}.tar.gz
3. Check backend/caches/tarballs/ for matching archive
   ├── HIT  → extract tarball into workspace (skip npm install)
   └── MISS → proceed to container run (npm install happens normally)
4. On SUCCESS → compress node_modules into new tarball, save to cache
   On FAILURE → skip caching (don't cache a broken install)
```

### Concurrency Safety
A naive approach would share one `node_modules` folder for all builds of the same repo. If two builds run at the same time, they corrupt each other's filesystem.

MagnusCI's solution: Each build gets a **UUID-named workspace** (`temp_builds/{buildId}/`). The tarball is *extracted into* this private workspace. Two parallel builds never touch each other's files.

### Languages Supported for Caching
| Language | Lockfile | Cached Folder |
|---|---|---|
| Node.js | `package-lock.json` | `node_modules/` |
| Python | `requirements.txt` | `.pip_cache/` |
| Go | `go.sum` | `.go_cache/` |
| Java Maven | `pom.xml` | `.m2_cache/` |
| Java Gradle | `build.gradle` | `.gradle_cache/` |

---

## 9. WebSockets / Socket.io — Real-Time Streaming

### What WebSockets are
HTTP is a request-response protocol — the client asks, the server answers, the connection closes. This doesn't work for live log streaming because you can't push new data to the client without a new request.

**WebSockets** establish a persistent, two-way connection between the server and the browser. Once open, the server can push data to the client at any time.

**Socket.io** is a library built on top of WebSockets that adds:
- Room-based subscriptions (e.g., `build:50` room for Build #50).
- Automatic reconnection.
- Fallback to HTTP long-polling if WebSockets are unavailable.

### How MagnusCI uses it
1. The worker attaches to the Docker container's stdout/stderr stream via Dockerode.
2. As each log chunk arrives, the worker emits it to a Socket.io **room** named `build:{buildId}`.
3. The React frontend, when a developer opens the build modal, joins that room and receives live log chunks.
4. Logs are simultaneously accumulated in a buffer and written to the `build_logs` PostgreSQL table in throttled batches (every 1 second) to prevent database congestion.

### ANSI Stripping
Docker containers emit colored terminal output using ANSI escape codes like `\u001B[32m` (green). These are invisible formatting characters. The log parser strips them before they reach the browser, preventing garbage characters from appearing in the dashboard.

---

## 10. GitHub OAuth & JWT — Authentication

### GitHub OAuth Flow
1. User clicks "Login with GitHub" on the dashboard.
2. They are redirected to GitHub's authorization page.
3. GitHub redirects back to MagnusCI with a temporary `code`.
4. MagnusCI's backend exchanges the `code` for a GitHub `access_token` via a server-to-server API call.
5. MagnusCI uses the `access_token` to fetch the user's GitHub profile (username, avatar, ID).
6. MagnusCI creates or updates a user record in PostgreSQL and issues a **JWT**.

### JWT (JSON Web Token)
A JWT is a compact, signed token that encodes the user's identity. It has three parts:
```
HEADER.PAYLOAD.SIGNATURE
```
- **Header**: Algorithm used (HS256).
- **Payload**: User data (e.g., `{ userId: 42, username: "aman" }`).
- **Signature**: HMAC-SHA256 hash of Header + Payload using `JWT_SECRET`. Prevents tampering.

The JWT is returned to the frontend, stored in localStorage, and sent in the `Authorization: Bearer <token>` header on every subsequent API request. The `authMiddleware.js` verifies the signature on every protected route.

---

## 11. GitHub Status API — Commit Checks

### What it is
GitHub exposes an API that lets external services report a status for a specific commit. This is what creates the green ✅ or red ❌ checkmarks you see on GitHub Pull Requests.

### How MagnusCI uses it
MagnusCI calls this API at three points in the build lifecycle:
| Moment | Status sent to GitHub |
|---|---|
| Build job picked up by worker | `pending` — "MagnusCI: Build is running..." |
| Build exits with code `0` | `success` — "MagnusCI: All tests passed." |
| Build exits with non-zero code | `failure` — "MagnusCI: Build failed." |

Each status update includes a `target_url` linking directly to the build log page on the MagnusCI dashboard.

This requires the `GITHUB_TOKEN` environment variable — a Personal Access Token with `repo` scope.

---

## 12. Auto-Revert Engine — Self-Healing Git

### What it does
If a build pipeline fails, MagnusCI automatically reverts the offending commit and pushes the rollback to the repository, keeping the master branch green without human intervention.

### The 5-Step Revert Process
1. **Git Identity Setup**: Configure a local git identity inside the build workspace:
   ```bash
   git config user.name "Magnus CI"
   git config user.email "ci@magnus.dev"
   ```
2. **Token Injection**: Embed the `GITHUB_TOKEN` directly into the remote URL so the push is authenticated:
   ```
   https://<GITHUB_TOKEN>@github.com/user/repo.git
   ```
3. **Stage the Revert**: Run `git revert --no-commit <failingCommitHash>` — this stages the inverse of the broken commit without creating a commit yet.
4. **Parse the Failure Logs**: Use framework-specific regex to extract exactly which tests failed from the stdout build logs (supports Jest, pytest, JUnit/Maven formats). Build a structured diagnostic commit message.
5. **Commit and Push**: Commit the revert with the diagnostic message and push it back to the remote branch.

### Why this is powerful
Instead of just alerting the developer, MagnusCI takes direct remediation action. The breaking commit is undone immediately, and the Git history itself contains the diagnostic evidence of what failed.

---

## 13. React + Tailwind CSS v4 — Developer Dashboard

### What it is
The frontend is a **React Single Page Application (SPA)** built with **Vite** and styled with **Tailwind CSS v4**.

### Key Components
| Component | Purpose |
|---|---|
| `App.jsx` | Root component, manages auth state and routing |
| `Header.jsx` | Shows connection status indicators and user info |
| `MetricsRow.jsx` | High-level counters: total repos, builds, success rate |
| `MetricsChart.jsx` | Visualizes live CPU and Memory usage of running containers |
| `RepoList.jsx` | Selectable list of connected repositories |
| `BuildHistory.jsx` | Interactive grid of past build runs with status badges |
| `BuildModal.jsx` | Live TTY-style terminal log viewer with download option |
| `ConnectRepoCard.jsx` | Form to register a new GitHub repository URL |

### Container Metrics Monitoring
The backend periodically polls the Docker API for active container stats (CPU usage %, memory usage MB). These telemetry readings are written to PostgreSQL and surfaced on the `MetricsChart.jsx` component as a live line graph — a feature you typically only see in enterprise-grade CI platforms.

---

## 14. Promise.race — Timeout Safeguards

### The Problem
If a developer pushes an infinite loop (`while(true) {}`), the Docker container runs forever, consuming 100% CPU and locking the worker thread permanently.

### The Solution: `Promise.race`
JavaScript's `Promise.race()` resolves (or rejects) as soon as **any one** of the provided promises settles first.

MagnusCI races the container execution against a 2-minute timeout:
```javascript
const buildTimeoutMs = 2 * 60 * 1000; // 120 seconds

const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('BUILD_TIMEOUT')), buildTimeoutMs)
);

try {
  const result = await Promise.race([container.wait(), timeoutPromise]);
  // container finished normally
} catch (error) {
  if (error.message === 'BUILD_TIMEOUT') {
    await container.kill();        // Force-stop the container
    await workspace.cleanup();     // Delete temp build directory
    // Mark build as FAILED in PostgreSQL
  }
}
```

If the container finishes first → normal success/failure flow.
If the timeout fires first → container is force-killed, disk is cleaned, build is marked FAILED.

---

## 15. ANSI Scrubber & Log Parser

### What ANSI codes are
When you run tests in a terminal, the output contains invisible escape sequences like `\u001B[32m` (start green) and `\u001B[0m` (reset). These are fine in a terminal but appear as garbled characters in a browser.

### MagnusCI's Parser Pipeline
The log parser in `logParser.js` and `worker.js` does two things:

**1. ANSI Stripping**: Removes all terminal escape codes using regex:
```javascript
const ANSI_REGEX = /[\u001B\u009B][[()#;?]*[0-9]{1,4}(?:;[0-9]{0,4})*[0-9A-ORZcf-nqry=><~]/g;
const clean = rawLog.replace(ANSI_REGEX, '');
```

**2. Test Summary Extraction**: Applies framework-specific regex patterns to extract structured test statistics:
- **Jest**: Parses lines like `Tests: 12 passed, 3 failed` → extracts `passed: 12, failed: 3`.
- **pytest**: Parses `15 passed, 2 failed in 3.2s` format.
- **JUnit/Maven**: Parses `Tests run: 10, Failures: 1, Errors: 0`.

These parsed statistics are used to display clean pass/fail metrics on the dashboard — `12/15 tests passed` — without requiring any external test reporting integrations.

---

## Quick-Reference Technology Summary

| Technology | Role in MagnusCI | Why This Choice |
|---|---|---|
| **Node.js + Express** | Ingestion Gateway API | Non-blocking I/O, perfect for webhook ingestion |
| **HMAC SHA-256** | Webhook signature verification | Cryptographically proves requests are from GitHub |
| **PostgreSQL** | Persistent relational storage | Relational data model, ACID transactions, enums |
| **Redis** | In-memory message broker | Sub-millisecond speed, job persistence across restarts |
| **BullMQ** | Job queue orchestration | Atomic job transitions, retries, concurrency control |
| **Docker** | Isolated sandbox execution | Complete process/filesystem isolation for untrusted code |
| **Dockerode** | Programmatic Docker API client | Type-safe, injection-proof container control from Node.js |
| **DAG Engine** | Parallel pipeline orchestration | Runs independent stages concurrently, respects dependencies |
| **SHA-256 Caching** | Lockfile-based dependency cache | Speeds up builds by 90%, avoids redundant network downloads |
| **Socket.io** | Real-time log streaming | Push live terminal output to browser without polling |
| **GitHub OAuth** | User authentication | Secure, standard OAuth2 flow without storing passwords |
| **JWT** | Session management | Stateless, self-contained auth tokens verified on every request |
| **GitHub Status API** | Commit check integration | Native PR checkmarks showing build pass/fail on GitHub |
| **Auto-Revert Engine** | Self-healing Git automation | Automatically undoes breaking commits |
| **Promise.race** | Runaway container timeout | Prevents infinite loops from consuming host resources |
| **ANSI Scrubber** | Log cleaning & parsing | Produces clean, readable logs with structured test stats |
