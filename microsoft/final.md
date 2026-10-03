# Final Phase — STAR Synthesis & Rapid Battlecards

**Subsystems Covered:** Cross-Phase Synthesis (Phases 0–5)  
**Role in Interview:** **Secondary Project** (Rapid visual review in 3 minutes)  
**Target Role:** Microsoft Software Engineering Internship Interview  
**Core Purpose:** Consolidated cheatsheet containing the 60-Second Whiteboard Master Blueprint, Top 6 Socratic Gotcha Questions Matrix, 10-Minute Rapid Review Cheat Sheet, and rehearsable STAR elevator pitch.

---

## 1. 60-Second Whiteboard Master Blueprint

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                         MAGNUSCI 60-SECOND WHITEBOARD MASTER BLUEPRINT                           │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

 [ GitHub Push Webhook ] ──► (HMAC SHA-256 / crypto.timingSafeEqual / Loop Circuit Breaker)
                                          │
                                          ▼ Ingress < 10ms (HTTP 202 Accepted)
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │ 1. INGRESS & QUEUE LAYER                                                               │
 │ • Express Gateway (index.js) ──► Redis 7 / BullMQ (queue.js)                           │
 │ • Absorbs bursts; buffers jobs in RAM; protects worker capacity                        │
 └────────────────────────────────────────┬───────────────────────────────────────────────┘
                                          │ Worker Pull (concurrency: 1)
                                          ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │ 2. DAG SCHEDULER (dag.js)                                                              │
 │ • Upfront Kahn's / DFS Cycle Validation in O(V+E) before container allocation          │
 │ • Reactive Promise.race() event loop: stages execute concurrently & unblock dynamically│
 └────────────────────────────────────────┬───────────────────────────────────────────────┘
                                          │ runStage(name, config)
                                          ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │ 3. HARDENED DOCKER SANDBOX (worker.js)                                                 │
 │ • Workspace Allocator: RAM disk /dev/shm (>= 256MB free) fallback to NVMe /tmp         │
 │ • cgroups v2: 1GB-2GB RAM | 1.0 vCPU | 100-512 PIDs (Fork bomb & OOM containment)      │
 │ • Non-root execution (UID 1001), CapDrop: ALL, no-new-privileges                       │
 │ • AutoRemove: false + deterministic finally { container.remove({ force: true }) }      │
 └────────────────────────────────────────┬───────────────────────────────────────────────┘
                                          │ Stdout / Stderr Streams
                                          ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │ 4. CACHING, STREAMING & PERSISTENCE                                                    │
 │ • CAS Cache: SHA-256(lockfile) ──► zstd -T0 -3 ──► MinIO S3 (1.2 GB/s unpack, 90% cut)│
 │ • Log Streamer: Redis Pub/Sub ──► Socket.io / SSE ──► Browser xterm.js (< 50ms push)   │
 │ • Database: PostgreSQL 16 (25-connection pool, 1000ms debounced log updates)           │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The 60-Second STAR Elevator Pitch (Secondary Project)

### Situation & Task
> *"I built MagnusCI as a container-based CI/CD orchestration engine to get hands-on with the hard infrastructure problems behind platforms like GitHub Actions: specifically, how to execute multi-stage DAG pipelines with arbitrary dependencies while safely isolating untrusted user build scripts inside resource-constrained Linux containers."*

### Action
> *"The core is a custom topological DAG scheduler. Before provisioning any host resources, it runs a Kahn's / DFS cycle detection pass in $O(V+E)$ time to fail invalid pipelines fast. For execution, rather than using a rigid wave-based scheduler that blocks on the slowest stage, I engineered a dynamic reactive event loop using `Promise.race()`. The instant any individual stage completes, ready downstream stages launch immediately.  
> Each stage executes inside an ephemeral Docker container spawned via Dockerode, hardened with Linux cgroups: a 1GB-2GB RAM ceiling, a 1.0 CPU quota, and a 100-512 PID limit to neutralize fork bombs. Workspaces are allocated directly in Linux kernel RAM (`/dev/shm`) when headroom exists, accelerating builds by 3x. One critical bug I personally diagnosed: Docker's `AutoRemove: true` destroyed short-lived containers before Node.js finished draining asynchronous stdout streams. I redesigned the lifecycle with `AutoRemove: false` and moved container removal into a deterministic `finally` block to guarantee 100% log capture."*

### Result
> *"Under load, BullMQ queues absorbed 50-webhook bursts in under 10ms without dropping requests, while S3 dependency caching with multi-threaded Zstandard compression cut stage startup times from 35 seconds to 2.8 seconds."*

---

## 3. Top 6 Socratic Gotcha Questions Matrix

