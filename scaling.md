# Zero-Cost Kubernetes Scaling & Deployment — Master Guide

This document records the complete architecture design, backend refactoring, test suite verification, containerization, and live production Kubernetes cluster deployment for **MagnusCI** at **$0 infrastructure cost**.

---

## 1. What is Kubernetes (k8s) & Why Use It?

**Kubernetes** is an open-source container orchestration platform designed by Google. It automates deployment, horizontal scaling, failover, and networking across a pool of compute machines (a cluster).

### Core Concepts in MagnusCI:
* **Pods:** The smallest unit in Kubernetes, wrapping container instances (e.g. `magnus-api`, `redis`).
* **Deployments:** Manages pod replicas with self-healing capabilities.
* **Kubernetes Jobs:** Ephemeral workloads running a task to completion and exiting. Used in MagnusCI for dynamic CI/CD build sandboxes!
* **Horizontal Pod Autoscaler (HPA):** Auto-scales `magnus-api` from 2 to 10 replicas based on CPU/Memory load.
* **Services & Ingress:** Handles internal routing and terminates external HTTP/WebSocket SSL traffic.
* **PersistentVolumeClaims (PVC):** Manages disk storage for PostgreSQL and MinIO object caches.

---

## 2. The 3 Backend Code Scaling Refactorings

### Step 1: Real-Time WebSockets across Scaled API Gateway Pods
* **Problem:** Scaling `magnus-api` across multiple pods meant Socket.io clients connected to Pod A would miss build log events emitted on Pod B.
* **Solution:** Installed `@socket.io/redis-adapter` and `redis`. Connected `index.js` to a centralized Redis Pub/Sub channel so WebSocket messages automatically broadcast across all gateway replicas.
* **File Modified:** [`backend/src/index.js`](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/index.js)

### Step 2: Serverless Ephemeral Kubernetes Jobs (Replacing Host Docker Socket)
* **Problem:** `worker.js` mounted `/var/run/docker.sock` directly on the host, causing container breakout security risks and preventing multi-node cluster scaling.
* **Solution:** Installed `@kubernetes/client-node` and built a dynamic runner abstraction that spawns short-lived Kubernetes `Job` pods per build stage with auto-cleanup (`ttlSecondsAfterFinished: 120`).
* **New File:** [`backend/src/runners/k8sRunner.js`](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/runners/k8sRunner.js)

### Step 3: Shared Object Storage for Dependency Caching (MinIO S3)
* **Problem:** Dependency tarball caches were saved to local container disk (`backend/caches/`), making caches inaccessible to other worker pods.
* **Solution:** Installed `@aws-sdk/client-s3` and built `s3Cache.js` to stream tarball archives directly to an in-cluster **MinIO** instance, enabling global cache restoration across all pods.
* **New File:** [`backend/src/utils/s3Cache.js`](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/utils/s3Cache.js)

---

## 3. Kubernetes Declarative Blueprints (`k8s/`)

