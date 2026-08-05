# Zero-Cost Kubernetes Scaling, CI/CD Engine & DevOps — Master Architecture Guide

This document records the complete architectural design, backend scaling refactoring, Kubernetes orchestration, zero-downtime deployment pipeline, master test suite, and resilient DevOps practices for **MagnusCI** running at **$0 infrastructure cost**.

---

## 1. Core Architecture & Kubernetes Topology

**MagnusCI** is an enterprise-grade, event-driven CI/CD execution platform built on Node.js, PostgreSQL, Redis, Docker, and Kubernetes (`k3s`).

```
                    ┌─────────────────────────────────────────┐
                    │          Nginx Ingress Controller       │
                    │           http://magnus-ci.online       │
                    └────────────────────┬────────────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
      ┌─────────────────────────┐                 ┌─────────────────────────┐
      │  magnus-api (Pod 1)     │                 │  magnus-api (Pod 2)     │
      └────────────┬────────────┘                 └────────────┬────────────┘
                   │                                           │
                   └─────────────────────┬─────────────────────┘
                                         │
                          ┌──────────────┴──────────────┐
                          ▼                             ▼
                 ┌─────────────────┐           ┌─────────────────┐
                 │ PostgreSQL (DB) │           │  Redis (Broker) │
                 └─────────────────┘           └────────┬────────┘
                                                        │ (Build Queue & Pub/Sub)
                                                        ▼
                                           ┌─────────────────────────┐
                                           │  magnus-worker (Pod)    │
                                           └────────────┬────────────┘
                                                        │ (Shared HostPath)
                                                        ▼
                                           ┌─────────────────────────┐
                                           │  Docker Sandbox Container│
                                           │  (/tmp/magnus-builds)   │
                                           └─────────────────────────┘
```

### Core Cluster Components:
* **Pods:** Ephemeral & persistent microservices (`magnus-api`, `magnus-worker`, `postgres`, `redis`, `minio`).
* **Deployments:** Manages pod replicas with automated self-healing and zero-downtime rolling updates.
* **Horizontal Pod Autoscaler (HPA):** Dynamically scales `magnus-api` from **2 to 10 replicas** based on CPU/Memory utilization (70% threshold).
* **Services & Ingress:** Directs incoming HTTP/WebSocket traffic across API replicas.
* **PersistentVolumeClaims (PVC):** Manages stateful storage for PostgreSQL (`postgres-pvc`) and MinIO Object Storage (`minio-pvc`).
* **HostPath Shared Volumes:** Shared host storage (`/tmp/magnus-builds`) enabling host Docker daemons to mount workspace directories created inside Kubernetes worker pods.

---

## 2. Backend Scaling Architecture & Code Refactorings

### 1. Multi-Pod Real-Time WebSockets (`@socket.io/redis-adapter`)
* **Problem:** When scaling `magnus-api` across multiple gateway pods, Socket.io clients connected to Pod A missed live build log broadcasts emitted from worker jobs processing on Pod B.
* **Solution:** Integrated `@socket.io/redis-adapter` backed by Redis. Socket events emitted from any worker pod are published to Redis Pub/Sub and broadcast seamlessly across all gateway instances.
* **File:** [`backend/src/index.js`](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/index.js)

