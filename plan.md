# MagnusCI — Implementation Plan (5-Phase Roadmap)
> Derived from `IIITA_Project_Mastery_Guide_NexusIDE_MagnusCI.docx` x current repo state  
> Objective: Systematic execution, metric verification, and defense-ready engineering.

---

## Legend
| Tag | Meaning |
|-----|---------|
| **MUST** | Non-negotiable before any interview |
| **SHOULD** | Strongly recommended |
| **STRETCH** | Do only if time allows |

---

## The 5 Implementation Phases

### **Phase 1: Claim Reconciliation & Baseline Benchmarks**
> *Goal: Audit every README/resume claim against actual code behavior, run the existing test suites, and produce reproducible baseline benchmark output.*

#### MUST
- [ ] **Run the full test suite** (`cd testing && npm test`) — record pass count, test duration, and any failing suites across `unit/`, `integration/`, and `e2e/`.
- [ ] **Baseline benchmark scripts** for every claimed metric (save raw terminal output):
  - `Absorbs bursts; zero pool exhaustion`: run a load script varying webhook send rate; record ack latency, queue depth at peak, and queue drain time.
  - `Instant stage execution (image check vs pull)`: time `docker pull` of the build image vs `docker image inspect` of a locally cached image on the same host; report median.
  - `Faster tests on tmpfs vs disk`: clone the same repository; run the test command on tmpfs (`/dev/shm`) vs disk; record p50 and p95 duration.
  - `Faster cache with zstd -T0 vs gzip`: compress and decompress the same `node_modules` tarball with both; record time and output size.
  - `Shallow clone saves I/O`: measure bytes transferred and time for `git clone --depth=1` vs full clone on the same repository.
  - `Parallel DAG execution is faster`: run the same multi-stage pipeline with parallelism enabled vs forced sequential; record total wall-clock time.
  - `Sub-millisecond log delivery (p95)`: timestamp each log line from container stdout to browser WebSocket receipt; report p95 across N builds.
  - `No host disk pollution`: run `du -sh /tmp /var/lib/docker` before N builds and after cleanup; confirm delta is zero.
- [ ] **Confirm Kahn's algorithm usage** in the DAG scheduler: read `backend/src/pipeline/` and verify indegree-based frontier expansion vs DFS — document which algorithm is actually used and correct any README claim.
- [ ] **Check HTTPS status**: verify whether the live deployment URL is HTTP or HTTPS; remove the HTTPS claim from README until TLS is actually provisioned.
- [ ] **Fix GitHub About text**: write a one-line engineering description for the repository; add relevant GitHub topic tags.

---

### **Phase 2: Reliability, Idempotency & Queue Semantics**
> *Goal: Prove duplicate-free delivery, define exact failure semantics, and document all queue bounds.*

#### MUST
- [ ] **Implement webhook delivery-ID deduplication**:
  - On every incoming GitHub webhook, extract the `X-GitHub-Delivery` header and store it in a database table with a unique constraint.
  - Reject or no-op any payload whose delivery ID has already been processed — prevents duplicate builds from GitHub redeliveries.
  - Add a stable `job_id` (derived from `delivery_id + ref + sha`) to BullMQ; verify it acts as a dedupe key after job completion.
  - Produce evidence: replay the same webhook N times; confirm exactly 1 build runs.
- [ ] **Define and enforce backpressure bounds**:
  - Set an explicit BullMQ concurrency cap (number of simultaneous worker jobs).
  - Set a maximum queue depth; define the behavior when the queue is full (return HTTP 429 or 503 with `Retry-After`).
  - Implement coalescing of superseded builds: if two pushes to the same branch are queued, discard the older one.
  - Load-test at the limit: verify ack latency stays <1s and no jobs are silently dropped.
- [ ] **Worker kill -9 mid-build test**:
  - Kill the worker process during an active build.
  - Verify BullMQ stalled-job reclaim picks it up, the container is cleaned up, and the final build status is set correctly (no stuck "running" state).
