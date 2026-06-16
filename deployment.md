# MagnusCI: Production Deployment & Scaling Guide

This deployment report outlines the steps, configurations, infrastructure designs, and security hardening measures required to transition **MagnusCI** (Git-Triggered Headless CI/CD Automation Engine) from a local development sandbox to a production-ready environment.

---

## 🏛️ Production Deployment Architecture

Unlike typical web applications, MagnusCI is a multi-process, resource-heavy orchestration engine. The worker nodes must communicate directly with the host's containerization layer (Docker) to spawn dynamic compile and test environments.

```mermaid
flowchart TD
    subgraph Public Internet
        GitHub[GitHub Webhook / OAuth] -->|HTTPS Requests| Nginx[Nginx Reverse Proxy / Load Balancer]
        User[Developer Browser] -->|HTTPS / Dashboard SPA| Nginx
    end

    subgraph Internal Network
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

## 📋 Infrastructure Requirements & Checklist

Ensure the target host server (e.g., AWS EC2, GCP Compute Engine, DigitalOcean Droplet) meets the following requirements:

| Component | Minimum Version | Notes |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04 LTS / Debian 12 | Linux environment is required for optimal Docker socket integration and permissions management. |
| **Node.js** | `v20.x` or higher | Core runtime for the Express gateway and background worker processes. |
| **Docker Engine** | `v24.x` or higher | Must be installed on the host running the background worker. |
| **PostgreSQL** | `v15.x` or higher | Primary database. Can be self-hosted on the same instance or run on a managed DB service (RDS, Cloud SQL). |
| **Redis** | `v7.x` or higher | In-memory message broker for BullMQ. |
| **Process Manager** | `pm2` | To monitor, daemonize, and manage Node process lifecycles. |
| **Web Server** | `Nginx` | Reverse proxy for API webhooks, static SPA file server, and SSL termination. |

---

## 🔑 Environment Variables Reference

Create a `.env` configuration file in your production deployment directory. Secure permissions using `chmod 600 .env` so that only the deployment user can read it.

```bash
# General Server Configuration
PORT=5001
FRONTEND_URL=https://ci.yourdomain.com
JWT_SECRET=your-high-entropy-jwt-session-secret-here

# GitHub Integration
# Create a GitHub OAuth App at: Developer Settings > OAuth Apps
GITHUB_CLIENT_ID=your_production_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_production_github_oauth_client_secret
# Create a Webhook Secret on your repository or organization
GITHUB_WEBHOOK_SECRET=your_production_webhook_secret_key
# Personal Access Token with 'repo' scope to publish commit statuses and commit reverts
GITHUB_TOKEN=your_production_github_personal_access_token

# Redis Configuration (BullMQ Message Broker)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=your_redis_password_if_configured

# PostgreSQL Connection Configuration
# pg-pool automatically falls back to these variables when initialized without hardcoding
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=ci_cd_engine
PGUSER=magnus_prod
PGPASSWORD=your_secure_db_password_here
```

> [!WARNING]
> Keep the `GITHUB_TOKEN` highly secure. Because MagnusCI utilizes automated Git commits to revert builds that break test suites, this token requires read/write access to the remote repository.

---

## 🗄️ Database Schema Setup (Fixed & Production-Ready)

The database schema must support multi-tenant user authentication, repositories, build trace logs, and webhooks. 

The original development `db.sql` schema lacks the `users` table and the corresponding `user_id` foreign keys in the `repositories` table. Execute the following production-ready DDL query inside your PostgreSQL database to initialize the schema:

```sql
-- Create users table (GitHub OAuth registration)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    github_id VARCHAR(100) NOT NULL UNIQUE,
    username VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create repositories table with relational link to user
CREATE TABLE IF NOT EXISTS repositories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    github_url TEXT NOT NULL UNIQUE,
    user_id INT, -- Nullable to support automatic webhook discovery setups
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create builds table to track pipeline executions
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

-- Create build_logs table for execution stdout/stderr streams
CREATE TABLE IF NOT EXISTS build_logs (
    id SERIAL PRIMARY KEY,
    build_id INT NOT NULL,
    log_message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE
);

-- Create webhook_events table for auditing payload histories
CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    repository_id INT,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE SET NULL
);