### 2. Shared HostPath Volume Mounts for Docker-in-Docker Workspaces
* **Problem:** The worker container cloned git repositories to local `/tmp` directories. When spawning Docker containers via `/var/run/docker.sock`, the host Docker daemon attempted to mount `/tmp` from the VM host node, resulting in empty `/workspace` directories (`ENOENT: package.json`).
* **Solution:** Exposed `HOST_WORKSPACE_PATH=/tmp/magnus-builds` backed by a Kubernetes `hostPath` volume. The worker clones repositories into `/tmp/magnus-builds`, allowing the host Docker daemon to access and mount workspace directories cleanly.
* **Files:** [`backend/src/worker.js`](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/worker.js), [`k8s/magnus-worker.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/magnus-worker.yaml)

### 3. Shared MinIO S3 Object Storage for Dependency Caching
* **Problem:** Dependency tarball caches saved to local worker disk (`backend/caches/`) were inaccessible to other worker pods.
* **Solution:** Built `s3Cache.js` using `@aws-sdk/client-s3` to stream dependency tarballs to an in-cluster **MinIO S3** instance, allowing global cache restoration across all cluster nodes.
* **File:** [`backend/src/utils/s3Cache.js`](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/utils/s3Cache.js)

### 4. Non-Interactive Git Auto-Revert Engine
* **Problem:** Failed builds triggered Git auto-revert commits, but Git operations failed in non-TTY container environments due to interactive credential prompts (`No such device or address`) or `core.askPass` configuration blocks.
* **Solution:** Refactored `autoRevertService.js` to sanitize repository URLs, inject token authentication (`https://x-access-token:${token}@github.com/...`), and enforce non-interactive flags (`GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=echo`).
* **File:** [`backend/src/pipeline/autoRevertService.js`](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/pipeline/autoRevertService.js)

### 5. Log Parsing Engine & ANSI Color Rendering UI
* **Problem:** Raw log streams contained ANSI escape sequences and redundant `[STAGE]` tags on every line, cluttering the frontend UI modal.
* **Solution:** Updated `logParser.js` to categorize step sections cleanly and remove repetitive tags while preserving ANSI codes. Integrated `ansi_up` in `BuildModal.jsx` to render colorized terminal logs with dark-mode styling (`#0d0d0d`) and error/warning line highlights.
* **Files:** [`frontend/src/utils/logParser.js`](file:///Users/amankashyap/Documents/ci-cd-engine/frontend/src/utils/logParser.js), [`frontend/src/components/BuildModal.jsx`](file:///Users/amankashyap/Documents/ci-cd-engine/frontend/src/components/BuildModal.jsx)

---

## 3. Kubernetes Declarative Blueprints (`k8s/`)

The platform architecture is defined via 7 declarative Kubernetes YAML manifests in [`k8s/`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s):
* [`k8s/postgres.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/postgres.yaml) — PostgreSQL database deployment & PVC.
* [`k8s/redis.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/redis.yaml) — Redis build queue and Pub/Sub broker.
* [`k8s/minio.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/minio.yaml) — MinIO S3 object storage deployment & PVC (5GB).
* [`k8s/magnus-api.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/magnus-api.yaml) — Express API Gateway deployment (2 replicas).
* [`k8s/magnus-worker.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/magnus-worker.yaml) — Background worker daemon with `docker.sock` & `hostPath` mounts.
* [`k8s/hpa.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/hpa.yaml) — HPA auto-scaler (2–10 replicas, 70% CPU threshold).
* [`k8s/ingress.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/ingress.yaml) — Nginx Ingress routing for HTTP & WebSockets.

---

## 4. Automated Zero-Downtime Deployment (`./deploy.sh`)

Production deployments are automated via a single shell script (`./deploy.sh`):

1. **SSH Connectivity Check:** Validates access to the Azure VM (`azureuser@4.145.89.253`).
2. **Git Synchronization:** Fetches and checks out the latest commit on `main`.
3. **Container Image Build:** Multi-stage Docker build producing `amankashyap07/magnus-api:latest`.
4. **k3s Runtime Import:** Imports the updated image directly into `k3s` (`k3s ctr image import`).
5. **Zero-Downtime Rolling Update:** Executes `kubectl rollout restart` for `magnus-api` and `magnus-worker` deployments, ensuring 0 seconds of user downtime.
6. **Pod Health Verification:** Verifies pod status and IP allocation.

---

## 5. Master Test Orchestrator & E2E Verification (`./test.sh`)

The platform is continuously verified via `./test.sh`, which executes a 6-layer automated test pipeline:

```text
========================================================================
               MASTER TEST EXECUTION SUMMARY                            
========================================================================
 [1/6] Unit Test Suite (DAG Engine, Log Parser, S3 Cache, Redis Adapter) -> PASSED
 [2/6] Integration Test Suite (Express Security & Webhook HMAC)          -> PASSED
 [3/6] Live E2E Backend Deployment Suite (http://magnus-ci.online)      -> PASSED
 [4/6] Kubernetes Infrastructure Suite (Pod Health, Volumes, Nodes)      -> PASSED
 [5/6] Playwright Browser E2E Suite (Chromium UI & Workflow)            -> PASSED
 [6/6] Local Test Repository Suite (/Users/amankashyap/Documents/tes)   -> PASSED
========================================================================
 All 6/6 Test Suites Passed Successfully! (100% Pass Rate)
 Production Target: http://magnus-ci.online
========================================================================
```

---

## 6. Live Cluster Status (`kubectl get pods -o wide`)

```text
NAME                             READY   STATUS    RESTARTS   AGE     IP            NODE
magnus-api-7d46576dd6-hbpkb      1/1     Running   0          2m      10.42.0.109   magnus-ci-server
magnus-api-7d46576dd6-nzv64      1/1     Running   0          2m      10.42.0.107   magnus-ci-server
magnus-worker-86cfbb6f4d-2gdgz   1/1     Running   0          2m      10.42.0.108   magnus-ci-server
minio-8677554f9b-z4blj           1/1     Running   0          6h46m   10.42.0.27    magnus-ci-server
postgres-774c9f7f58-rp7mb        1/1     Running   0          7h8m    10.42.0.18    magnus-ci-server
redis-88f6ffbc8-xskhk            1/1     Running   0          7h8m    10.42.0.15    magnus-ci-server
```

---

## 7. Summary Architecture Comparison

| Feature / Aspect | Legacy System | Scaled Kubernetes Production System |
| :--- | :--- | :--- |
| **Orchestration** | Single PM2 process on VM | **k3s Kubernetes Cluster** with self-healing deployments |
| **Gateway Scaling** | Single instance | **2–10 Auto-scaled `magnus-api` Pods** via HPA |
| **WebSocket Events** | Single process memory | **Redis Pub/Sub Adapter** broadcasting across all pods |
| **Workspace Storage** | Local `/tmp` directory | **HostPath Shared Volume (`/tmp/magnus-builds`)** |
| **Dependency Cache** | Local `/backend/caches/` | **Centralized MinIO S3 Object Storage** |
| **Auto-Revert** | Interactive git command | **Non-interactive authenticated token engine** |
| **Log UI & Formatting**| Raw monochrome strings | **ANSI terminal color rendering & section parsing** |
| **Deployments** | Manual SSH / restarts | **Automated `./deploy.sh` zero-downtime rollout** |
| **Verification** | Basic manual checks | **6-layer Master Orchestrator (`./test.sh`)** |
| **Infrastructure Cost**| Paid cloud scaling models | **100% Free ($0/month)** self-hosted k3s ecosystem |
