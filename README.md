# MagnusCI: Ephemeral Container-Based CI/CD Orchestration Engine

A custom-built, lightweight CI/CD orchestration engine designed as a college project to demonstrate key concepts in systems programming, container orchestration, and asynchronous build automation. This system intercepts code pushes via GitHub webhooks, manages execution pipelines using a custom Directed Acyclic Graph (DAG) scheduler, runs build stages within isolated Docker containers, and streams real-time terminal output to a web-based monitoring dashboard.

---

## Table of Contents
- [Project Overview](#project-overview)
- [Objectives](#objectives)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Usage](#usage)
- [Screenshots](#screenshots)
- [Project Workflow](#project-workflow)
- [Challenges Faced](#challenges-faced)
- [Learning Outcomes](#learning-outcomes)
- [Future Improvements](#future-improvements)
- [Contributors](#contributors)
- [Acknowledgements](#acknowledgements)
- [License](#license)

---

## Project Overview

MagnusCI was developed as an academic project to explore the underlying mechanics of modern automation servers like GitHub Actions and Vercel. Instead of relying on pre-existing CI tools, this project implements the core execution pipeline from scratch. 

It handles code retrieval, environment setup, dependency caching, parallel build stage execution, and log collection. By programmatically interacting with the Docker Engine API via a Unix socket, it ensures that every step of a build is executed in a clean, sandboxed environment that is immediately torn down upon completion.

---

## Objectives

- Understand and implement programmatic container orchestration using Docker.
- Design an asynchronous task distribution pipeline capable of handling concurrent build executions.
- Formulate a Directed Acyclic Graph (DAG) scheduling algorithm to handle complex stage dependencies.
- Build a real-time log ingestion and distribution network between background processes and a web interface.
- Implement secure, cryptographically validated communication channels for external webhooks.

---

## Features

- **Cryptographic Webhook Validation:** Verifies raw GitHub payloads using SHA-256 HMAC signatures to guarantee payload integrity.
- **Asynchronous Task Queue:** Decouples API ingestion from execution runners using BullMQ and Redis to manage backpressure.
- **Programmatic Sandbox Isolation:** Spawns ephemeral Docker containers directly through the Docker Engine socket to run tests safely.
- **DAG Execution Engine:** Evaluates build step dependencies defined in a custom `magnus-ci.json` file and executes non-dependent steps in parallel.
- **SHA-256 Dependency Caching:** Hashes package files (like `package-lock.json`) and caches dependency directories in compressed tarball archives to minimize build times.
- **Real-Time Logs and Telemetry:** Pipes container execution logs and gathers hardware utilization metrics (CPU/RAM) to render live updates on the dashboard.
- **GitHub Commit Status Feedback:** Integrates with the GitHub Statuses API to update commit checks with success or failure badges.
- **Automated Revert Recovery:** Detects build failures and can push a git revert commit to the remote repository to protect the main branch.

---

## Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| **Frontend** | React, Tailwind CSS | Single Page Application layout for interactive build metrics and ANSI log streaming. |
| **Backend Gateway** | Express.js, Node.js | Serves REST APIs and hosts Webhook endpoints for external payload ingestion. |
| **Broker Queue** | Redis, BullMQ | Manages distributed background queues and handles task serialization. |
| **Worker Daemon** | Node.js, Dockerode | Interacts directly with the Docker socket and orchestrates workspace state. |
| **Container Engine** | Docker | Provides process isolation and lightweight runtime environments for build execution. |
| **Database** | PostgreSQL | Persists long-term build histories, repository metadata, and full execution logs. |
| **Real-time Comms** | Socket.io | Establishes full-duplex WebSocket connections for live logging and metric updates. |

---

## Project Structure

```text
.
├── backend/                       # Express server, Ingestion Gateway, Worker Daemon
│   ├── db.sql                     # PostgreSQL database schema setup script
│   ├── caches/                    # Persistent caching directory for local dependency tarballs
│   ├── temp_builds/               # Ephemeral, short-lived build workspaces
│   └── src/                       
│       ├── index.js               # Entry point of the Express Gateway
│       ├── queue.js               # BullMQ (Redis) Queue client instantiation
│       ├── worker.js              # Background job daemon & container runner
│       ├── routes/                # Auth, Repositories, Builds, and Webhooks routes
│       └── utils/                 # DAG scheduler, Cache manager, and GitHub API logic
│
├── frontend/                      # React SPA Developer Dashboard
│   ├── src/
│   │   ├── App.jsx                # Main dashboard entry (OAuth states, repo lists)
│   │   ├── components/            # Visual widgets (MetricsChart, BuildModal, RepoList)
│   │   └── utils/logParser.js     # Parses and formats ANSI-escaped terminal log strings
│
└── interview/                     # Interview preparation & architecture guides
```

---

## Installation

### Prerequisites

Ensure you have the following software installed locally:
- **Node.js** (v20 or higher)
- **PostgreSQL**
- **Redis** (running locally on default port `6379`)
- **Docker** (running on host, with socket accessible at `/var/run/docker.sock`)

### Setup Instructions

1. **Clone the Repository:**
   ```bash
   git clone <your-repository-url>
   cd ci-cd-engine
   ```

2. **Database Initialization:**
   Create a PostgreSQL database named `ci_cd_engine` and initialize the schema:
   ```bash
   psql -U <username> -d ci_cd_engine -f backend/db.sql
   ```

3. **Configure Environment Variables:**
   Create a `.env` file inside the `backend` folder:
   ```env
   PORT=5001
   GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
   GITHUB_CLIENT_ID=your_github_oauth_client_id
   GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
   JWT_SECRET=your_jwt_secret_token
   FRONTEND_URL=http://localhost:5173
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379
   GITHUB_TOKEN=your_personal_access_token
   ```

4. **Install Dependencies:**
   ```bash
   # Install Backend dependencies
   cd backend
   npm install

   # Install Frontend dependencies
   cd ../frontend
   npm install
   ```

---

## Usage

### Running Locally

To run the application locally, start the services in three separate terminal tabs:

**Terminal 1: Start the Background Worker Daemon**
```bash
cd backend
node src/worker.js
```

**Terminal 2: Start the Express Gateway Server**
```bash
cd backend
npm run dev
```

**Terminal 3: Start the Vite Frontend Development Server**
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` in your browser to access the dashboard.

### Configuring Target Repositories (`magnus-ci.json`)

To configure builds, create a `magnus-ci.json` file in the root of your target repositories:
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

---


## Project Workflow

```text
[GitHub Push Event]
        │
        ▼
 [Express Gateway] ──(Validates HMAC Signature)
        │
        ▼
   [Redis Queue] ──(Decompresses Request Spikes)
        │
        ▼
 [Worker Daemon] ──(Pulls Build Job)
        │
        ├──► [Workspace Creator] ──(Clones Git Repository)
        ├──► [Cache Manager] ──(Checks SHA-256 Lockfile Cache)
        │
        ▼
   [Docker API] ──(Spawns Ephemeral Build Containers)
        │
        ├──► [Socket.io Server] ──(Pipes Log Stream & CPU/RAM Stats to React UI)
        │
        ▼
 [Cleanup System] ──(Prunes Workspace Files & Shuts Down Containers)
```

---

## Challenges Faced

1. **HMAC Raw Body Verification:** 
   Express.js automatically parses incoming request streams, stripping headers and formatting. This mutated the payload body, breaking HMAC verification. We resolved this by modifying the JSON parser middleware configuration to intercept and capture the unparsed request buffer as `rawBody`.
   
2. **Container Telemetry Calculations:** 
   Calculating CPU utilization programmatically from Docker stats required mapping container CPU deltas against the system's global CPU ticks over the same time interval. Polling these stats directly from the Docker socket stream required handling backpressure and avoiding database write locks.
   
3. **Circular Graph Validation:** 
   Defining build sequences via `needs` arrays inside `magnus-ci.json` opens up the risk of circular dependencies (e.g. A needs B, B needs A). We resolved this by implementing a Depth-First Search cycle checker to audit the parsed object before running jobs.

---

## Learning Outcomes

- **Docker HTTP API:** Gained experience communicating directly with host Unix sockets using HTTP endpoints rather than spawning command-line sub-processes.
- **Asynchronous Task Architecture:** Learned how message brokers (Redis/BullMQ) decouple APIs from heavy workers to manage CPU workloads.
- **State Management under Heavy Telemetry:** Optimized React component re-renders during high-volume logs and graphs streaming via WebSockets.
- **Security Isolation Policies:** Evaluated sandboxing security boundaries and resource throttling configs in container hosts.

---

## Future Improvements

- **MicroVM Integration:** Migrate execution runs from Docker containers to microVMs (e.g., AWS Firecracker) to enable strict kernel-level tenant isolation.
- **Log Compression & Cloud Storage:** Save finished log text files into object storage buckets (like AWS S3) rather than storing large strings directly in database columns.
- **Horizontal Scaling:** Deploy workers in stateless, autoscaling configurations coordinated via Kubernetes rather than a single monolithic daemon.

---

## Contributors

- **<Your Name>** - *System Design & Development* - [<Your GitHub profile>]

---

## Acknowledgements

- Professor and class teaching assistants for the systems engineering guidelines.
- The open-source community for the Dockerode and BullMQ documentation libraries.

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.