We created 7 declarative YAML blueprints in [`k8s/`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s):
* [`k8s/postgres.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/postgres.yaml) — PostgreSQL DB Deployment & PVC.
* [`k8s/redis.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/redis.yaml) — Redis Queue & WebSocket Pub/Sub broker.
* [`k8s/minio.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/minio.yaml) — MinIO S3 Object Storage Deployment & PVC (5GB).
* [`k8s/magnus-api.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/magnus-api.yaml) — Express API Gateway Deployment (2 replicas).
* [`k8s/magnus-worker.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/magnus-worker.yaml) — Background Worker Daemon.
* [`k8s/hpa.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/hpa.yaml) — HPA auto-scaler (2-10 replicas, 70% CPU threshold).
* [`k8s/ingress.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/ingress.yaml) — Nginx Ingress routing for HTTP & WebSockets with Let's Encrypt TLS.
* [`k8s/README.md`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/README.md) — Comprehensive deployment guide.

---

## 4. Containerization

Created [`backend/Dockerfile`](file:///Users/amankashyap/Documents/ci-cd-engine/backend/Dockerfile):
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5001
CMD ["node", "src/index.js"]
```

---

## 5. Automated Test Suite Verification

We created 3 unit test suites inside [`testing/unit/`](file:///Users/amankashyap/Documents/ci-cd-engine/testing/unit):
* [`k8sRunner.test.js`](file:///Users/amankashyap/Documents/ci-cd-engine/testing/unit/k8sRunner.test.js) — Tests K8s Job manifest creation, status polling, and error handling.
* [`s3Cache.test.js`](file:///Users/amankashyap/Documents/ci-cd-engine/testing/unit/s3Cache.test.js) — Tests MinIO S3 tarball uploads/downloads and 404 cache misses.
* [`socketRedisAdapter.test.js`](file:///Users/amankashyap/Documents/ci-cd-engine/testing/unit/socketRedisAdapter.test.js) — Tests Redis client setup for Socket.io.

### Test Execution Results (`npm run test:unit`):
```text
PASS unit/socketRedisAdapter.test.js
PASS unit/k8sRunner.test.js
PASS unit/s3Cache.test.js
PASS unit/dag.test.js
PASS unit/brutal-edge-cases.test.js
PASS unit/cache.test.js
PASS unit/logParser.test.js

Test Suites: 7 passed, 7 total
Tests:       42 passed, 42 total
Time:        4.688 s
```

---

## 6. Live Production Kubernetes Deployment & Troubleshooting (Azure VM)

### Deployment Architecture
* **Target Host:** Azure VM (`azureuser@4.145.89.253`)
* **Kubernetes Distribution:** **k3s** (Lightweight CNCF Kubernetes engine)

### Real-World Issues Diagnosed & Resolved

1. **Kernel Inotify Watcher Limit ("Too many open files")**:
   * *Diagnosis:* `k3s` failed to start with `error creating fsnotify watcher: too many open files`.
   * *Fix:* Configured Linux kernel sysctl parameters in `/etc/sysctl.conf`:
     ```bash
     sudo sysctl fs.inotify.max_user_watches=524288
     sudo sysctl fs.inotify.max_user_instances=8192
     sudo sysctl -p
     ```
2. **Disk Space Exhaustion (`no space left on device`)**:
   * *Diagnosis:* Docker build failed due to accumulated stopped containers from legacy build runs.
   * *Fix:* Pruned legacy containers and reclaimed **23 GB of disk space** (reduced disk usage from 79% to 19%).

### Final Live Cluster Status (`kubectl get pods -o wide`)

```text
NAME                             READY   STATUS    RESTARTS   AGE   IP           NODE
magnus-api-5dbbcbdd7-4ckqx       1/1     Running   0          49s   10.42.0.26   magnus-ci-server
magnus-api-5dbbcbdd7-fhdbg       1/1     Running   0          51s   10.42.0.24   magnus-ci-server
magnus-worker-84679cf44c-5n47l   1/1     Running   0          51s   10.42.0.25   magnus-ci-server
minio-8677554f9b-z4blj           1/1     Running   0          53s   10.42.0.27   magnus-ci-server
postgres-774c9f7f58-rp7mb        1/1     Running   0          22m   10.42.0.18   magnus-ci-server
redis-88f6ffbc8-xskhk            1/1     Running   0          22m   10.42.0.15   magnus-ci-server
```

---

## 7. Summary Comparison

| Aspect | Previous State | Current State (Kubernetes) |
| :--- | :--- | :--- |
| **Orchestration** | Single host VM via PM2 | **k3s Kubernetes Cluster** with self-healing pods |
| **Gateway Scaling** | Single Node.js process | **2–10 Auto-scaled `magnus-api` Pods** via HPA |
| **WebSockets** | Isolated to single process | **Redis Pub/Sub Adapter** broadcasting across all pods |
| **Build Execution** | Unsafe `/var/run/docker.sock` | **Dynamic, ephemeral K8s Job Pods** (auto-deleting) |
| **Cache Storage** | Local disk (`backend/caches/`) | **Centralized MinIO S3 Object Storage** (in-cluster) |
| **Infrastructure Cost** | Paid cloud services envisioned | **100% Free ($0/month)** self-hosted k3s ecosystem |
