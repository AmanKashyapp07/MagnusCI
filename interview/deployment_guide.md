# MagnusCI: Production Deployment & Hardening Guide

*A step-by-step production setup, process daemonization, networking configuration, and security hardening guide for MagnusCI.*

---

## 🏛️ Production Architecture

Unlike standard CRUD web apps, MagnusCI is a multi-process, compute-heavy orchestration engine. The worker processes must communicate directly with the host's containerization layer (Docker) to spawn sandbox test runners on the fly.

```mermaid
flowchart TD
    subgraph Public Internet
        GitHub[GitHub Webhook / OAuth] -->|HTTPS| Nginx[Nginx Reverse Proxy / SSL Server]
        User[Developer Browser] -->|HTTPS| Nginx
    end

    subgraph Internal Network VM
        Nginx -->|Proxy Port 5001| Express[Express Ingestion Gateway]
        Nginx -->|Serve Static Files| StaticDist[Vite React SPA Build]
        
        Express -->|Enqueue Job| BullMQ[BullMQ / Redis Broker: Port 6379]
        Express -->|Query State| PostgreSQL[(PostgreSQL Database: Port 5432)]
        
        Worker[Background Worker Loop] -->|Poll Jobs| BullMQ
        Worker -->|Update Status & Logs| PostgreSQL
        Worker -->|Docker Socket API| DockerSock[/var/run/docker.sock]
    end

    subgraph Sandbox Isolation Boundary
        DockerSock -->|Launch Ephemeral Sandbox| Sandbox[Isolated Alpine Docker Container]
        Sandbox -->|Bind Mount Workspace| TempBuilds[Host temp_builds/]
    end
```

---

## 1. Infrastructure Requirements & Checklist

Ensure the target host server (e.g. AWS EC2, DigitalOcean Droplet running Ubuntu 22.04 LTS) meets these prerequisites:

| Component | Minimum Version | Note / Purpose |
| :--- | :--- | :--- |
| **Node.js** | `v20.x` or higher | Core runtime for Express Gateway and Worker Daemon. |
| **Docker Engine** | `v24.x` or higher | Must be installed on the host running the worker. |
| **PostgreSQL** | `v15.x` or higher | Primary database to store builds, repos, users, and logs. |
| **Redis** | `v7.x` or higher | In-memory message broker for BullMQ task distribution. |
| **PM2** | Global npm install | Process manager to keep Node servers running in the background. |
| **Nginx** | Standard apt install | Reverse proxy for SSL termination and static SPA server. |

---

## 2. Environment Configuration (`.env`)

Create a secure `.env` file inside the `backend/` directory on the production server. Lock permissions down using `chmod 600 backend/.env`.

```env
# Server Configuration
PORT=5001
FRONTEND_URL=https://ci.yourdomain.com
JWT_SECRET=your_high_entropy_jwt_secret_token_here

# GitHub Integrations
GITHUB_CLIENT_ID=your_production_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_production_github_oauth_client_secret
GITHUB_WEBHOOK_SECRET=your_production_webhook_secret_key
GITHUB_TOKEN=your_production_personal_access_token_with_repo_scope

# Redis (BullMQ Message Broker)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# PostgreSQL Connection Pool
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=ci_cd_engine
PGUSER=magnus_prod
PGPASSWORD=your_secure_db_password_here
```

> [!WARNING]
> Keep `GITHUB_TOKEN` secure. Because MagnusCI automatically pushes revert commits to undo breaking changes on Master, this token requires read/write access to the remote repository.

---

## 3. Production Database Schema Initialization

Before starting the server, log into your PostgreSQL database using `psql` and execute this relational schema setup to support users, repositories, builds, and logs:

```sql
-- 1. Create users table (GitHub OAuth registration)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    github_id VARCHAR(100) NOT NULL UNIQUE,
    username VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create repositories table with link to user
CREATE TABLE IF NOT EXISTS repositories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    github_url TEXT NOT NULL UNIQUE,
    user_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Create builds table to track execution status
CREATE TABLE IF NOT EXISTS builds (
    id SERIAL PRIMARY KEY,
    repository_id INT NOT NULL,
    commit_hash VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    artifacts JSONB DEFAULT '[]'::jsonb,
    metrics JSONB DEFAULT '[]'::jsonb,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

-- 4. Create build_logs table for stdout/stderr console output
CREATE TABLE IF NOT EXISTS build_logs (
    id SERIAL PRIMARY KEY,
    build_id INT NOT NULL,
    log_message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE
);

-- 5. Create webhook_events table for event payload logs
CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    repository_id INT,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE SET NULL
);

-- 6. Add indexes to speed up lookup times
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_repositories_user_id ON repositories(user_id);
CREATE INDEX IF NOT EXISTS idx_builds_repository_id ON builds(repository_id);
CREATE INDEX IF NOT EXISTS idx_builds_status ON builds(status);
CREATE INDEX IF NOT EXISTS idx_build_logs_build_id ON build_logs(build_id);
```

---

