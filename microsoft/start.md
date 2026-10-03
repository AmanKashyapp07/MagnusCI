# start.md — Master Interview Strategy for MagnusCI (Secondary Project)

**Candidate:** Aman Kashyap (IIIT Allahabad, B.Tech IT, LeetCode Knight, Codeforces Specialist)  
**Target Role:** Microsoft Software Engineering Internship Interview  
**Project Role:** **MagnusCI is my SECONDARY project.**  
- **Flagship Project:** **NexusIDE** (Primary focus: 75–80% of interview time).
- **Secondary Project:** **MagnusCI** (Target focus: 5–10 minutes maximum).
- **Preparation Goal:** Review this entire directory in **15–20 minutes of rapid visual review**.

---

## 1. Fast 15-Minute Revision Roadmap

| Document | Subsystems Covered | Target Review Time | Primary Visual Artifact |
| :--- | :--- | :---: | :--- |
| **`p0.md`** | Ownership, Boundaries & Honesty | **2 mins** | Candidate vs AI boundary box & Top 3 bug flowcharts |
| **`p1.md`** | DAG Scheduler & Cycle Detection | **3 mins** | Multi-stage parallel DAG & Kahn's cycle detection flowchart |
| **`p2.md`** | BullMQ Queue & Concurrency Pool | **3 mins** | BullMQ state machine & stalled-job heartbeat watchdog |
| **`p3.md`** | Docker Sandboxing & Security Limits | **3 mins** | Container hardening diagram & fork bomb / OOM flowcharts |
| **`p4.md`** | Log Streaming & CAS zstd Caching | **3 mins** | Log duplex piping diagram & SHA-256 CAS S3 flowchart |
| **`p5.md`** | K3s Infrastructure & Deployment | **2 mins** | K3s VM topology box & CSS log virtualization matrix |
| **`final.md`**| 60s Blueprint & Gotcha Matrix | **3 mins** | 60-second whiteboard blueprint & Top 6 gotcha questions |
| **`r2.md`** | Resume Tech Stack & Line-by-Line Defense | **5 mins** | Complete "Why This? Why Not That?" for all resume keywords |
| **`questions.md`**| Top 18 Deep-Dive Systems Q&As | **Reference** | 18 high-impact technical answers in PREP format |
| **`questions2.md`**| 30 High-Yield Behavioral & Systems Q&As | **5 mins** | 30 questions across 5 tiers: architecture, trade-offs, bugs, & AI defense |

---

## 2. The 4 Resume Bullets: What the Interviewer Might Ask

Your resume contains 4 core bullets for MagnusCI. Here is the rapid mapping to the visual battlecards:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                         RESUME BULLET ──► PHASE DOCUMENT MAPPING                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

 [ 1. DAG Scheduler & Cycle Detection ] ──────────────► See p1.md
   • Kahn's / DFS O(V+E) cycle detection; reactive Promise.race() dynamic stage unblocking.

 [ 2. BullMQ Redis Queue & Concurrency ] ─────────────► See p2.md
   • Async webhook decoupling (<10ms HTTP 202); 300s TTL lock; 30s stalled watchdog recovery.

 [ 3. Ephemeral Docker Sandboxing & cgroups ] ────────► See p3.md
   • 1GB RAM cap, 1.0 CPU quota, 100 PIDs limit, non-root UID 1001, /dev/shm tmpfs RAM disk.

 [ 4. Real-time Streaming & CAS Caching ] ────────────► See p4.md
   • zstd -T0 -3 S3 caching (35s -> 2.8s); Redis Pub/Sub; 1000ms DB debouncing (95% IOPS cut).
```

---

## 3. The 60-Second Interview Anchor Pitch

If the interviewer asks: *"Tell me about MagnusCI,"* deliver this 60-second summary:

> *"I built MagnusCI as a container-based CI/CD orchestration engine to explore the infrastructure challenges behind platforms like GitHub Actions: specifically, how to execute multi-stage DAG pipelines with arbitrary dependencies while safely isolating untrusted build scripts inside Linux containers.  
> The core is a custom topological DAG scheduler. It validates pipeline graphs against cycles in $O(V+E)$ time upfront, then executes stages dynamically using a reactive `Promise.race()` event loop so downstream jobs launch the instant their parents finish.  
> Each stage executes inside an ephemeral Docker container constrained by Linux cgroups: a 1GB RAM hard cap, a 1.0 CPU quota, and a 100 PID limit to neutralize fork bombs. Workspaces are allocated in Linux tmpfs (`/dev/shm`) for 3x I/O speedups. Webhook ingestion is decoupled via Redis BullMQ queues, while dependency caching with multi-threaded Zstandard cut stage startup times from 35s to 2.8s."*

---

## 4. Final Sanity Checklist Before the Interview

- [ ] Can you whiteboard Kahn's cycle detection ($O(V+E)$ with in-degree array) in 30 seconds? (`p1.md`)
- [ ] Can you explain what happens when a container hits its 1GB RAM limit (Kernel OOM Killer sends SIGKILL, container exits with code 137)? (`p3.md`)
- [ ] Can you explain why we set `AutoRemove: false` (to prevent Docker from destroying the container before Node.js drains stdout streams)? (`p0.md`)
- [ ] Can you explain how BullMQ recovers when a worker pod crashes mid-build (300s TTL lock expires, 30s stalled check re-queues job)? (`p2.md`)
- [ ] Can you explain why `crypto.timingSafeEqual` is used on `req.rawBody` for webhook auth? (`p0.md` & `p4.md`)