# MagnusCI: Advanced Project Discussion Q&A

This document contains highly technical, senior-level answers for the "Project Discussion" phase of the interview. If the interviewer asks these questions, use these answers to demonstrate deep systems engineering knowledge.

---

### 1. Why did you build this?
**Your Answer:**
"I wanted to deeply understand backend systems engineering. While I could have built another standard CRUD application, I wanted a project that forced me to learn OS-level process management, Docker daemon orchestration, parallel execution, and message queues. Building a CI/CD engine from scratch is the ultimate test of backend infrastructure skills because it requires managing ephemeral execution environments safely, handling asynchronous task processing, and dealing with heavy file system manipulation."

### 2. What was the hardest problem you faced?
**Your Answer:**
"There were two major challenges. First, managing the Docker container lifecycle. Orchestrating a Directed Acyclic Graph (DAG) where some containers must wait for others (like 'compile' waiting for 'test') required extremely careful Promise chaining and exit-code monitoring using Dockerode to ensure no 'zombie' containers were left behind if a build was forcefully aborted.
The second major challenge was preventing an infinite webhook loop with the Auto-Revert feature. If MagnusCI pushed a revert commit, GitHub would send a webhook for that revert, triggering another build, which could fail and revert again. I solved this by engineering a 'circuit breaker' at the Express API Gateway level that instantly drops any webhook where the commit author is 'Magnus CI'."

### 3. What would happen if your traffic increased 100x? How would you scale it?
**Your Answer:**
"Currently, it operates as a monolithic worker. If traffic scaled 100x, the single worker node would bottleneck and run out of CPU/Memory spawning hundreds of Docker containers simultaneously. 
To scale, I would decouple the architecture horizontally:
1. **The API Gateway** would be deployed on a Kubernetes cluster behind a load balancer, strictly tasked with receiving webhooks and pushing them to a managed Redis cluster.
2. **The Worker Daemon** would be deployed as a fleet of independent worker nodes. They would autoscale based on the BullMQ queue depth (e.g., using KEDA in Kubernetes). Since BullMQ handles atomic locks, multiple workers can safely pull jobs from the same Redis queue without processing the same build twice."

### 4. Why did you choose PostgreSQL instead of MongoDB?
**Your Answer:**
"A CI/CD platform's data is fundamentally relational. A `User` owns many `Repositories`, a `Repository` has many `Builds`, and a `Build` has many `Logs`. Using a relational database like PostgreSQL allowed me to enforce strong foreign key constraints and use cascading deletes (e.g., if a repo is deleted, all its builds are safely wiped). While MongoDB is great for rapid prototyping of unstructured data, the strict ACID properties of Postgres were absolutely necessary to ensure the state of the CI engine is never corrupted during concurrent webhook executions."

### 5. What would you improve if you had more time?
**Your Answer:**
"I have three major improvements in mind:
1. **Security / Multi-tenancy:** Currently, the worker mounts the host's Docker socket. In a true multi-tenant SaaS, this is a security risk. I would migrate to Docker-in-Docker (dind) or use a secure sandbox like Google gVisor (runsc) to prevent container escape attacks.
2. **Real-time Log Streaming:** Instead of dumping the logs to the database at the end of the build, I would pipe the `stdout` stream from the Docker containers directly into a WebSocket server so the React frontend can display the logs live, line-by-line, exactly like GitHub Actions does.
3. **Distributed Caching:** Currently, the tarball dependency cache is saved on the local file system. If I scale to multiple workers, they wouldn't share the same file system. I would refactor the caching module to stream the tarballs directly to an AWS S3 bucket."

### 6. What did you personally implement?
**Your Answer:**
"I architected and built the entire platform end-to-end. 
* On the backend, I designed the PostgreSQL schema, wrote the Express.js API Gateway to ingest webhooks, configured the Redis/BullMQ job queue, and wrote the Node.js worker daemon that programmatically controls the Docker socket via the Dockerode API.
* I also engineered the complex engine logic: the DAG parsing algorithm for pipeline stages, the automated dependency caching logic (tarball compression), and the GitHub Auto-Revert REST API integration.
* Finally, I built the React/Tailwind frontend dashboard from scratch to parse the engine's log outputs and visualize the container resource utilization telemetry."

### 7. Is this just a clone of GitHub Actions? What makes it actually innovative?
**Your Answer:**
"While the core pipeline execution is inspired by GitHub Actions, the innovation lies in the **Auto-Revert Engine**. Traditional CI/CD tools simply send you an email or a Slack ping when a build fails, forcing a developer to drop what they are doing, context switch, and manually fix or revert the code. 
MagnusCI flips this paradigm: it treats the CI engine not just as an observer, but as an active participant in the codebase. By autonomously calculating the reverse diff and pushing a revert commit via the GitHub API before the bad code can affect other developers, it introduces a level of 'self-healing' infrastructure that goes beyond a standard clone."

### 8. Mounting the Docker socket (`/var/run/docker.sock`) is notoriously dangerous. How do you justify this security risk?
**Your Answer:**
"You are completely right; mounting the Docker socket gives the container root-level access to the host machine. In this project, I used it out of necessity because the Node.js worker needs to spawn sibling containers (the 'Docker out of Docker' approach). 
If I were deploying this to production for external users, I would absolutely not do this. Instead, I would use **Sysbox** (a dedicated container runtime for rootless Docker-in-Docker) or **Firecracker microVMs** (which AWS uses for Lambda). This would provide hardware-level isolation for each build without exposing the host OS daemon."

### 9. What happens if your Redis server crashes while there are 50 builds in the queue?
**Your Answer:**
"Because I used BullMQ, the system is highly fault-tolerant. BullMQ stores the state of every job persistently in Redis. If the Node.js worker crashes, the jobs remain safely in the queue and will be picked up when the worker restarts. 
If the Redis server itself crashes, we rely on Redis persistence (AOF - Append Only File, or RDB snapshots). As long as Redis is configured to persist data to disk, when the Redis server reboots, it reloads the queue state from disk. Any jobs that were midway through execution would be marked as 'stalled' by BullMQ and can be automatically safely retried by the next available worker."
