# MagnusCI: Directory & Lifecycle Architecture (`caches/`, `public/`, `temp_builds/`)

This document details the responsibilities, storage mechanisms, and security strategies of the three core folders managed dynamically by the backend worker. Understanding these directories demonstrates an understanding of stateless container design and ephemeral I/O systems.

---

## 1. `caches/tarballs/` — Persistent Dependency Cache Store
**What it is:** The local directory where compressed package archives are persisted.

* **Design Purpose:**
  CI/CD systems should not perform raw network downloads (`npm install`) on every single code push. It causes latency, burns network bandwidth, and leads to build instability (if an upstream registry goes offline). This directory acts as the "Smart Pantry" for your engine.
  
* **Storage Structure:**
  Archives are saved using the format:
  ```text
  {repositoryId}-{language}-{lockfileHash}.tar.gz
  ```
  Example: `1-Node_js-8c54db0f19c9.tar.gz`
  
* **Security & Isolation Boundary:**
  By prefixing the file with `{repositoryId}`, we prevent **cross-tenant pollution**. A developer working in Repo A cannot restore or overwrite the cache of Repo B, ensuring security and isolation on shared build hosts.
  
* **Cleanup Strategy:**
  In a production system, this folder is mounted onto persistent SSD blocks (like AWS EBS or GCP Persistent Disks). If disk usage hits a watermark (e.g. 85%), a Least Recently Used (LRU) pruning script is fired to delete old tarballs.

---

## 2. `public/artifacts/` — Harvested Build Binaries & Static Assets
**What it is:** The static assets directory served by the Express.js gateway.

* **Design Purpose:**
  If a build produces output (like HTML test coverage reports, compiled JS/CSS bundles, or executable binaries), developers need to access them. The worker "harvests" these files from the container and places them in this public directory so the frontend can display them or serve them as direct downloads.
  
* **How it is Server-Statically:**
  Express routes serve this folder via standard middleware:
  ```javascript
  app.use('/artifacts', express.static(path.join(__dirname, 'public/artifacts')));
  ```
  
* **Structure:**
  ```text
  public/artifacts/
  └── {buildId}/
      ├── index.html           # (e.g. Jest Coverage HTML Report)
      └── app.tar.gz           # (The compiled compiled production bundle)
  ```
  
* **Whiteboard Architecture Point:**
  Instead of holding these locally on the Express web server (which creates a monolithic bottleneck), in a scaled cloud deployment, this directory is replaced by a cloud storage driver that streams the files directly to an object store like **Amazon S3** or **Google Cloud Storage** and serves them via a Content Delivery Network (CDN) like Cloudflare.

---

## 3. `temp_builds/{buildId}/` — Ephemeral Build Workspaces
**What it is:** The short-lived workspace directories where git repositories are cloned, isolated, and tested.

* **Design Purpose:**
  To guarantee that build environments are entirely stateless and clean. Every single build starts from absolute zero.
  
* **The Lifecycle of a Workspace:**
  1. **Creation:** When a BullMQ job starts, the worker calls the `workspace` helper to create `/temp_builds/{buildId}`.
  2. **Isolation:** The worker runs `git clone` and checkouts the exact target commit SHA inside this folder.
  3. **Mounting:** The host path `/temp_builds/{buildId}` is bind-mounted directly into the Docker container path `/app`.
  4. **Execution:** The container executes the test scripts inside this folder.
  5. **Teardown & Cleanup:** As soon as the container exits, the worker extracts any artifacts, terminates the container, and runs a recursive cleanup command (`rm -rf`) to purge the directory.
  
* **Security Guardrail (Crucial Interview Answer):**
  Leaving build code on the host machine after a run is a massive security hazard. It leaks intellectual property and leaves potential backdoor scripts in the workspace. By immediately executing `rm -rf` on `temp_builds/{buildId}` in the worker's `finally {}` exception block, MagnusCI guarantees **zero leakage** of source code on the runner hosts.