-- Create optimization indexes
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_repositories_user_id ON repositories(user_id);
CREATE INDEX IF NOT EXISTS idx_builds_repository_id ON builds(repository_id);
CREATE INDEX IF NOT EXISTS idx_builds_status ON builds(status);
CREATE INDEX IF NOT EXISTS idx_build_logs_build_id ON build_logs(build_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_repository_id ON webhook_events(repository_id);
```

> [!NOTE]
> Ensure you update the hardcoded connection details in [db.js](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/db.js) to pull dynamically from these environment variables:
> ```javascript
> const pool = new Pool({
>   host: process.env.PGHOST || 'localhost',
>   port: parseInt(process.env.PGPORT || '5432'),
>   database: process.env.PGDATABASE || 'ci_cd_engine',
>   user: process.env.PGUSER,
>   password: process.env.PGPASSWORD
> });
> ```

---

## 🚀 Deployment Option A: Single-Instance VM Deployment (Standard Setup)

This is the recommended, highly performant deployment method on a virtual machine (e.g., AWS EC2).

### Step 1: Install Dependencies
SSH into your instance and install the runtime packages:

```bash
# Update local packages
sudo apt update && sudo apt upgrade -y

# Install Node.js v20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Git, Docker, PostgreSQL, and Redis
sudo apt-get install -y git redis-server postgresql postgresql-contrib

# Install PM2 Process Manager globally
sudo npm install -g pm2
```

### Step 2: Configure Docker Permissions (Crucial Security Step)
The background worker connects to Docker via the local socket `/var/run/docker.sock`. By default, this socket requires `root` credentials. Run the following command to allow the node-runner account (e.g., `ubuntu` or your custom deployment user) to execute containers without `sudo`:

```bash
# Create the docker group if it doesn't exist
sudo groupadd docker

# Add your deployment user to the group
sudo usermod -aG docker $USER

# Apply group changes instantly
newgrp docker
```
*Verify that you can run Docker commands without sudo by running `docker ps`.*

### Step 3: Serve the Frontend SPA with Nginx
1. Build the frontend assets locally or on your build runner:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
   *This compiles the React code to the `frontend/dist` directory.*

2. Copy the contents of `dist` to your host's static root:
   ```bash
   sudo mkdir -p /var/www/magnus-ci/frontend
   sudo cp -r dist/* /var/www/magnus-ci/frontend/
   sudo chown -R www-data:www-data /var/www/magnus-ci/frontend
   ```

3. Configure Nginx to serve the SPA assets and reverse-proxy webhook requests to the Express gateway. Save the config file under `/etc/nginx/sites-available/magnus-ci`:

   ```nginx
   server {
       listen 80;
       server_name ci.yourdomain.com;

       root /var/www/magnus-ci/frontend;
       index index.html;

       # Frontend Routing (Fallback to index.html for Single-Page App routing)
       location / {
           try_files $uri $uri/ /index.html;
       }

       # Static Build Artifact Download Proxy
       location /artifacts/ {
           alias /var/www/magnus-ci/backend/public/artifacts/;
           autoindex off;
           expires 7d;
       }

       # Backend API Gateway Proxy
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

4. Enable the config and reload Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/magnus-ci /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

### Step 4: Daemonize Processes with PM2
To run both the Ingestion Server and the Background Worker concurrently under PM2, create an `ecosystem.config.js` file at the root of the project:

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
      instances: 1, // Keep worker to 1 instance or small pool to prevent CPU starvation
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    }
  ]
}
```

Start both applications:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 🐳 Deployment Option B: Multi-Container Docker Compose (Isolated Cluster)

Alternatively, you can package the entire application stack into a single network using Docker Compose. This includes mounting the host Docker daemon socket into the worker container (Docker-out-of-Docker / DooD).

Create a `docker-compose.yml` configuration at the root of your project:

```yaml
version: '3.8'

services:
  # Database
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
      - ./backend/db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    networks:
      - magnus-network

  # Queue Broker
  redis:
    image: redis:7-alpine
    container_name: magnus-redis
    restart: always
    ports:
      - "6379:6379"
    networks:
      - magnus-network

  # Express Ingestion Server & API Gateway
  api-gateway:
    image: node:20-alpine
    container_name: magnus-api-gateway
    restart: always
    working_dir: /usr/src/app
    volumes:
      - ./backend:/usr/src/app
    ports:
      - "5001:5001"
    environment:
      - PORT=5001
      - PGHOST=postgres
      - PGPORT=5432
      - PGDATABASE=ci_cd_engine
      - PGUSER=magnus_prod
      - PGPASSWORD=your_secure_db_password_here
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - GITHUB_WEBHOOK_SECRET=your_production_webhook_secret_key
      - GITHUB_CLIENT_ID=your_production_github_oauth_client_id
      - GITHUB_CLIENT_SECRET=your_production_github_oauth_client_secret
      - JWT_SECRET=your-high-entropy-jwt-session-secret-here
      - FRONTEND_URL=https://ci.yourdomain.com
    depends_on:
      - postgres
      - redis
    networks:
      - magnus-network

  # Background Worker Execution Runner
  background-worker:
    image: node:20-alpine
    container_name: magnus-background-worker
    restart: always
    working_dir: /usr/src/app
    volumes:
      - ./backend:/usr/src/app
      # Mount host Unix socket into container for sandbox management
      - /var/run/docker.sock:/var/run/docker.sock
      # Mount host directory for temp_builds so isolated containers can mount them
      - /Users/amankashyap/Documents/ci-cd-engine/backend/temp_builds:/usr/src/app/temp_builds
      - /Users/amankashyap/Documents/ci-cd-engine/backend/caches:/usr/src/app/caches
    environment:
      - PGHOST=postgres
      - PGPORT=5432
      - PGDATABASE=ci_cd_engine
      - PGUSER=magnus_prod
      - PGPASSWORD=your_secure_db_password_here
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - GITHUB_TOKEN=your_production_github_personal_access_token
    depends_on:
      - redis
      - postgres
    networks:
      - magnus-network

networks:
  magnus-network:
    driver: bridge

volumes:
  pgdata:
```

> [!CAUTION]
> Mounting `/var/run/docker.sock` grants the worker container absolute root permissions over the host system. If a user runs a build containing malicious code that exploits dockerode, they can take control of your entire server. Please follow the **Security Hardening** steps below to isolate the runtime environment.

---

## 🛡️ Production Security Hardening

CI/CD engines are attractive targets for security exploits (like bitcoin miners or host privilege escalation). Implement these strict limits:

### 1. Ephemeral Sandbox Resource Constraints
Configure memory and CPU limits on containers spawned by the background worker. Modify the container creation options inside [worker.js](file:///Users/amankashyap/Documents/ci-cd-engine/backend/src/worker.js) (around lines 582-592) to specify constraints:

```javascript
const stageContainer = await docker.createContainer({
  Image: stageImageName,
  Cmd: ['/bin/sh', '-c', stageRunCommand],
  WorkingDir: '/app',
  Env: ['CI=true'],
  HostConfig: {
    Binds: binds,
    AutoRemove: true,
    // Add strict sandbox limits:
    Memory: 1024 * 1024 * 512,  -- 512MB RAM maximum
    CpuPeriod: 100000,
    CpuQuota: 50000,           -- Max 50% CPU allocation per stage container
    NetworkMode: 'none'        -- Disable network access during test runs to prevent data exfiltration
  },
  Tty: true
});
```

### 2. Network Isolation
In production, stage containers should not have access to the internal network. This prevents custom build scripts from accessing your PostgreSQL database or Redis instances.
*   **Disable Host Networking**: Always use standard bridge networks for containers, or set `NetworkMode: 'none'` if packages don't need to be fetched from the internet during compilation (e.g., if everything is cached in `caches/`).

### 3. Docker Socket Proxying (Recommended Alternative)
Instead of exposing raw `/var/run/docker.sock` to the background worker container, route requests through a Docker Socket Proxy (e.g. `tecnativa/docker-socket-proxy`). This service runs in a separate container and exposes only safe Docker REST API endpoints (like `POST /containers/create` and `GET /containers/json`) while blocking destructive host actions.

---

## 🧹 Maintenance & Logging

### Garbage Collection
To keep the server healthy, configure a cron job to clean up dangling Docker containers, images, and volumes left behind by aborted builds.

Create a root cron job (`sudo crontab -e`):
```bash
# Clean up temporary directories and Docker garbage every day at 3:00 AM
0 3 * * * rm -rf /var/www/magnus-ci/backend/temp_builds/*
5 3 * * * docker system prune -af --volumes > /var/log/magnus-cleanup.log 2>&1
```

### Monitoring PM2 Process Logs
To check live service outputs and debugging logs:
```bash
pm2 logs magnus-api-gateway
pm2 logs magnus-job-worker
```
