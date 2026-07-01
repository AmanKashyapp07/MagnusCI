# The Ultimate Docker Interview Guide

Docker is the absolute backbone of this CI/CD engine. If an interviewer asks you about what Docker actually is, or how you execute user code safely, this document contains everything you need to explain the system flawlessly.

---

## PART 1: Docker from First Principles

If an interviewer asks, "What actually *is* Docker?", do not just say "it's a container." Use this explanation to prove you understand OS-level virtualization.

### 1. The Core Problem: "It works on my machine"
Software depends on a specific environment (Operating System, libraries, paths). When you move software to a different computer, the environment changes, and it breaks.

### 2. The Old Solution: Virtual Machines (VMs)
For decades, the solution was Virtual Machines. If your code needed Ubuntu Linux to run, you would package an *entire Ubuntu Operating System* inside a file, and run it on top of your current computer using a Hypervisor. 
**The Problem:** VMs are incredibly heavy. It takes minutes to boot up and wastes gigabytes of RAM just running the guest OS instead of your actual code.

### 3. The First Principle Insight (The Linux Kernel)
Linux engineers realized something profound: **We don't need to boot a fake Operating System. We just need to lie to the process.**
If we are already running a Linux OS, why can't we just take a specific process (like `npm start`) and trick it into thinking it's the only process running on the computer, with its own private hard drive and IP address?

### 4. How the "Lie" is Executed: Namespaces and Cgroups
The Linux kernel introduced two features to make this lie possible:
1. **Namespaces:** This is the isolation mechanism. When you put a process in a namespace, it literally cannot see any other files, networks, or processes outside of its namespace. It thinks it is alone in the universe.
2. **Cgroups (Control Groups):** This is the resource limiter. It prevents this isolated process from eating up 100% of the host machine's RAM or CPU.

### 5. So, What is Docker?
**Docker is not a Virtual Machine. Docker is simply a highly polished wrapper around Linux Namespaces and Cgroups.**
When you run a Docker Container, Docker downloads a folder of files (an Image), starts a normal Linux process, and uses Linux **Namespaces** to instantly build an invisible, inescapable wall around that process. Because it doesn't boot a guest OS, starting a container takes **milliseconds**, not minutes. 

---

## PART 2: Docker Architecture in MagnusCI

Here is how you applied those principles to build the MagnusCI engine.

### 1. Ephemeral Isolation (The "Why")
If you just ran `npm test` directly on your Node.js worker server, you would face two massive problems:
1. **Dependency Clashes:** What if Build #1 needs Node v18 and Build #2 needs Node v20?
2. **Security & State:** Build #1 could accidentally delete files on your server, breaking Build #2.
**The Docker Solution:** Every single pipeline stage is executed inside a brand new, isolated Docker container (e.g., `node:20-alpine`). Once the stage finishes, the container is completely destroyed. This guarantees a clean, stateless, and safe environment.

### 2. Programmatic Control (Dockerode)
Most developers only know how to use Docker via the terminal CLI (`docker run ...`). 
**Your Flex:** In MagnusCI, you don't use the CLI. You used a library called **`dockerode`** to communicate directly with the **Docker Engine API** via HTTP over Unix sockets. 
This allows your Node.js worker to programmatically pull images, spawn containers, attach to their `stdout` data streams in real-time, and read their precise Exit Codes.

### 3. The "Docker out of Docker" (DooD) Pattern
This is a very senior concept. How does the worker daemon interact with Docker?
By connecting to the host machine's socket: `/var/run/docker.sock`. 
Because your worker has access to this socket, when it asks Docker to create a container for a test job, it isn't creating a container *inside* itself (which is messy). It is asking the host OS to spawn a **sibling container** right next to it. 
> *Note: In an enterprise environment, exposing the raw docker socket is a security risk. If asked, say you would upgrade to Sysbox or Firecracker microVMs for production.*

### 4. Volume Binding (How the code gets inside the container)
When GitHub sends a webhook, your worker clones the code to the host machine (e.g., `/temp_builds/59`). 
But how does the Docker container access that code to run `npm test`?
**The Solution:** You use Docker **Volume Binds**. When spawning the container via Dockerode, you pass a configuration telling Docker to map the host folder `/temp_builds/59` to the container's internal `/app` folder. 
This means the container can read, write, and execute the repository files without ever having to clone the repository itself!

### 5. The Container Lifecycle (Step-by-Step)
If asked to walk through what happens when a stage executes, memorize this exact sequence:
1. **Pull:** `docker.pull('node:20-alpine')` - Ensures the base image exists locally.
2. **Create:** Creates the container, binding the `temp_builds` folder to `/app`, and setting the command (e.g., `['sh', '-c', 'npm test']`).
3. **Attach Streams:** The worker attaches to the container's `stdout` and `stderr` so it can capture the live logs and save them to the PostgreSQL database.
4. **Start:** The container is booted up.
5. **Wait for Exit Code:** The worker waits for the container to die. **This is critical.** If the Exit Code is `0`, the stage passed. If the Exit Code is `1`, the stage failed (triggering the Auto-Revert).
6. **Teardown:** `container.remove({ force: true })` - The container is immediately destroyed to prevent "zombie" containers from eating up the server's RAM.

### 6. Parallel Execution
Because you are interacting with Docker programmatically, you can leverage Node.js `Promise.all()`. When your DAG algorithm determines that `Lint` and `Test` have no dependencies on each other, it asks the Docker Engine to spawn both containers at the exact same millisecond. They execute simultaneously on different CPU threads, completely unaware of each other, drastically reducing the overall build time.