- [ ] **Redis down scenario**:
  - Stop Redis while the webhook receiver is running; verify the receiver returns an error so GitHub can redeliver rather than silently losing the event.
  - Document the reconciliation path from PostgreSQL as the durable source of truth.
- [ ] **Document the job state machine** in `docs/state-machine.md`:
  - Enumerate all valid states: `queued -> running -> success | failed | cancelled`.
  - Define allowed transitions and what triggers each; document what happens on illegal transitions.

---

### **Phase 3: Security Hardening & Sandbox Isolation**
> *Goal: Enumerate and close attack surfaces in webhook handling, build sandboxes, preview routing, and dependency caching.*

#### MUST
- [ ] **Write `docs/threat-model.md`** for MagnusCI covering:
  - Assets: host Docker daemon, host disk, GitHub credentials, build secrets, preview outputs, dependency cache.
  - Attack vectors and mitigations:
    - **Webhook replay**: `X-GitHub-Delivery` deduplication with TTL expiry (Phase 2).
    - **Signature bypass**: HMAC-SHA256 computed over the raw request body before parsing; constant-time comparison (`timingSafeEqual`); reject before any JSON deserialization.
    - **Runaway builds**: enforce per-build timeout; memory, CPU, and PID limits on sandbox containers; no `docker.sock` mount inside build containers.
    - **Network egress from builds**: document current egress policy; if no egress block exists, add it as a known gap.
    - **Fork PR cache poisoning**: caches keyed only by lockfile hash are shared across fork pull requests; fix by scoping cache keys to `{repository_full_name}:{lockfile_hash}` and never sharing across trust boundaries.
  - Known gaps: the worker mounts `docker.sock`, making it root-equivalent on the node — document this; write a design note comparing rootless Docker, Sysbox, and Kaniko as alternatives.
- [ ] **Fix preview environment isolation**:
  - Previews served from the same origin as the dashboard allow untrusted build output to execute JavaScript with the app's session cookies.
  - Fix: serve previews from a separate subdomain or origin; add `Content-Security-Policy: sandbox` and `X-Frame-Options: DENY`; strip session cookies from preview responses.
  - Verify with a header check test in `testing/integration/previewEnvironment.test.js`.
- [ ] **Verify sandbox container hardening** in `backend/src/runners/`:
  - Confirm build containers run as a non-root user.
  - Confirm memory, CPU, and PID limits are applied.
  - Confirm `docker.sock` is not mounted inside the build container.
  - Run `testing/unit/containerSecuritySandboxing.test.js` and record results.

#### SHOULD
- [ ] **Auto-revert safety review**:
  - Auto-revert should be opt-in per repository (not default-on).
  - Must only trigger on the main/default branch after a configurable number of retries, not on the first failure.
  - Must detect and skip revert if newer commits have landed since the failing commit.
  - Add a design note and a test covering: flaky test scenario, newer-commit scenario, and permission check.

---

### **Phase 4: DAG Scheduler, Log Streaming & Observability**
> *Goal: Verify correctness of the scheduler under failure, close log-streaming gaps, and make the system operationally visible.*

#### MUST
- [ ] **Scheduler correctness tests** in `testing/unit/dag.test.js` and `dagEngineAdvanced.test.js`:
  - Confirm cycle detection: submit a pipeline YAML with a circular dependency and verify rejection before any container starts.
  - Confirm failure semantics: when a middle stage fails, dependent downstream stages are held/cancelled while independent parallel branches continue.
  - Confirm concurrency cap: set a max parallel stage count and verify it is respected under load.
  - Confirm cancellation propagates correctly through the dependency graph.
- [ ] **Log streaming sequence offsets**:
  - Each persisted log line must carry a monotonically increasing `seq` offset.
  - On WebSocket reconnect mid-build, the client must request logs from `seq=N` and receive only lines after that offset — no gaps, no duplicates.
  - Test in `testing/integration/webSocketRealtimeStreaming.test.js`: drop the WebSocket connection mid-build and verify seamless resume.
