# Deep Dive: Kubernetes (K8s) Architecture & Scaling Strategy

This document serves as an interview preparation guide to explain what Kubernetes (K8s) does, how the MagnusCI project maps to a K8s architecture, and how to pitch this deployment strategy to technical interviewers.

---

## 🧭 Part 1: What Does Kubernetes "Really" Do? (The Basics)

If you run a application with standard Docker, you are managing **individual containers manually**. If a container crashes, you have to manually restart it. If your server gets overloaded, you have to manually spin up another container and configure a load balancer to distribute the traffic.

**Kubernetes (K8s) is a Container Orchestrator.** It acts as the "Manager" or "Orchestra Conductor" for your container fleet. Instead of running commands manually, you tell Kubernetes: *"I want 3 copies of my API running at all times. Here is their image. Make it happen."* K8s constantly works in the background to maintain that "desired state."

### The 5 Core Jobs of Kubernetes:
1. **Self-Healing (Auto-Restart):** If one of your API container pods crashes or the underlying server node dies, Kubernetes immediately detects it, terminates the dead container, and spins up a brand-new one on a healthy machine automatically.
2. **Horizontal Auto-Scaling:** If your app gets hit with thousands of concurrent requests, Kubernetes can monitor the average CPU/RAM utilization and spin up more pods (replicas) of your application dynamically, shrinking them back down when traffic subsides.
3. **Internal Load Balancing & Service Discovery:** Kubernetes automatically gives each group of pods a single stable IP address and domain name (a "Service"). It automatically distributes traffic across your healthy pods.
4. **Declarative State Management:** You write `.yaml` configuration files describing what you want your environment to look like. K8s compares this configuration against the real-world cluster state and automatically aligns them.
5. **Rolling Updates (Zero-Downtime Deployments):** When you release version 2.0 of your app, Kubernetes doesn't shut down your website. It spins up a version 2.0 pod, waits for it to become healthy, routes traffic to it, and then terminates a version 1.0 pod. It does this one by one until the update is complete.

---

## 🏛️ Part 2: How MagnusCI Maps to Kubernetes

To make MagnusCI "cloud-ready," we created declarative manifests inside the `k8s/` directory. Here is what each file does:

| File Name | K8s Resource Type | Role in the System |
|---|---|---|
| **`postgres.yaml`** | `PersistentVolumeClaim`, `Deployment`, `Service` | Manages the PostgreSQL database. The `PVC` claims physical storage that persists even if the database container is restarted. |
| **`redis.yaml`** | `Deployment`, `Service` | Manages the Redis instance that holds our BullMQ job queues. |
| **`magnus-api.yaml`** | `Deployment` (2 Replicas), `Service` | Deploys 2 parallel pods of the Express API. K8s load balances incoming HTTP/Socket traffic between them. |
| **`magnus-worker.yaml`** | `Deployment`, `VolumeMount` | Runs the queue runner. Mounts `/var/run/docker.sock` from the host VM so it can execute test containers. |

---

## ⚠️ Part 3: PM2 (Local VM) vs. Kubernetes (Production Cloud)

### Why we did NOT run K8s on the live Azure Student VM:
* **Resource Limits:** Running Kubernetes (even small variants like Minikube, K3s, or MicroK8s) requires a significant amount of overhead. The K8s control plane requires a minimum of 1 GB to 2 GB of RAM just to keep itself running.
* **Our VM Tier:** The free **Azure for Students** tier limits us to basic B-series virtual machines (like B1s or B2s). Running Kubernetes on it would leave 0% RAM for PostgreSQL, Redis, Nginx, and your actual Docker build containers.
* **Our Solution:** For the live demo at `http://magnus-ci.online`, we used **PM2** (a lightweight Node process runner) and **Nginx**. This configuration has almost zero CPU/RAM overhead, leaving all system resources available for running actual build tests inside Docker.

---

## 🎙️ Part 4: Interview Pitch Script

If an interviewer asks: **"Why did you use PM2/Nginx on your VM instead of Kubernetes, and how would you migrate it?"**

#### The Pitch:
> *"For the live demonstration hosted on `http://magnus-ci.online`, I deployed the application on a single Azure Virtual Machine using **PM2** and **Nginx**.* 
> 
> *Because I am utilizing a resource-restricted **Azure for Students** VM, running a local Kubernetes cluster (like K3s or Minikube) would consume almost all the system's RAM just to host the control plane. Choosing PM2 and Nginx kept the system overhead near zero, reserving the VM's hardware entirely for running the actual ephemeral Docker build containers.*
> 
> *However, to ensure the project is enterprise-ready, I designed and included standard **Kubernetes manifests** in the `k8s/` folder. This declarative setup splits the system into decoupled Deployments for the API Gateways (running with multiple replicas behind a Service), Redis, PostgreSQL with Persistent Volumes, and a Worker pod.*
> 
> *In a massive enterprise scenario running thousands of builds, I would modify the worker to call the **Kubernetes Node API** directly instead of using Dockerode. The worker would launch each build stage as a stateless **Kubernetes Job Pod**. This enables the use of the **Kubernetes Cluster Autoscaler** to automatically provision and terminate cloud VM nodes based on the backpressure of our queue, saving significant infrastructure costs."*

---

## 🛠️ Part 5: How to Run Kubernetes Locally for Free ($0)

You do not need to spend money on AWS or Azure to learn, test, and run Kubernetes. You can run a complete multi-node Kubernetes cluster directly on your local computer for free using open-source tools:

### 1. The Local Cluster Engines
* **K3d / K3s (Recommended for Mac/Linux):** Spins up a lightweight Kubernetes cluster (K3s) inside Docker containers. It consumes very little RAM (~512MB) and boots in under 10 seconds.
* **Kind (Kubernetes in Docker):** Runs local Kubernetes clusters using Docker container nodes. Great for writing integration tests.
* **Minikube:** The classic local Kubernetes tool. It runs a single-node cluster inside a local virtual machine or Docker environment.

### 2. Quick Setup with K3d (Free Local Cluster)
To spin up a local Kubernetes cluster on your Mac:
```bash
# 1. Install k3d using Homebrew
brew install k3d

# 2. Create a cluster named "magnus-cluster" and expose port 80 for Nginx ingress
k3d cluster create magnus-cluster -p "8080:80@loadbalancer"

# 3. Verify the cluster is running
kubectl get nodes
```

### 3. Deploying MagnusCI to Local K8s:
```bash
# Apply all configuration manifests
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/magnus-api.yaml
kubectl apply -f k8s/magnus-worker.yaml
```

### 4. How to receive GitHub Webhooks locally for Free
Since your local cluster is behind your home router, GitHub cannot send webhooks to `localhost:8080`.
* **The Solution:** Use **localtunnel** or **ngrok** (both free).
* Run localtunnel to expose your Kubernetes port:
  ```bash
  npx localtunnel --port 8080
  ```
  This will give you a temporary public URL like `https://funny-cat-walks.localtunnel.me`.
* In your GitHub repository settings, just set your Webhook payload URL to:
  `https://funny-cat-walks.localtunnel.me/api/webhooks/github`

Now, whenever you push code, GitHub triggers the webhook -> runs through the tunnel -> hits your local Kubernetes cluster -> runs your Docker containers on your laptop—**completely free of charge!**

