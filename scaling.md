# Zero-Cost Kubernetes Scaling - Implementation Record

This document outlines the three major architectural refactorings applied to the MagnusCI backend to transition from a single-node local execution model to a horizontally scalable Kubernetes-native architecture at **$0 infrastructure cost**.

---

## What is Kubernetes (k8s)?

**Kubernetes** (often abbreviated as **k8s**) is an open-source container orchestration platform originally designed by Google. It automates the deployment, scaling, management, and networking of containerized applications across a cluster of machines.

### Core Kubernetes Concepts Used in MagnusCI:
* **Pods:** The smallest deployable computing units in Kubernetes, running one or more containers (e.g., your `magnus-api` gateway container).
* **Deployments:** Declarative specifications that manage a set of identical Pods, ensuring self-healing and zero-downtime rolling updates.
* **Jobs:** Workloads that run a short-lived task to completion and then exit. We use **Kubernetes Jobs** for dynamic, ephemeral CI/CD build sandboxes!
* **Horizontal Pod Autoscaler (HPA):** Automatically increases or decreases the number of Pod replicas based on CPU/Memory load.
* **Services & Ingress:** Manage internal cluster networking and route external traffic (HTTP & WebSockets) to the correct Pods.
* **PersistentVolumes (PV / PVC):** Provide persistent storage for databases (PostgreSQL, Redis) and object caches (MinIO).

### Why Kubernetes for MagnusCI?
In a single-host setup, running 100 concurrent build containers can overwhelm local CPU, memory, and disk sockets (`/var/run/docker.sock`). Kubernetes allows MagnusCI to distribute builds across a pool of nodes (cluster), automatically scale services when traffic spikes, and isolate user builds securely.

---

## Step 1: Real-Time WebSockets across Scaled API Pods

### The Problem
When scaling the API Gateway (`magnus-api`) using a Horizontal Pod Autoscaler (HPA), multiple pods handle traffic simultaneously. 
* **Previous State:** Socket.io was attached to a single Node.js process. If a build log event fired on Pod A, it could only be sent to clients directly connected to Pod A. Clients connected to Pod B would miss the update.

### The Solution
We integrated the **Socket.io Redis Pub/Sub Adapter**.
* **Current State:** By installing `@socket.io/redis-adapter` and `redis`, we connected the Socket.io server in `index.js` to a centralized Redis cluster. Now, when any worker or API pod emits an event, it publishes to Redis, which automatically broadcasts the message to all connected clients across *every* scaled pod instance seamlessly.

**Modified File:** [`backend/src/index.js`](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/index.js)

---

## Step 2: Serverless Ephemeral Kubernetes Jobs (Replacing Docker Socket)

### The Problem
The background worker relied on direct access to the host's Docker daemon.
* **Previous State:** The worker used the `dockerode` library and mounted `/var/run/docker.sock` to spawn containers. This posed massive security risks (container-escape vulnerabilities) and prevented horizontal scaling because a pod on Node 1 could not spawn containers on Node 2.

### The Solution
We abstracted container execution to use the native Kubernetes API.
* **Current State:** We installed `@kubernetes/client-node` and created a runner abstraction that dynamically spawns native **Kubernetes `Job` Pods**. Each build stage runs in its own ephemeral pod that automatically cleans itself up (`ttlSecondsAfterFinished: 120`) upon completion. The worker nodes no longer need Docker socket privileges.

**New File:** [`backend/src/runners/k8sRunner.js`](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/runners/k8sRunner.js)

---

## Step 3: Shared Object Storage for Dependency Caches

### The Problem
Dependency caches (like `package-lock.json` tarballs) were saved locally to the container's disk.
* **Previous State:** Caches were stored in the `backend/caches/` directory. If Worker Pod 1 built a project and saved its cache to local disk, Worker Pod 2 could not access that cache for the next build, rendering dependency caching useless in a scaled environment.

### The Solution
We integrated an S3-compatible client to store artifacts in a self-hosted MinIO object storage cluster.
* **Current State:** We installed `@aws-sdk/client-s3` and created an `s3Cache.js` module. All dependency tarballs are now streamed directly to the centralized, zero-cost MinIO cluster. Any worker pod across the entire Kubernetes network can now fetch and restore caches globally, ensuring consistently fast build times.

**New File:** [`backend/src/utils/s3Cache.js`](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/utils/s3Cache.js)

---

## Conclusion
With these three code modifications, the MagnusCI core execution loop is now entirely decoupled from single-node local constraints. The architecture is stateless, event-driven, and perfectly suited for cloud-native Kubernetes orchestration without relying on expensive managed AWS services.
