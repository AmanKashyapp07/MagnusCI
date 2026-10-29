# MagnusCI — VISA Internship Interview Playbook

> **Purpose:** A focused guide to presenting MagnusCI clearly, demonstrating the highest-value workflows, and defending the engineering decisions under follow-up questions.
>
> **Project:** [AmanKashyapp07/ci-cd-engine](https://github.com/AmanKashyapp07/ci-cd-engine) · localhost demo (see startup instructions below)

---

## 1. The story to communicate

**MagnusCI is a containerized CI/CD engine that connects GitHub push events to dependency-aware, parallel, Docker-backed stage execution.** It combines webhook ingestion with HMAC verification, asynchronous job queuing via BullMQ, a DAG-based stage scheduler, isolated container execution with resource limits and timeouts, PostgreSQL persistence, and a React dashboard with Socket.IO live log streaming.

The strongest interview story is not the number of features. It is the engineering problem behind decoupling event intake from build execution, scheduling stages with correct dependency ordering, and making the result persistent and observable.

**Three themes to anchor the presentation:**

1. **Decoupling:** the HTTP request that receives a webhook must not block on the full build. The queue and worker separate intake from execution cleanly.
2. **Correctness:** the stage scheduler must respect dependency order, run independent stages concurrently, and propagate failures to dependents — without executing a stage whose dependency failed.
3. **Observability:** every status transition and log line must be persisted and remain available after a page refresh, independent of whether the live WebSocket connection was present.

> **Interview rule:** Explain what you personally implemented, how it works in the repository, how you tested it, and what trade-offs remain. Never present an unmeasured estimate as a benchmark or a design goal as a proven guarantee.

---

## 2. The 30-second opening

Use this in your own voice rather than memorising it word for word:

> "I built MagnusCI, a containerised CI/CD engine. A GitHub push event arrives, passes HMAC signature verification, and gets enqueued as a background job. A worker picks it up, parses a pipeline configuration file, builds a dependency graph, and executes stages in topological order — running independent stages concurrently inside isolated Docker containers. Every status transition and log line is persisted to PostgreSQL and streamed to the React dashboard over Socket.IO. I'll show the full flow, then explain one or two design decisions in depth."

Then open the prepared demo. Avoid opening with a list of every technology or a tour of the README.

---

## 3. The live demo: 5–7 minutes

**The goal is to show one complete build lifecycle.** Do not attempt to demonstrate every feature. Have the application running and the dashboard open before the interview begins.

| Time | Action | Say |
|---|---|---|
| 0:00–0:30 | Introduce the project and show the running dashboard with the seeded build history | "MagnusCI connects GitHub events to asynchronous, dependency-aware, containerized execution. This is the build history — each row is a real build that went through the queue and scheduler." |
| 0:30–1:30 | Run `./start.sh demo` in a second terminal; switch to the dashboard | "I just sent a job into the BullMQ queue. The webhook endpoint responds 202 immediately — the HTTP response does not wait for any stage to complete. The worker picks this up asynchronously." Show the build appearing as PENDING then RUNNING. |
| 1:30–3:30 | Open the build modal as logs arrive; show the `demo/magnus-ci.json` in an editor | "The pipeline definition is a JSON file in the repository. `setup` has no dependencies and runs first. `test` and `lint` both depend only on `setup`, so once setup succeeds they become eligible at the same time. `package` depends on both, so it waits." Point to the two stage log panels arriving simultaneously. |
| 3:30–5:00 | Show individual stage log panels in the modal, expand `test` and `lint` | "Each stage runs in a separate ephemeral Docker container. The worker mounts the workspace directory, sets resource limits — two gigabytes of memory and one CPU core — and enforces a five-minute timeout. The log stream here is the actual stdout from the container." |
| 5:00–6:00 | Show one implementation file — either `dag.js` or `webhookSignature.js` | Offer one technical deep dive (see section 6). |
| 6:00–7:00 | Refresh the browser; click the same build | "After a refresh, the logs are still here. The worker persisted them to `build_logs` in PostgreSQL during execution. The frontend fetches them from the REST endpoint on mount. The Socket.IO live push is an optimisation — the persisted path is the source of truth." |

### Demo discipline

- Let the behaviour prove the feature; explain the internals after the interviewer sees it working.
- Demonstrate a feature only if it has passed the pre-flight check below.
- Use `./start.sh demo` for the live trigger — it removes network dependency and uses the real queue, scheduler, and execution path.
- Keep the GitHub repository open in another tab with `backend/src/utils/dag.js`, `backend/src/middleware/webhookSignature.js`, and `demo/magnus-ci.json` bookmarked.
- If the interviewer interrupts with a question, stop the tour and answer it. Do not force completion of the script.
- Do not claim "instant builds," "zero overhead," or a specific throughput number without a test setup and evidence you can explain.

---

## 4. Pre-flight checklist

### The day before

- [ ] Run `./start.sh` from a clean terminal and wait for the ready banner.
- [ ] Confirm Redis and PostgreSQL connection messages in the startup log.
- [ ] Confirm Docker is running: `docker ps` should succeed.
- [ ] Pull the demo image in advance: `docker pull alpine:latest`.
- [ ] Run `./start.sh demo` and watch the build complete in the dashboard.
- [ ] Run `./start.sh demo --fail` and confirm the `test` stage shows FAILED and `package` shows SKIPPED.
- [ ] Click a completed build and refresh the page; confirm logs are still present.
- [ ] Confirm the seeded demo build (the pre-populated SUCCESS build) is visible in the dashboard.
- [ ] Check the exact lines in `dag.js` for `hasCycle` and `executeDAG` that you intend to show.
- [ ] Keep a screenshot or short screen recording of the dashboard with a completed build as a backup. Label it as a recording if you use it.

### 30 minutes before

- [ ] Run `./start.sh` and wait for explicit ready output.
- [ ] Run `./start.sh demo` once to confirm the full path works in the current environment.
- [ ] Open `http://localhost:5001/ci/` in the primary browser and click "Interviewer Demo Access".
- [ ] Open a second terminal tab ready to run `./start.sh demo` on cue.
- [ ] Have `backend/src/utils/dag.js`, `backend/src/middleware/webhookSignature.js`, and `demo/magnus-ci.json` open in an editor or browser tab.
- [ ] Mute notifications and close unrelated applications.

### Startup and recovery

| Issue | Calm response | Recovery |
|---|---|---|
| Redis not responding | "BullMQ requires Redis. Let me start it." | `brew services start redis`, then re-run `./start.sh`. |
| PostgreSQL not responding | "The build repository needs a database connection." | `brew services start postgresql@14`, then re-run. |
| Docker not running | "Stage execution needs Docker for container isolation." | Start Docker Desktop or `colima start`, then re-run. |
| Port 5001 already in use | `./start.sh` kills the port automatically. | Run `lsof -ti:5001 | xargs kill -9` manually if needed. |
| `alpine:latest` pull takes time | "The image pull is a one-time cost; subsequent builds reuse the local cache." | Pre-pull with `docker pull alpine:latest` the day before. |
| Dashboard is blank after start | "I'll check the frontend build." | Run `cd frontend && npm run build` and restart. |
| Build stays PENDING indefinitely | Worker is not running. | Check `/tmp/magnus-worker.log`; restart the worker. |

**Avoid risky recovery commands** such as deleting the database or running `npm install` during the interview. A prepared fallback recording is better than improvising.

---

## 5. Architecture: explain the request path

```text
GitHub (or ./start.sh demo)
         │
         ▼  HTTP POST /api/webhooks/github
   HMAC-SHA256 signature verification middleware
         │
         ▼
   webhooksController
     ├── upsert repository record
     ├── create PENDING build in PostgreSQL
     └── buildQueue.add('run-build', job)  ←── BullMQ / Redis
                                                    │
                                                    ▼
                                           BullMQ Worker process
                                             ├── status: RUNNING
                                             ├── git clone workspace
                                             ├── parseDAG (magnus-ci.json)
                                             ├── validatePipelineStages
                                             ├── hasCycle check
                                             └── executeDAG (parallel scheduler)
                                                       │
                                             ┌─────────┴─────────┐
                                             ▼                   ▼
                                     Docker container     Docker container
                                      (stage: test)        (stage: lint)
                                             │                   │
                                             └────────┬──────────┘
                                                      ▼
                                               Docker container
                                                (stage: package)
                                                      │
                                                      ▼
                                              PostgreSQL build_logs
                                                      │
                                              Redis pub/sub channel
                                                      │
                                              Socket.IO gateway
                                                      │
                                              React dashboard
```

This is the actual execution path for a demo build. The API gateway (port 5001) and the BullMQ worker are separate Node.js processes started by `start.sh`.

### A clear verbal walkthrough

1. An HTTP POST arrives at the webhook endpoint and passes HMAC-SHA256 signature verification.
2. The controller creates a `PENDING` build record and enqueues a job. The HTTP response (202) is returned immediately — no stage has executed yet.
3. The worker process picks up the job from Redis via BullMQ. It is a separate process from the API gateway.
4. The worker clones the target repository (or uses a pre-staged workspace in demo mode), reads `magnus-ci.json`, and runs the DAG scheduler.
5. The scheduler identifies stages whose dependencies are all in `SUCCESS` state and runs them concurrently as Docker containers.
6. Log output is persisted to `build_logs` in PostgreSQL and published to a Redis channel every second.
7. The API gateway subscribes to the Redis channel and pushes log chunks to the correct Socket.IO room (`build-<id>`).
8. The final build status is written to PostgreSQL. Logs remain accessible via the REST endpoint after the build finishes.

### How to answer "Why these technologies?"

| Choice | Reason | Trade-off to acknowledge |
|---|---|---|
| BullMQ + Redis | Durable job queue with retry semantics; separates HTTP intake from execution | Redis is a required dependency; a Redis restart can lose in-flight job state unless AOF/RDB persistence is configured. |
| PostgreSQL | Durable relational storage for builds, logs, and repositories | Frequent log upserts add write overhead; the 1 s polling interval in the worker bounds the write rate. |
| Docker | Filesystem and process boundary per stage; resource limits via cgroups | Containers share the host kernel — not equivalent to a VM; image pull on first use adds latency. |
| Socket.IO | Full-duplex real-time delivery of log chunks to the browser | Requires Redis adapter for multi-process setups; polling fallback is needed when the socket is unavailable. |
| DFS cycle detection | Simple recursive implementation using a recursion stack set | Does not produce the cycle path in the error message; Kahn's algorithm would give a cleaner diagnostic but the current implementation is correct for detection. |
| `crypto.timingSafeEqual` | Prevents timing-based signature oracle attacks | Length mismatch must be checked before the call to avoid a Node.js exception — this is guarded in the middleware. |

---

## 6. The two deep dives to prioritise

Do not present all internals in the main demo. Pick **one correctness topic** and **one design topic**, and be able to open the actual implementation.

### Deep dive A — DFS cycle detection and the DAG scheduler

**Problem:** A pipeline definition where stage A depends on B and B depends on A creates an infinite loop if the scheduler naively waits for dependencies.

**Approach:** Before execution, `hasCycle` in `dag.js` runs a depth-first search using a visited set and a recursion-stack set. A node is a cycle member if it is encountered while it is already on the recursion stack.

```text
stages: { A: { needs: ['B'] }, B: { needs: ['A'] } }

DFS from A:
  visit A → add to recStack
  follow dep B → visit B → add to recStack
  follow dep A → A is in recStack → CYCLE DETECTED
```

**The scheduler** (`executeDAG`) then runs independently of the cycle check:

```text
all stages start as PENDING
loop:
  runningStages  = stages in RUNNING state
  pendingStages  = stages in PENDING state
  readyStages    = pending stages where every dep is SUCCESS

  launch all readyStages in parallel
  if no ready stages and some are still RUNNING → await Promise.race
  if no ready and none running and some pending → deadlock/upstream failure → break
```

When a stage fails, its state becomes `FAILED`. Downstream stages never see all their dependencies as `SUCCESS`, so they remain `PENDING` and are logged as `[SKIPPED]`. They are never silently treated as successful.

**Likely follow-ups:**

- What if a stage has a dependency on a stage name that doesn't exist?
- What if all stages fail — does the scheduler loop forever?
- Can two stages that depend on the same parent really run at the same time?
- How does `Promise.race` interact with the outer loop?

**Code to open:** [`backend/src/utils/dag.js`](backend/src/utils/dag.js) — `hasCycle`, `executeDAG`, and the new `validatePipelineStages` function.

### Deep dive B — HMAC-SHA256 webhook signature verification

**Problem:** Any process that can reach the webhook endpoint can submit a fake push event and trigger arbitrary builds. Verification must be both correct and resistant to timing attacks.

**Approach:** GitHub computes `HMAC-SHA256(secret, raw_body)` and sends it as `X-Hub-Signature-256`. The middleware recomputes the same digest from the raw request bytes — not the parsed JSON — and compares using `crypto.timingSafeEqual`.

```text
raw_body = Buffer captured by express.json verify callback
digest   = sha256= + HMAC(secret, raw_body)
checksum = X-Hub-Signature-256 header value

if length differs → reject (guards timingSafeEqual from exception)
if !timingSafeEqual(digest, checksum) → 401
```

**Key points:**

- `req.rawBody` is captured before JSON parsing; signature verification runs against raw bytes, not the re-serialised object.
- `timingSafeEqual` prevents an attacker from learning bytes of the correct signature by measuring response time.
- A missing `GITHUB_WEBHOOK_SECRET` now returns HTTP 500 (fail-closed) rather than bypassing verification. The secret must be set — the application does not silently open the endpoint.
- Secrets are never logged.

**Likely follow-ups:**

- What attack does timing-safe comparison prevent?
- Why the raw body and not `JSON.stringify(req.body)`?
- What happens if the `Content-Type` is wrong and `express.json` rejects the body?
- Why fail with 500 instead of 401 when the secret is missing?

**Code to open:** [`backend/src/middleware/webhookSignature.js`](backend/src/middleware/webhookSignature.js).

---

## 7. Other engineering highlights: use selectively

Keep this section for interviewer-led deep dives. Explain the problem, the mechanism, the trade-off, and evidence. A feature name alone is not an explanation.

### Queue and worker process separation

**Problem:** If the HTTP handler executed build stages synchronously, a slow build would tie up the request thread and prevent other webhooks from being acknowledged.

**Mechanism:** `webhooksController` calls `buildQueue.add(...)` and returns 202. The BullMQ worker — a separate Node.js process — consumes jobs from the Redis-backed queue. The HTTP response time is independent of build duration.

**Discuss:** What happens to a job if the worker crashes mid-build? (BullMQ marks it as failed after a stall timeout; the build's DB record is left in `RUNNING` until the worker restarts and the cleanup runs or `start.sh` resets stale statuses.) What is the retry behaviour? (BullMQ default: no auto-retry unless configured — the current implementation does not configure retries, so a crashed build stays failed.)

### Resource limits and stage timeouts

**Problem:** An unbounded container can exhaust host memory or run indefinitely.

**Mechanism:** Each container is created with `Memory: 2 GB`, `CpuQuota: 100000`, `CpuPeriod: 100000` (one CPU core), and a 5-minute timeout enforced by `Promise.race` against `container.wait()`. On timeout, the container is force-removed.

**Discuss:** The memory limit is applied by the Docker Engine via cgroups. The timeout is a Node.js-level race — if the worker process crashes before the race resolves, the container is orphaned until Docker's own GC or a manual cleanup. Workspace cleanup in the `finally` block removes the cloned directory but not a stuck container.

### Dependency cache (local tarball)

**Problem:** Running `npm ci` on every build re-downloads packages from the registry.

**Mechanism:** `cache.js` fingerprints the lockfile with SHA-256, looks for a tarball named `<repoId>-<language>-<hash>.tar.gz` in `backend/caches/tarballs/`, and extracts it with native `tar` if present. On a cache miss it downloads fresh and saves the tarball after a successful build.

**Discuss:** The cache key includes `repoId` to prevent cross-repository pollution. Cache extraction runs before stage execution and is non-fatal — a missing cache is a miss, not an error. The implementation does not use MinIO or S3 in the local path; those are in `s3Cache.js` and `zstdCache.js` which are not invoked in the active worker flow.

### Live log streaming architecture

**Problem:** The API gateway and the BullMQ worker are separate processes. The worker cannot call `io.emit()` directly.

**Mechanism:** The worker publishes log chunks to `magnus:build-log` on Redis every second. The API gateway subscribes via a dedicated Redis client and forwards each chunk to the correct Socket.IO room (`build-<id>`). If the socket is unavailable, the frontend's polling fallback requests persisted logs from `GET /api/builds/:id/logs`.

**Discuss:** The Redis channel is best-effort — a Redis restart between publish and subscribe drops that chunk. The persisted DB copy is always consistent. The live push is a latency optimisation, not the source of truth.

---

## 8. Database design: the concepts worth explaining

| Area | Design idea | What the interviewer may ask |
|---|---|---|
| `repositories` table | Stores GitHub URL; upserted on every webhook so the same repo is not duplicated | How do you handle URL normalisation? (`repoService.normalizeUrl` strips auth tokens and trailing slashes.) |
| `builds` table | Has `PENDING → RUNNING → SUCCESS/FAILED` as a CHECK constraint | What prevents a build from going directly from PENDING to SUCCESS? (The worker sets RUNNING at job start and SUCCESS/FAILED at the end.) |
| `build_logs` table | One row per build, `log_message TEXT` is replaced on each save | Why not one row per log line? (Volume — a build emits thousands of lines; one upsert per second is simpler and sufficient for the demo.) |
| `status CHECK` constraint | `CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED'))` | What happens if the worker tries to write an invalid status? PostgreSQL rejects the write with a constraint violation. |
| Schema initialisation | `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS` run on every startup | Is this safe to run repeatedly? Yes — the `IF NOT EXISTS` guards make it idempotent. |

---

## 9. Security: present the actual boundaries

| Area | What to explain | Avoid claiming |
|---|---|---|
| Webhook authentication | HMAC-SHA256 with timing-safe comparison against the raw body | "The endpoint is secure" — explain the mechanism and its assumptions (shared secret must be set and kept private). |
| Missing secret | Returns HTTP 500 (fail-closed) — the server refuses to process webhooks without a configured secret | "Fail-closed means it can't be bypassed" — a misconfigured secret or an attacker who knows the secret still defeats it. |
| JWT authentication | The dashboard API uses JWT tokens; `authMiddleware.js` validates the token on every protected route | "JWT is stateless so it's always secure" — the signing secret must be strong and kept private; `aman123` is a demo value only. |
| Docker stage isolation | Each stage runs in its own container with a separate process namespace and filesystem | "Docker prevents all attacks" — containers share the host kernel; a kernel exploit or misconfigured mount can break isolation. |
| Resource limits | Memory cap (2 GB) and CPU quota (1 core) via cgroups | "Resource limits prevent container escape" — they limit resource use, not code execution scope. |
| Secret logging | Webhook secret, JWT secret, and GitHub token are not logged at any log level | Verify in the actual logger calls before the interview. |

**A strong security answer has four parts:** asset/threat, enforcement point, test/evidence, residual risk.

---

## 10. Observability and testing

### Observability

The application logs to stdout via a structured logger (`backend/src/utils/logger.js`). The API gateway and worker write to `/tmp/magnus-gateway.log` and `/tmp/magnus-worker.log` during the demo. Be prepared to show:

- What a `RUNNING` build's log stream looks like in real time.
- How to check BullMQ queue depth (the queue object has `getWaiting()`, `getActive()`).
- How to verify a build's persisted status: `SELECT status, started_at, finished_at FROM builds ORDER BY id DESC LIMIT 5;`
- What the Redis channel publish rate looks like under a running build.

Do not call the terminal log output proof of production observability. Explain what additional tooling (metrics endpoint, distributed tracing, alerting) would be needed for a real deployment.

### Testing

Use the test commands in the current checkout. Verify against `testing/jest.config.js` before interview day.

```bash
# From the project root:
cd testing && npm run test:unit          # dag, cache, logParser, workspaceAllocator, ...
cd testing && npm run test:integration   # routes, middleware, webSocket (needs running services)
```

Be prepared to separate:

- **Unit tests:** `dag.test.js` — cycle detection, scheduler ordering, failure propagation. `cache.test.js` — lockfile fingerprinting, cache-miss path. `logParser.test.js` — ANSI stripping, stage boundary detection.
- **Integration tests:** `middleware.test.js` — signature verification path. `routes.test.js` — build creation and retrieval. `webSocketRealtimeStreaming.test.js` — Socket.IO delivery.
- **End-to-end / load tests:** require live infrastructure; verify these are stable before citing them.

**For each test, know one concrete case, its expected result, and what bug it would catch.** For example: the `executeDAG` test that checks a failed `test` stage leaves `deploy` as `PENDING` — this catches a bug where the scheduler could incorrectly mark a skipped stage as `SUCCESS`.

---

## 11. Likely interviewer questions

Use these as prompts, then answer from your actual implementation. Avoid memorising long paragraphs.

### Product and ownership

**"What problem does MagnusCI solve?"**

It automates the path from a code push to a verified, tested build result — eliminating the manual steps between committing code and knowing whether it works. The engineering interest is in doing this reliably: decoupled intake, correct scheduling, isolated execution, and durable results.

**"What was the hardest part?"**

Choose the hardest problem you personally tackled. Strong candidates: getting the DAG scheduler to handle concurrent stage failures without deadlocking, or designing the live log bridge between the worker process and the Socket.IO gateway without coupling them directly.

**"What did you implement personally?"**

Be precise about the modules you built and tested versus what came from libraries. BullMQ handles queueing semantics; you built the job schema, the worker lifecycle, the DAG scheduler, and the persistence path. Docker API calls use `dockerode`; you built the container lifecycle, timeout enforcement, and log streaming.

**"What would you improve with another month?"**

Prioritise one defensible improvement — for example, making the worker crash-safe by writing a checkpoint before each stage so a restarted worker can resume rather than restart the full build. Or adding a proper metrics endpoint to make queue depth and stage duration observable.

### Queue and scheduling

**"Why not just run the build synchronously in the webhook handler?"**

A build that takes two minutes would hold the HTTP connection open for two minutes. GitHub has a short delivery timeout; the response would time out before the build finished, and GitHub would retry the webhook, triggering a second build. The queue decouples delivery from execution.

**"What happens if the worker crashes mid-build?"**

The build record stays in `RUNNING` state in the database. BullMQ detects a stalled job after a configurable timeout and can mark it failed. On restart, `start.sh` resets any `RUNNING` or `PENDING` builds to `FAILED` to avoid a permanently stuck dashboard entry. In production you would configure BullMQ's `stalledInterval` and `maxStalledCount`.

**"Can two builds for the same repository run at the same time?"**

Yes. Each build gets its own workspace directory under `/tmp`, its own set of containers, and its own log row. The database records are separate rows. There is no per-repository lock in the current implementation.

**"How does the scheduler avoid running a stage whose dependency failed?"**

`executeDAG` only moves a stage from `PENDING` to `RUNNING` when every dependency is in `SUCCESS` state. If a dependency is `FAILED`, the condition `dependencies.every(dep => states[dep] === 'SUCCESS')` is false. The stage remains `PENDING`. When no more stages are ready and none are running, the loop exits and remaining `PENDING` stages are logged as `[SKIPPED]`.

### Containers and execution

**"Why Docker instead of running commands directly on the host?"**

Each stage gets an isolated filesystem and process namespace. Without Docker, a stage that installs a package globally or deletes a directory could interfere with subsequent stages or the host system. Docker also makes resource limits practical via cgroups.

**"What happens if a Docker image doesn't exist locally?"**

The worker checks `docker.getImage(imageName).inspect()`. If the image is not present (statusCode 404), it calls `docker.pull()` and waits for completion before creating the container. The pull is logged to the build's output. Pre-pulling `alpine:latest` before the demo eliminates this latency.

**"What if a stage hangs?"**

A `Promise.race` between `container.wait()` and a 5-minute `setTimeout` resolves whichever fires first. On timeout, the log records the exceeded ceiling and `container.remove({ force: true })` is called. The stage returns `{ success: false, exitCode: 124 }`, which marks it `FAILED` in the scheduler.

**"How is the workspace cleaned up?"**

The `finally` block in the worker calls `fs.rm(workspacePath, { recursive: true, force: true })` after all stages finish and after artifact harvesting, preview deployment, and PR bot steps have been attempted. Cleanup runs even if the build fails.

### Live logs and persistence

**"How does the dashboard receive log updates in real time?"**

The worker publishes log chunks to `magnus:build-log` on Redis every second. The API gateway subscribes to this channel through a dedicated Redis client and forwards each chunk to the appropriate Socket.IO room (`build-<buildId>`). The browser receives `build-log` events and appends them to the terminal view.

**"What if the WebSocket connection drops?"**

`useBuildLogs` sets up a polling interval (every few seconds) for `RUNNING` or `PENDING` builds. It calls `GET /api/builds/:id/logs` which returns the persisted log from PostgreSQL. After the build finishes the socket subscription ends; all subsequent log views come from the REST endpoint.

**"What if the browser refreshes mid-build?"**

On mount, `useBuildLogs` calls `fetchLogs(selectedBuildId)` which fetches the accumulated log from the database. The live socket subscription then picks up new chunks from where the snapshot left off. No log content is lost — the DB copy is the authoritative record.

### Security

**"How do you know the webhook is from GitHub?"**

GitHub computes `HMAC-SHA256(shared_secret, raw_body)` and sends it in `X-Hub-Signature-256`. The middleware computes the same digest and uses `crypto.timingSafeEqual` to compare. A forged payload without knowledge of the shared secret will not produce a matching digest.

**"What is a timing attack and why does `timingSafeEqual` prevent it?"**

A naive string comparison `a === b` can short-circuit at the first differing byte. An attacker who can measure response time precisely can determine how many leading bytes of their guess are correct, byte by byte. `timingSafeEqual` always compares all bytes in constant time regardless of where they differ, eliminating the timing signal.

**"What if someone sets `GITHUB_WEBHOOK_SECRET` to an empty string?"**

The middleware checks `if (!secret)` which is true for both `undefined` and an empty string. It returns HTTP 500 — the endpoint refuses to accept any webhook until a real secret is configured. This prevents accidental exposure from an incomplete environment setup.

---

## 12. Claims to treat carefully

The project description and README may contain figures or claims. **Treat the following as design intentions, not measured benchmarks, unless you have a reproducible test to support them.**

| Claim | Safe explanation | Evidence needed to present as measured |
|---|---|---|
| Parallel stage execution | Independent stages are launched in the same scheduler loop iteration. In the demo, `test` and `lint` are started 0 ms apart in a dry-run. | Measure wall time of a parallel run versus a serialised run with the same stage durations. |
| Sub-second webhook response | The controller enqueues the job and returns 202 without waiting for the build. Response time depends on the DB insert and BullMQ enqueue. | Measure p50/p99 response times under load. |
| Resource isolation per stage | Each stage gets a separate container with 2 GB memory and 1 CPU core limits. | Verify `docker inspect` shows the HostConfig limits on a running container. |
| Log persistence | Every build's logs are stored in `build_logs` and survive a process restart. | Restart the worker mid-build and confirm logs accumulated before restart are still retrievable. |
| Cache-miss safety | `restoreCache` returns a clean message when no tarball exists; execution continues with a fresh install. | Confirm no cache tarball exists, trigger a build, and verify the stage runs successfully. |

**Interview wording:** "The design is intended to achieve X. I'd validate the effect with Y measurement." If a result is already measured, share the test setup and numbers. Do not call a design goal a benchmark.

---

## 13. The 60-second closing

> "The central engineering challenge in MagnusCI is correctly separating event intake from build execution, scheduling stages that can safely run in parallel while respecting dependencies, and making every result durable and inspectable regardless of whether the live connection was present. BullMQ handles the queue; the DAG scheduler handles ordering and concurrency; Docker provides the execution boundary; PostgreSQL and the Redis pub/sub bridge handle persistence and live delivery. I'd be happy to open any of those implementations and discuss the trade-offs, failure cases, or tests."

Then stop. Let the interviewer choose the next direction.

---

## 14. Final preparation checklist

Before the VISA interview, make sure you can do each of these without looking at the notes:

- [ ] Explain MagnusCI's problem and demonstrate the value in 30 seconds.
- [ ] Complete the 5–7 minute demo without setup improvisation.
- [ ] Draw the architecture and trace one webhook event from ingestion through queue, worker, scheduler, containers, persistence, and dashboard.
- [ ] Explain why the webhook handler returns 202 before any stage executes.
- [ ] Explain DFS cycle detection with the recursion-stack pattern and show the code.
- [ ] Explain why `timingSafeEqual` is necessary and what attack it prevents.
- [ ] Explain what happens to a downstream stage when its dependency fails.
- [ ] Show the actual code for the scheduler's readiness check and the timeout enforcement.
- [ ] Explain how log chunks travel from the worker to the browser without the worker having a reference to `io`.
- [ ] Describe one real test, one real failure case, and one known limitation.
- [ ] Separate design goals from measured results.
- [ ] Describe your individual contribution accurately.
- [ ] Answer "What would you improve next?" with one specific, defensible priority.

---

*Interview notes for [MagnusCI](https://github.com/AmanKashyapp07/ci-cd-engine). Keep this guide aligned with the current code and verified demo environment.*