| # | Socratic Gotcha Question | The Core Trap | The Exact Engineering Answer |
| :-: | :--- | :--- | :--- |
| **1** | *"Why DFS / Kahn's instead of just letting stages run until a cycle fails?"* | Trap: Assuming runtime timeout is an acceptable cycle detector. | *"A circular dependency without upfront validation hangs the runner indefinitely, starving a BullMQ worker slot for 5+ minutes. An $O(V+E)$ check validates the graph in sub-millisecond time before allocating workspaces or containers."* |
| **2** | *"What happens to a running container if the worker pod is killed mid-build?"* | Trap: Assuming Docker containers automatically die when Node.js dies. | *"Docker daemon runs on the host VM, independent of the worker pod. When Kubernetes kills the pod, the container continues running. BullMQ's stalled watchdog detects the expired 300s lock after 30s and re-queues the build. A cron script prunes orphaned containers."* |
| **3** | *"Can an untrusted build script escape the workspace bind mount via a symlink?"* | Trap: Confusing host filesystem resolution with container mount namespaces. | *"No. The bind mount is attached inside the container's root namespace (`/workspace`). A symlink pointing to `../../../../etc/shadow` resolves relative to the container's Alpine root filesystem, completely unaware of the host."* |
| **4** | *"What if an attacker tampers with or corrupts a cached dependency tarball?"* | Trap: Assuming corrupt cache archives will crash or compromise the build. | *"Decompression (`zstd -dc -T0 \| tar -xf -`) exits with an error code on corrupted blocks. `zstdCache.js` catches this in a `try/catch` block, purges the directory, and falls back to a clean package install. Caching fails open safely."* |
| **5** | *"Does your auto-revert bot push directly to main, and could that cause races?"* | Trap: Ignoring concurrent Git pushes and branch protection risks. | *"The bot runs `git revert --no-commit <commitSha>` and targets the exact failed commit. If another developer pushed to `main` concurrently, Git's non-fast-forward rejection aborts the push safely. In production, this should open a Pull Request instead."* |
| **6** | *"If Redis is single-threaded, won't high-frequency build logs starve queue jobs?"* | Trap: Assuming a shared Redis instance has unlimited event-loop capacity. | *"Yes, high-volume Pub/Sub can compete with BullMQ Lua scripts. We mitigated this by debouncing DB log writes to 1000ms and batching socket chunks. In enterprise production, we'd split Redis into two instances: one for queues, one for Pub/Sub."* |

---

## 4. 10-Minute Rapid Review Cheat Sheet

| Category | Component / Feature | Measured Number / Algorithmic Primitive | Source File Reference |
| :--- | :--- | :--- | :--- |
| **Scheduling** | Graph Cycle Check | **$O(V + E)$** Linear Time (Kahn's & DFS `recStack`) | `backend/src/pipeline/dag.js` |
| **Scheduling** | Stage Execution Loop | **Reactive `Promise.race()`** (Dynamic zero-delay unblock) | `backend/src/pipeline/dag.js` |
| **Sandboxing** | Memory cgroup Limit | **1GB - 2GB RAM Hard Cap** (`Memory: 1073741824`) | `backend/src/worker.js` |
| **Sandboxing** | CPU cgroup Quota | **1.0 vCPU Ceiling** (`CpuQuota: 100000`, `CpuPeriod: 100000`)| `backend/src/worker.js` |
| **Sandboxing** | Process Ceiling | **100 - 512 PIDs Limit** (Fork bomb neutralization) | `backend/src/worker.js` |
| **Sandboxing** | RAM Disk Allocator | **/dev/shm tmpfs** ($\ge 256\text{MB}$ free headroom, 3x I/O)| `backend/src/pipeline/workspaceAllocator.js` |
| **Queueing** | Ingress Latency | **$< 10\text{ ms}$** (HTTP 202 Accepted async decoupling) | `backend/src/index.js` |
| **Queueing** | Stalled Job Watchdog | **300s TTL Lock**, **30s Polling Check** (Self-healing) | `backend/src/queue/queue.js` |
| **Persistence**| Database Pool | **25 Clients**, **2000ms Timeout** (Fail-fast guard) | `backend/src/db.js` |
| **Persistence**| Log Write Debounce | **1000ms Interval** (95% SQL write IOPS reduction) | `backend/src/worker.js` |
| **Caching** | Compression Engine | **`zstd -T0 -3`** ($> 1200\text{ MB/s}$ multi-core unpack) | `backend/src/pipeline/zstdCache.js` |
| **Caching** | Stage Startup Time | **35s $\rightarrow$ 2.8s** (90% reduction on warm S3 cache hit) | `backend/src/pipeline/s3Cache.js` |
| **Security** | Webhook Auth | **HMAC-SHA256 via `crypto.timingSafeEqual`** on `rawBody` | `backend/src/middleware/webhookSignature.js` |
| **Security** | Loop Circuit Breaker | **`headCommit.author.name === 'Magnus CI'`** (Drop webhook) | `backend/src/controllers/webhooksController.js` |
| **Deployment** | Cluster Topology | **Oracle Cloud Ubuntu VM (K3s + Nginx Reverse Proxy)** | `k8s/` & `deploy.sh` |
| **Frontend** | Log Virtualization | **CSS `content-visibility: auto`** (60 FPS, 0 KB bundle) | `frontend/src/index.css` |