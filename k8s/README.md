# MagnusCI Zero-Cost Kubernetes Deployment Guide

This directory contains the Kubernetes manifests required to deploy and scale **MagnusCI** horizontally on any CNCF-compliant Kubernetes cluster (e.g., **k3s**, **Minikube**, **Kind**, or **Oracle Cloud Always Free Tier**) at **$0 infrastructure cost**.

---

## 🏗️ Architecture Overview

```
                        ┌─────────────────────────────────┐
                        │   Nginx Ingress + cert-manager  │
                        │    (Let's Encrypt TLS - $0)     │
                        └──────────────┬──────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                │                                             │
      /socket.io & /api                                       │ /
                ▼                                             ▼
  ┌──────────────────────────┐                   ┌──────────────────────────┐
  │  magnus-api (HPA 2-10)   │                   │  magnus-frontend (Nginx) │
  └─────────────┬────────────┘                   └──────────────────────────┘
                │
        ┌───────┴───────────────┬───────────────────────┐
        ▼                       ▼                       ▼
  ┌───────────┐           ┌───────────┐           ┌───────────┐
  │ PostgreSQL│           │   Redis   │           │   MinIO   │
  │ (Stateful)│           │ (Queue)   │           │ (S3 Cache)│
  └───────────┘           └─────┬─────┘           └───────────┘
                                │
                                ▼
                      ┌───────────────────┐
                      │   magnus-worker   │
                      └─────────┬─────────┘
                                │ (K8s API)
                                ▼
                     ┌─────────────────────┐
                     │ Ephemeral K8s Jobs  │
                     │ (Build Sandboxes)   │
                     └─────────────────────┘
```

---

## 📂 Manifest Inventory

| File | Resource | Description |
| :--- | :--- | :--- |
| [`postgres.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/postgres.yaml) | Deployment, PVC, Service | Self-hosted PostgreSQL database with persistent local volume storage. |
| [`redis.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/redis.yaml) | Deployment, Service | Self-hosted Redis queue broker for BullMQ async build ingestion. |
| [`minio.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/minio.yaml) | Deployment, PVC, Service | Self-hosted MinIO object storage (S3 alternative) for dependency caches. |
| [`magnus-api.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/magnus-api.yaml) | Deployment, Service | Express.js API Gateway & WebSocket server with multi-replica setup. |
| [`magnus-worker.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/magnus-worker.yaml) | Deployment | Background daemon parsing queues and orchestrating build jobs. |
| [`ingress.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/ingress.yaml) | Ingress | Nginx Ingress routing HTTP & WebSocket traffic with Let's Encrypt TLS. |
| [`hpa.yaml`](file:///Users/amankashyap/Documents/ci-cd-engine/k8s/hpa.yaml) | HorizontalPodAutoscaler | Auto-scales `magnus-api` from 2 to 10 replicas based on CPU/RAM usage. |

---

## 🚀 Deployment Instructions ($0 Cost)

### Prerequisites

* A running Kubernetes cluster (**k3s** recommended for $0 cloud/local deployment).
* `kubectl` installed and configured.
* Nginx Ingress Controller installed (`kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml`).

---

### Step 1: Deploy In-Cluster Services (Database, Redis, MinIO)

```bash
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/minio.yaml
```

Verify pods are running:
```bash
kubectl get pods
```

---

### Step 2: Deploy MagnusCI Core (API Gateway & Worker)

```bash
kubectl apply -f k8s/magnus-api.yaml
kubectl apply -f k8s/magnus-worker.yaml
```

---

### Step 3: Enable Auto-Scaling & External Ingress

```bash
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/ingress.yaml
```

---

## 💡 Zero-Cost Scaling & Security Highlights

1. **Oracle Cloud Always Free Tier:** Host up to **4 Ampere OCPUs & 24 GB RAM** with zero monthly fees.
2. **MinIO Object Cache:** Replaces Amazon S3 for storing build tarballs and SHA-256 lockfile caches without cloud storage charges.
3. **K8s Ephemeral Jobs:** Replaces expensive container microVMs by spawning transient Kubernetes `Job` pods that self-clean after build completion (`ttlSecondsAfterFinished`).
4. **WebSocket Scaling:** Configured with `@socket.io/redis-adapter` for seamless real-time log streaming across multiple scaled API pods.
