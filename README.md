<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/AmanKashyapp07/ci-cd-engine">
    <img src="https://images.unsplash.com/photo-1618401471353-b98aedd07871?auto=format&fit=crop&w=120&h=120&q=80" alt="Logo" width="80" height="80" style="border-radius: 20%;">
  </a>

<h3 align="center">MagnusCI</h3>

  <p align="center">
    An Ephemeral Container-Based CI/CD Orchestration Engine
    <br />
    <a href="https://github.com/AmanKashyapp07/ci-cd-engine"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="http://magnus-ci.online">View Live Demo</a>
    ·
    <a href="https://github.com/AmanKashyapp07/ci-cd-engine/issues">Report Bug</a>
    ·
    <a href="https://github.com/AmanKashyapp07/ci-cd-engine/issues">Request Feature</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#key-features">Key Features</a>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#system-workflow">System Workflow</a></li>
    <li><a href="#production-deployment-azure-vm">Production Deployment (Azure VM)</a></li>
    <li><a href="#future-scaling-scope--kubernetes-roadmap">Future Scaling Scope & Kubernetes Roadmap</a></li>
    <li><a href="#challenges-faced--learning-outcomes">Challenges Faced & Learning Outcomes</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

[![Product Name Screen Shot](https://images.unsplash.com/photo-1600132806370-bf17e65e942f?auto=format&fit=crop&w=800&h=400&q=80)](http://magnus-ci.online)

MagnusCI is a custom-built, lightweight CI/CD orchestration engine designed to demonstrate the underlying mechanics of modern automation platforms like GitHub Actions and Vercel. 

Instead of relying on pre-existing CI tools, this project implements the core execution pipeline from scratch. The system intercepts code pushes via GitHub webhooks, manages execution pipelines using a custom Directed Acyclic Graph (DAG) scheduler, runs build stages within isolated ephemeral Docker containers, and streams real-time terminal output and resource telemetry to a web-based React monitoring dashboard.

### Built With

* [![React][React.js]][React-url]
* [![TailwindCSS][Tailwind.css]][Tailwind-url]
* [![Express][Express.js]][Express-url]
* [![NodeJS][Node.js]][Node-url]
* [![Postgres][Postgres.sql]][Postgres-url]
* [![Redis][Redis.io]][Redis-url]
* [![Docker][Docker.com]][Docker-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- KEY FEATURES -->
## Key Features

* **Cryptographic Webhook Validation:** Secures ingestion gateway endpoints by verifying incoming GitHub webhook payloads using SHA-256 HMAC signatures.
* **Asynchronous Task Queue:** Decouples API ingestion from resource-heavy build execution runners using BullMQ and Redis to manage system backpressure.
* **Programmatic Container Isolation:** Spawns ephemeral Docker containers directly through the Docker Engine socket (`/var/run/docker.sock`) to guarantee safe build environments.
* **DAG Execution Engine:** Parses stage dependencies defined in a custom `magnus-ci.json` configuration and executes independent steps concurrently.
* **SHA-256 Dependency Caching:** Hashes package lockfiles and caches compression directories in local tarball archives, decreasing successive build times.
* **Real-Time Logs & Telemetry:** Establishes duplex WebSocket connections via Socket.io to pipe container output streams and resource metrics to the UI.
* **GitHub Commit Status Feedback:** Integrates with the GitHub Statuses API to update commit verification badges on the remote repository.
* **Automated Revert Recovery:** Detects build failures on protected branches and automatically pushes a git revert commit to the remote repository.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

* **Node.js** (v20 or higher)
* **PostgreSQL** (running on port `5432`)
* **Redis** (running locally on port `6379`)
* **Docker** (running on host, with socket accessible at `/var/run/docker.sock`)

### Installation

1. Clone the repo:
   ```bash
   git clone https://github.com/AmanKashyapp07/ci-cd-engine.git
   cd ci-cd-engine
   ```
2. Initialize the PostgreSQL schema:
   ```bash
   psql -U amankashyap -d ci_cd_engine -f backend/db.sql
   ```
3. Configure your Environment variables. Create a `.env` file inside the `backend/` directory:
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
4. Install npm packages for both sub-projects:
   ```bash
   # Install Backend dependencies
   cd backend && npm install
   
   # Install Frontend dependencies
   cd ../frontend && npm install
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->
## Usage

### Running Locally

To run the application locally, start the following services in three separate terminal tabs:

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
    "setup": { "run": "npm ci" },
    "lint": { "run": "npm run lint", "needs": ["setup"] },
    "test": { "run": "npm test", "needs": ["setup"] },
    "compile": { "run": "npm run build", "needs": ["lint", "test"] }
  }
}
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- SYSTEM WORKFLOW -->
## System Workflow

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

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- PRODUCTION DEPLOYMENT -->
## Production Deployment (Azure VM)

This project has been fully deployed on a production Azure Virtual Machine (Ubuntu 24.04) under the custom domain **[http://magnus-ci.online](http://magnus-ci.online)**.

### Architecture Topology:
1. **Nginx Reverse Proxy (Port 80):** Serves the built React client statically and forwards `/api/*` and WebSocket `/socket.io/*` traffic to the backend running locally on Port 5001.
2. **Process Management (PM2):** Keeps the API gateway (`magnus-api`) and background queue runner (`magnus-worker`) daemonized, running as system services with automated logging.
3. **Database Layer:** PostgreSQL is running locally with loopback configurations to support secure TCP socket communication with the host.

<details>
  <summary>Show Deployment Configuration Commands</summary>

  #### 1. Install Dependencies:
  ```bash
  sudo apt update
  sudo apt install -y nodejs npm docker.io redis-server postgresql postgresql-contrib nginx
  sudo npm install -g pm2
  ```

  #### 2. Configure Docker Permissions:
  ```bash
  sudo usermod -aG docker azureuser
  # Restart the session
  ```

  #### 3. Database Bootstrap:
  ```bash
  sudo -u postgres psql -c "CREATE ROLE amankashyap WITH SUPERUSER LOGIN;"
  sudo -u postgres createdb -O amankashyap ci_cd_engine
  sudo -u postgres psql -d ci_cd_engine -f /home/azureuser/ci-cd-engine/backend/db.sql
  ```

  #### 4. Nginx Server Configuration:
  Save in `/etc/nginx/sites-available/default`:
  ```nginx
  server {
      listen 80;
      server_name _;

      location / {
          root /home/azureuser/ci-cd-engine/frontend/dist;
          try_files $uri $uri/ /index.html;
      }

      location /api/ {
          proxy_pass http://localhost:5001/api/;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
      }

      location /socket.io/ {
          proxy_pass http://localhost:5001/socket.io/;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "Upgrade";
          proxy_set_header Host $host;
      }
  }
  ```
  ```bash
  sudo systemctl restart nginx
  ```

  #### 5. Build and Start Application:
  ```bash
  cd /home/azureuser/ci-cd-engine/frontend && npm run build
  cd /home/azureuser/ci-cd-engine/backend
  pm2 start src/index.js --name "magnus-api"
  pm2 start src/worker.js --name "magnus-worker"
  pm2 save
  ```
</details>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- FUTURE ROADMAP -->
## Future Scaling Scope & Kubernetes Roadmap

To scale MagnusCI to handle 10,000+ builds per day for enterprise workloads, the architecture is designed to scale horizontally via a Kubernetes deployment (configuration templates located inside `k8s/`):

1. **Stateless API Gateway Scaling:** Deploy Express gateways inside a K8s cluster as a stateless `Deployment`, using a **Horizontal Pod Autoscaler (HPA)** and an **Application Load Balancer (ALB)** to manage webhook spikes.
2. **Broker Sharding:** Replace the local Redis instance with an **AWS ElastiCache Redis Cluster** configured with master-replica replication and database sharding.
3. **Serverless Build Runners:** Refactor the worker daemon to call the **Kubernetes API Server** using the K8s Client SDK. Each build stage will be spawned dynamically as a short-lived **Kubernetes Job Pod**, allowing the **Cluster Autoscaler** to provision compute resources on demand.
4. **Hardware Virtualization Sandboxing:** Replace shared-kernel Docker runtimes with **AWS Firecracker MicroVMs** or **Kata Containers** to prevent container-breakout attacks.
5. **Distributed Storage:** Move dependency caches and terminal execution logs to **Amazon S3** cached globally via a **CloudFront CDN** to remove local disk volume constraints.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CHALLENGES AND LEARNINGS -->
## Challenges Faced & Learning Outcomes

* **HMAC Request Ingress Verification:** express.js automatically parses incoming request streams, stripping HTTP headers and mutating body buffers, which broke HMAC signature validation. We resolved this by modifying the JSON parser configurations to capture and store the unparsed request buffer as `rawBody`.
* **Container Telemetry Calculations:** Calculating CPU metrics programmatically from Docker stats required mapping container CPU deltas against the system's global CPU ticks over the same time interval.
* **Circular Graph Validation:** User-defined build sequences inside `magnus-ci.json` introduce the risk of infinite loops (e.g. A needs B, B needs A). We resolved this by implementing a Depth-First Search (DFS) cycle-checking algorithm to audit the pipeline DAG before execution.
* **State Management & WebSockets:** Gained experience managing high-throughput Socket.io log streams to prevent React state re-render lags.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->
## Contact

Aman Kashyap - [@AmanKashyapp07](https://github.com/AmanKashyapp07) - amankashyapp07@gmail.com

Project Link: [https://github.com/AmanKashyapp07/ci-cd-engine](https://github.com/AmanKashyapp07/ci-cd-engine)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* TA & professors for systems design guidelines
* Open-source contributors of Dockerode, BullMQ, and Express
* Othneil Drew's README Template creator

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/AmanKashyapp07/ci-cd-engine.svg?style=for-the-badge
[contributors-url]: https://github.com/AmanKashyapp07/ci-cd-engine/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/AmanKashyapp07/ci-cd-engine.svg?style=for-the-badge
[forks-url]: https://github.com/AmanKashyapp07/ci-cd-engine/network/members
[stars-shield]: https://img.shields.io/github/stars/AmanKashyapp07/ci-cd-engine.svg?style=for-the-badge
[stars-url]: https://github.com/AmanKashyapp07/ci-cd-engine/stargazers
[issues-shield]: https://img.shields.io/github/issues/AmanKashyapp07/ci-cd-engine.svg?style=for-the-badge
[issues-url]: https://github.com/AmanKashyapp07/ci-cd-engine/issues
[license-shield]: https://img.shields.io/github/license/AmanKashyapp07/ci-cd-engine.svg?style=for-the-badge
[license-url]: https://github.com/AmanKashyapp07/ci-cd-engine/blob/main/LICENSE
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Tailwind.css]: https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[Express.js]: https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white
[Express-url]: https://expressjs.com/
[Node.js]: https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white
[Node-url]: https://nodejs.org/
[Postgres.sql]: https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white
[Postgres-url]: https://www.postgresql.org/
[Redis.io]: https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white
[Redis-url]: https://redis.io/
[Docker.com]: https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/