## 4. Deployment Option A: Single-Instance VM Setup

This is the standard, high-performance method for running MagnusCI on a single Ubuntu instance (e.g. AWS EC2).

### Step 1: Install System Packages
SSH into the instance and execute:
```bash
sudo apt update && sudo apt upgrade -y
# Install Node.js v20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
# Install database, queue server, git, and build engines
sudo apt-get install -y git redis-server postgresql postgresql-contrib
# Install PM2 globally
sudo npm install -g pm2
```

### Step 2: Configure Docker Socket Permissions (Crucial)
By default, `/var/run/docker.sock` requires `root` user execution. Run these commands to allow the custom Node.js deployment user to talk to the Docker daemon without using `sudo`:
```bash
# Create the docker group if missing
sudo groupadd docker
# Add your active deployment account to the docker group
sudo usermod -aG docker $USER
# Apply group settings instantly
newgrp docker
```
*Verify by running `docker ps`. It should show running containers without requiring `sudo`.*

### Step 3: Serve static React UI and Proxy Webhooks via Nginx
Compile the React code locally or on a runner:
```bash
cd frontend && npm install && npm run build
```
Copy the generated `dist/` files to your production web directory:
```bash
sudo mkdir -p /var/www/magnus-ci/frontend
sudo cp -r dist/* /var/www/magnus-ci/frontend/
sudo chown -R www-data:www-data /var/www/magnus-ci
```

Create a new Nginx config file `/etc/nginx/sites-available/magnus-ci`:
```nginx
server {
    listen 80;
    server_name ci.yourdomain.com;

    root /var/www/magnus-ci/frontend;
    index index.html;

    # React Routing (Fallback to index.html for Single-Page App)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static Build Artifact Download Proxy
    location /artifacts/ {
        alias /var/www/magnus-ci/backend/public/artifacts/;
        autoindex off;
        expires 7d;
    }

    # API Gateway Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Enable the site configuration and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/magnus-ci /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4: Daemonize Processes with PM2
Create an `ecosystem.config.js` file at the root of your project:
```javascript
module.exports = {
  apps: [
    {
      name: "magnus-api-gateway",
      script: "./backend/src/index.js",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "magnus-job-worker",
      script: "./backend/src/worker.js",
      instances: 1, // Keep worker to 1 to prevent thread thrashing
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    }
  ]
}
```
Launch the processes and register with the system init daemon:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 5. Deployment Option B: Docker Compose (Isolated Cluster)

If you prefer to package all dependencies inside containers, use this **Docker-out-of-Docker (DooD)** setup. Create a `docker-compose.yml` file at the root of the project:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: magnus-postgres
    restart: always
    environment:
      POSTGRES_DB: ci_cd_engine
      POSTGRES_USER: magnus_prod
      POSTGRES_PASSWORD: your_secure_db_password_here
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    networks:
      - magnus-network

  redis:
    image: redis:7-alpine
    container_name: magnus-redis
    restart: always
    ports:
      - "6379:6379"
    networks:
      - magnus-network

  api-gateway:
    image: node:20-alpine
    container_name: magnus-api-gateway
    restart: always
    working_dir: /app
    volumes:
      - ./backend:/app
    ports:
      - "5001:5001"
    environment:
      - PORT=5001
      - GITHUB_WEBHOOK_SECRET=your_production_webhook_secret_key
      - GITHUB_CLIENT_ID=your_production_github_oauth_client_id
      - GITHUB_CLIENT_SECRET=your_production_github_oauth_client_secret
      - JWT_SECRET=your_high_entropy_jwt_secret_token_here
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - PGHOST=postgres
      - PGPORT=5432
      - PGDATABASE=ci_cd_engine
      - PGUSER=magnus_prod
      - PGPASSWORD=your_secure_db_password_here
    command: sh -c "npm install && npm start"
    depends_on:
      - postgres
      - redis
    networks:
      - magnus-network

  job-worker:
    image: node:20-alpine
    container_name: magnus-job-worker
    restart: always
    working_dir: /app
    volumes:
      - ./backend:/app
      - /var/run/docker.sock:/var/run/docker.sock # Bind host docker socket inside container
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - PGHOST=postgres
      - PGPORT=5432
      - PGDATABASE=ci_cd_engine
      - PGUSER=magnus_prod
      - PGPASSWORD=your_secure_db_password_here
      - GITHUB_TOKEN=your_production_github_personal_access_token
    command: sh -c "npm install && node src/worker.js"
    depends_on:
      - postgres
      - redis
    networks:
      - magnus-network

networks:
  magnus-network:
    driver: bridge

volumes:
  pgdata:
    driver: local
```

Deploy using:
```bash
docker compose up -d
```

---

## 6. Recommended Deployment Method & Why

For MagnusCI, **Option A (Single-Instance VM Deployment on an Ubuntu host)** is the highly recommended approach. 