- [ ] **SIGTERM graceful shutdown test**:
  - Send `SIGTERM` to the worker during a build; verify it drains its current job (or records a clean failure), then exits without leaving orphaned containers.

#### SHOULD
- [ ] **Observability and structured logging**:
  - Standardize JSON log output with fields: `timestamp`, `level`, `jobId`, `stage`, `subsystem`, `message`.
  - Expose a `/metrics` endpoint in Prometheus format covering: queue depth, active build count, worker concurrency, stage duration p50/p95, ack latency p95.
  - Add health probes: `/health/live` (process alive?) and `/health/ready` (queue and DB connection healthy?).
- [ ] **Kubernetes manifests review** (`k8s/`):
  - Add `livenessProbe` and `readinessProbe` to worker and API server deployments.
  - Set explicit `resources.requests` and `resources.limits` for all containers.
  - Verify `terminationGracePeriodSeconds` is long enough for in-flight builds to complete or checkpoint.
- [ ] **Database data model documentation** (`docs/schema.md`):
  - Verify a unique constraint on `webhook_delivery_id` exists in `backend/db.sql`.
  - Verify indexes on `build_id`, `stage_id`, `repository_id`, and `status` columns.
  - Run `testing/integration/dbQueryPerformance.test.js` and record `EXPLAIN ANALYZE` output.

---

### **Phase 5: Documentation, ADRs & Interview Defense**
> *Goal: Structure the repository for recruiter and interviewer evaluation, produce 10 ADRs, and master the verbal defense.*

#### MUST
- [ ] **Restructure README.md** — new order:
  1. One-line description + live deployment URL.
  2. Architecture diagram: GitHub -> Ingress -> API Gateway (HMAC check) -> Redis/BullMQ -> Worker -> DAG Scheduler -> Docker Sandbox -> MinIO Cache -> PostgreSQL -> Socket.IO log stream -> Preview route.
  3. Three key verified numbers with citations to `benchmarks.md`.
  4. The full pipeline flow numbered 1-5: webhook arrives and is acknowledged, job queued and picked up, stages run in dependency order, logs stream and persist, result returned as PR comment or preview or revert.
  5. Quickstart local installation guide.
  6. Move long feature tables to `docs/`.
- [ ] **Create structured `docs/` library**:
  - `architecture.md`: component diagram + 5 numbered sequence diagrams:
    1. Signed webhook arrives, is verified, acknowledged, and enqueued.
    2. Worker picks up job and DAG scheduler resolves stage execution order.
    3. Build stage runs in a Docker sandbox with tmpfs workspace and MinIO cache.
    4. Logs stream from container stdout to browser via Socket.IO.
    5. Build result posted as GitHub PR comment; auto-revert triggered on failure.
  - `decisions/`: 10 Architecture Decision Records (ADRs) with Context, Alternatives, Trade-offs:
    1. BullMQ vs Kafka vs RabbitMQ vs SQS for the job queue.
    2. DAG scheduling via Kahn's algorithm vs topological sort via DFS.
    3. tmpfs workspaces vs host disk for build isolation.
    4. zstd vs gzip for dependency cache compression.
    5. Docker socket on the worker vs rootless Docker vs Sysbox vs Kaniko.
    6. Shared MinIO cache vs per-build fresh installs.
    7. At-most-once Socket.IO Pub/Sub for log streaming vs durable Kafka log topics.
    8. Shallow clone vs full clone for Git ingestion.
    9. Serving previews from same origin vs isolated sandbox subdomain.
    10. K3s vs full Kubernetes vs Docker Compose for the deployment target.
  - `benchmarks.md`: all 8 claimed metrics with test method, machine hardware, reproducible command line, raw output, and final number.
  - `threat-model.md`: (from Phase 3).
  - `limitations.md`: at-most-once log delivery, Docker socket root equivalence, tmpfs memory competition under load, single-node Redis SPOF, no hardware-level sandbox isolation.
  - `state-machine.md`: (from Phase 2).
