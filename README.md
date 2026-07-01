# MagnusCI: Enterprise-Grade CI/CD Orchestration Engine 🚀

A high-performance, asynchronous CI/CD infrastructure designed to simulate the core code ingestion and build pipelines of modern platforms like Vercel and GitHub Actions. 

This engine validates advanced concepts in distributed systems, cryptographic signature verification, background queueing, programmatic Docker sandboxing, real-time telemetry streaming, and self-healing auto-revert logic.

---

## 🏗️ The Architecture (How it Works)
MagnusCI acts as a **Robotic Infrastructure Engineer** for your codebase:
* **The Push (The Alert)**: A developer pushes code to GitHub. A webhook instantly alerts our **Express.js Ingestion Gateway**.
* **The Broker (The Queue)**: To prevent crashing under high traffic, the gateway places incoming payloads into a highly fault-tolerant **Redis / BullMQ Queue**.
* **The Sandbox (Docker)**: The Node.js Worker daemon pulls the job, mounts the host's `/var/run/docker.sock`, and programmatically spawns isolated, ephemeral Docker containers (e.g., `node:20-alpine`) to run checks without compromising host security.
* **The Smart Pantry (Dependency Caching)**: To reduce build times by 90%, the engine compresses `node_modules` into `.tar.gz` archives and instantly restores them on the next build, completely bypassing internet downloads.
* **The Live Feed (React Dashboard)**: The React frontend connects via WebSockets/SSE to stream live, ANSI-formatted terminal logs and visualize real-time Docker CPU/Memory telemetry.
* **Self-Healing (Auto-Revert)**: If a developer pushes broken tests, the engine calculates a reverse diff via the GitHub API and **autonomously pushes a revert commit** to save the main branch.

---

## ⚡ Core Features

* **Cryptographic Webhook Ingestion**: Verifies raw GitHub payloads via SHA-256 HMAC signatures (`X-Hub-Signature-256`) in $O(1)$ time (<30ms).
* **DAG (Directed Acyclic Graph) Execution**: Parses dependency trees inside `magnus-ci.json`. It runs independent stages (like `lint` and `test`) in **parallel** across multiple Docker containers to slash execution time.
* **Lockfile-Hashed Dependency Caching**: Hashes `package-lock.json` via SHA-256. On a cache hit, it instantly unzips localized tarball caches instead of running `npm install`.
* **Programmatic Container Orchestration**: Bypasses the Docker CLI entirely. Uses `dockerode` to communicate directly with the Docker Engine HTTP API for volume mounting and exit-code monitoring.
* **Real-time Telemetry Polling**: Polls the Docker daemon every 2 seconds to track Peak and Average CPU/Memory footprints, pushing them to the PostgreSQL database for React rendering.
* **The "Auto-Revert" Circuit Breaker**: If a build fails with `Exit Code 1`, the worker generates a local Git revert commit containing the exact Jest failure logs and pushes it back to GitHub. The API Gateway employs a circuit-breaker to ignore webhooks authored by "Magnus CI" to prevent infinite loops.
* **Premium Developer Dashboard**: Built with React and **Tailwind CSS v4**. Features secure GitHub OAuth, repository selection, and a beautiful interactive TTY console modal.

---

## 📂 Repository Structure

```text
.
├── backend/                       # Express server, Ingestion Gateway, Worker Daemon
│   ├── db.sql                     # PostgreSQL schema setup
│   ├── caches/tarballs/           # Persistent caching directory for dependencies
│   ├── temp_builds/               # Ephemeral, isolated build workspaces
│   └── src/                       
│       ├── index.js               # Entry point of the Express Gateway (Port 5001)
│       ├── queue.js               # BullMQ (Redis) Queue configuration
│       ├── worker.js              # Background daemon & Docker sandbox executor
│       ├── routes/                # Auth, Repositories, Builds, and Webhooks
│       └── utils/                 # DAG parser, Cache compressor, GitHub API logic
│
├── frontend/                      # React SPA Developer Dashboard
│   ├── src/
│   │   ├── App.jsx                # Main dashboard UI (OAuth states, repo lists)
│   │   ├── components/            # MetricsChart, BuildModal, RepoList
│   │   └── utils/logParser.js     # Cleans and formats ANSI-escaped terminal logs
│
└── interview/                     # 🚀 INTERVIEW PREP & ARCHITECTURE GUIDES
    ├── demo_strategy.md           # Instructions for live demonstrations
    ├── deployment_guide.md        # Monolith vs Kubernetes scaling strategies
    ├── docker.md                  # Deep dive on Namespaces, Cgroups, and DooD
    ├── database_schema.md         # Relational breakdown of Users/Repos/Builds
    ├── qna.md                     # General technical Q&A
    └── qna2.md                    # Advanced "Senior Engineer" Q&A (Auto-Revert, Security)
```

---

## 🚀 Getting Started Locally

### Prerequisites
* **Node.js** (v20+)
* **PostgreSQL**
* **Redis** (running locally on port `6379`)
* **Docker** (running on host, with Unix socket accessible at `/var/run/docker.sock`)

### 1. Database Setup
Create a PostgreSQL database named `ci_cd_engine` and initialize the schema using `backend/db.sql`.

### 2. Environment Configuration
Create a `.env` file inside the `backend` directory:
```env
PORT=5001
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
JWT_SECRET=your_jwt_secret_token
FRONTEND_URL=http://localhost:5173
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
GITHUB_TOKEN=your_personal_access_token_with_repo_scope
```
> **Note:** The `GITHUB_TOKEN` is critical to enable the Status API updates and automated Git Revert Commit functionality.

### 3. Start the Infrastructure
**Terminal 1 (Backend & Worker):**
```bash
cd backend
npm install
node src/worker.js # Starts the Daemon
```

**Terminal 2 (API Gateway):**
```bash
cd backend
npm run dev # Starts the Express Gateway on 5001
```

**Terminal 3 (Frontend):**
```bash
cd frontend
npm install
npm run dev # Starts Vite on 5173
```

---

## ⚙️ Advanced Pipeline Customization (`magnus-ci.json`)

To orchestrate complex workflows, place a `magnus-ci.json` file at the root of your target repository. The DAG algorithm will parse the `"needs"` arrays to execute parallel stages!

```json
{
  "language": "Node.js",
  "image": "node:20-alpine",
  "stages": {
    "setup": {
      "run": "npm ci"
    },
    "lint": {
      "run": "npm run lint",
      "needs": ["setup"]
    },
    "test": {
      "run": "npm test",
      "needs": ["setup"]
    },
    "compile": {
      "run": "npm run build",
      "needs": ["lint", "test"]
    }
  }
}
```
*Because `lint` and `test` both only need `setup`, MagnusCI will spawn two Docker containers and run them simultaneously!*