### Why Option A is superior to Option B for this project:
1. **Directory Mount Mapping (Host-Path Mirroring)**: When the worker process runs inside a container (Option B) and requests Docker to mount the workspace directory (e.g. `/app/temp_builds/50`), the host's Docker engine looks for `/app/temp_builds/50` **on the host system's disk**, not inside the worker container. This requires keeping the host path structure identical to the container path structure, which is error-prone. Running the worker directly on the VM (Option A) maps host paths 1-to-1 natively.
2. **Docker Socket Permissions**: Communicating with `/var/run/docker.sock` from inside a container often hits permissions blockages due to user ID (UID/GID) mismatches. Running the worker directly on the host simplifies group access management.
3. **Local Cache / Artifact Accessibility**: The worker can easily read/write to `backend/caches/tarballs/` and `backend/public/artifacts/` on the local disk without having to configure shared volume mounts.

---

## 7. System Verification Checklist (Proving It Works)

Use this step-by-step checklist on the production server to verify that the deployed CI/CD system functions end-to-end:

### Phase A: Signature & Gateway Ingestion
- [ ] **authorized Signature Audit**: Run `test_webhook.js` with the correct `GITHUB_WEBHOOK_SECRET` configured in `.env`.
  - *Expected Result*: The gateway returns a `202 Accepted` response in under 30ms.
- [ ] **Unauthorized Spoof Audit**: Modify the signature or remove the header in `test_webhook.js` and submit.
  - *Expected Result*: The gateway rejects the request with a `401 Unauthorized` response.
- [ ] **DB Trace Recording**: Run a query against Postgres: `SELECT * FROM builds ORDER BY id DESC LIMIT 1;`.
  - *Expected Result*: A new row must exist with status `PENDING`.

### Phase B: Queue & Asynchronous Processing
- [ ] **Backpressure / Queue Persistence**: Stop the worker process (`pm2 stop magnus-job-worker`). Submit 3 build webhook requests.
  - *Expected Result*: The gateway returns `202 Accepted` for all 3. Run `redis-cli KEYS "*"` or verify in Postgres that all 3 builds are created and hold a status of `PENDING` in the queue.
- [ ] **Worker Recovery**: Start the worker process (`pm2 start magnus-job-worker`).
  - *Expected Result*: The worker must pick up the jobs sequentially, updating their status to `RUNNING` one by one.

### Phase C: Container Sandboxing & Cleanup
- [ ] **Workspace Isolation**: While a build is running, inspect the host filesystem: `ls -la backend/temp_builds/`.
  - *Expected Result*: A temporary folder named after the `buildId` (e.g. `/temp_builds/12/`) must exist, containing only that build's checked-out code.
- [ ] **OS Socket Container Creation**: While a build is running, execute `docker ps`.
  - *Expected Result*: An active container named using the build ID must be running.
- [ ] **Resource Reclamation**: Wait for the build to finish. Re-run `ls -la backend/temp_builds/` and `docker ps -a`.
  - *Expected Result*: The temporary workspace folder must be deleted recursively, and the container must have been automatically removed from Docker.

### Phase D: Real-Time Sockets & Auto-Reverts
- [ ] **WebSocket Log Stream**: Open the React developer dashboard, click on the active build, and open the console log modal.
  - *Expected Result*: Monospace terminal logs must stream in real-time, prefixed by stage (e.g., `[LINT]`, `[TEST]`).
- [ ] **Auto-Revert Execution**: Commit and push a failing test change to the repository.
  - *Expected Result*: The build transitions to `FAILED`. In the repository's git commits, a new revert commit authored by `'Magnus CI'` must be visible, containing the diagnostic failure logs in the description.

---

## 8. Security Hardening Checklist for Interviews

If an interviewer asks how you hardened MagnusCI for production deployment, explain these points:

1. **Docker-out-of-Docker (DooD) Socket Mount Security**:
   *"In the Docker Compose setup, we bind-mount the host's `/var/run/docker.sock` inside the worker container. This allows the worker to spawn containers. However, this is a security risk if the worker process is compromised. To harden this, the worker container should never run as root, and we enforce strict network segmentation so only the gateway can accept external traffic. The worker has no public port open."*
2. **Stateless Gateway Scaling**:
   *"The Express API gateway is stateless. It does not write to the local filesystem or store session details in memory; it relies on Postgres and JWTs. This allows us to scale the API gateway behind Nginx load balancers to distribute traffic."*
3. **Dedicated Process Pools**:
   *"Under PM2, the API gateway runs in `cluster` mode to utilize all available CPU cores. However, the background worker is restricted to `instances: 1` in `fork` mode. This prevents CPU core thrashing. Since worker operations (cloning, building) are highly I/O and resource-intensive, compute scaling is managed by increasing the number of server instances rather than overloading one core."*
4. **Volume Storage Cleanup**:
   *"To prevent the server from running out of disk space, I designed a two-tiered cleanup strategy: setting `AutoRemove: true` in the container configuration instructs the Docker engine to remove container layers on exit. Second, the worker wraps its filesystem operations in a `finally` block that calls the cleanup utility to recursively remove the cloned repository directory. This guarantees that failed or timed-out builds do not leak disk space."*