- [ ] **Finalize resume bullet points** using `Action + Technical Mechanism + Measured Metric`:
  - `Built container-based CI/CD system on K3s: signed GitHub webhooks, BullMQ queue, DAG-scheduled Docker stages, MinIO dependency cache; sustained [N] webhooks/sec with 0 duplicate builds across [M] redeliveries.`
  - `Scheduled multi-stage pipelines with DFS cycle detection and parallel frontier execution ([k]x faster than sequential on [benchmark]).`
  - `Isolated untrusted builds with non-root containers, memory/CPU/PID limits, timeouts, and restricted network; verified by [N] sandbox tests.`
  - Replace all bracketed placeholders with real measured values.
- [ ] **Rehearse the verbal defense**:
  - 2-minute elevator pitch (use the MagnusCI pitch template from the guide).
  - 5-minute whiteboard walkthrough: draw all components, number the 5 flows, narrate each.
  - Drill the 20+ technical questions from the guide's Section 9 without freezing.

---

## Definition of Done Checklist

| Deliverable | Target Requirement | Status |
| :--- | :--- | :---: |
| **Claim Integrity** | Every metric backed by a reproducible benchmark script with saved raw output | [ ] |
| **Idempotency** | Zero duplicate builds across N webhook redeliveries, verified by replay test | [ ] |
| **Sandbox Security** | Non-root execution, resource limits, egress policy verified; threat model written | [ ] |
| **Preview Isolation** | Previews served from a separate origin with CSP; session cookies absent | [ ] |
| **Scheduler Correctness** | Cycle rejection, failure propagation, cancellation, and concurrency cap all tested | [ ] |
| **Log Streaming** | Sequence offsets enable gap-free resume after disconnect; test passing | [ ] |
| **Continuous Integration** | MagnusCI builds and tests itself; CI badge in README | [ ] |
| **Documentation Standards** | Restructured README; `docs/` with 10 ADRs, benchmarks, threat model, limitations | [ ] |
| **Presentation Mastery** | 2-min pitch, 5-min whiteboard walkthrough, Section 9 questions mastered | [ ] |

---

## Vocabulary to Fix Before Interviews

| Avoid Using | Replace With | Rationale |
| :--- | :--- | :--- |
| `enterprise-grade` / `production-ready` | `deployed at [URL], tested across [N] suites` | Concrete facts carry more weight than buzzwords. |
| `zero latency` / `instant` / `guaranteed` | `p95 of [X] ms, measured by [method]` | Queued systems have non-zero end-to-end latency. |
| `backpressure` (for unbound buffers) | `concurrency cap + bounded queue with 429 at limit` | Only use backpressure if there is a defined saturation response. |
| `deadlock-free` (DAG scheduler) | `circular dependency rejected at validation; starvation still possible` | Acyclic graph prevents circular wait, not starvation. |
| `SSL termination` (if live URL is HTTP) | Remove the claim or add the cert | False claims undermine interviewer trust in everything else. |
| `Redlock` (single Redis node) | `Redis lock with TTL` | Redlock is multi-master consensus across 3+ independent nodes. |

---

## STRETCH Items (Post-Milestone)

- [ ] **Kubernetes Jobs design note** (`docs/decisions/k8s-jobs-vs-docker.md`): Evaluate running each build as an ephemeral Kubernetes Job with a dedicated pod vs the current long-lived worker model — isolation, scheduling overhead, and cleanup trade-offs.
- [ ] **LLM-based build failure explainer**: post a plain-English summary of the failing test output as a GitHub PR comment alongside the raw logs — evaluate accuracy and latency constraints.
- [ ] **Redis Streams for log durability** (`docs/decisions/log-streams-vs-pubsub.md`): evaluate replacing Socket.IO Pub/Sub with Redis Streams consumer groups for at-least-once log delivery with guaranteed offset replay.
