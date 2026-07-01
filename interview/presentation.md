# MagnusCI — Interview Speech Script
*A natural, verbal 5-minute speech. Read it aloud. Don't memorize — internalize and speak naturally.*
*Estimated time: ~4 min 45 sec at a calm, confident pace.*

---

"So, the project I want to walk you through is called MagnusCI — and the simplest way I can describe it is: I built my own mini version of GitHub Actions, entirely from scratch.

You know how when a developer pushes code to GitHub, something automatically runs all their tests in the background, shows a green checkmark or red X on the pull request, and even deploys the code if everything passes? That entire pipeline — the infrastructure behind that experience — is exactly what I built.

---

Now before I explain how it works, I want to talk about *why* it's actually a hard engineering problem to build. Because on the surface, it sounds simple — just run someone's tests on a server. But there are three real systems-level challenges hiding inside this.

The first is **concurrency**. If fifty developers push code at 9 AM on a Monday, and your server tries to run all fifty test suites simultaneously, it collapses. You need a way to accept all those events instantly, but process them in a controlled, ordered way.

The second is **security**. The entire point of a CI engine is that it runs someone else's code on your server. That's a genuine vulnerability. A developer could push a script that tries to delete directories or run an infinite loop — you cannot let that touch your actual host machine.

And the third is **visibility**. When a build is running in the background for three or four minutes, developers don't want to stare at a spinner. They want to see every single line of terminal output, live, as it happens.

Every architectural decision I made in this project was a direct answer to one of these three problems.

---

So here's how I solved it.

For concurrency — I designed a fully decoupled, event-driven architecture. When GitHub fires a webhook — meaning, when code is pushed — my Express backend intercepts that request, verifies it's a legitimate GitHub request by recomputing the HMAC SHA-256 signature from the raw request body and comparing it using a constant-time comparison to prevent timing attacks, and then immediately pushes the build job into a Redis-backed message queue powered by BullMQ. That's it — the gateway's job is done in under 30 milliseconds. It returns a 202 Accepted response to GitHub instantly. Whether one developer pushes code or a hundred, the server never blocks, never slows down, and never crashes.

The heavy lifting happens asynchronously, in the background, via an independent Worker Daemon. This is a completely separate Node.js process that pulls jobs off the Redis queue at its own pace. This means the gateway and the worker are completely decoupled — if the worker crashes, the gateway still accepts webhooks. If we need more throughput, we just spin up more worker nodes connected to the same Redis cluster. That's horizontal scalability.

---

Now, for security — once the worker picks up a job, it doesn't run the untrusted code directly on the host machine. Instead, I integrated the backend programmatically with the host operating system's Docker Unix socket. Using a library called Dockerode, the worker communicates with the Docker Daemon as if it were making REST API calls over a local socket. It dynamically spins up a completely isolated, ephemeral container — the right language image for the project, whether that's Node, Python, Go, or Java — and it only bind-mounts the specific cloned workspace directory into that container. Nothing else.

I also implemented a timeout race condition. I wrap the container's wait promise against a two-minute timeout using JavaScript's Promise.race. If a developer pushes an infinite loop and the timeout fires first, the worker force-kills the container, sweeps the temporary workspace directory from disk in a finally block, and marks the build as FAILED in PostgreSQL. The host machine never even notices this happened.

---

For visibility — I implemented live terminal multiplexing. I attach to the container's standard output and standard error streams using a pseudo-TTY configuration, and as chunks of log data come in, I strip the ANSI escape codes in real-time using a custom parser, and pipe the clean output through WebSockets directly to a React dashboard. So the developer can literally watch their tests running line by line, live, as if they were sitting in the terminal themselves.

---

On top of all this, I built three advanced features that I'm genuinely proud of, because they push this beyond a basic prototype into something that mirrors real production CI platforms.

The first is a DAG-based pipeline executor. Users can place a configuration file called magnus-ci.json in their repository, where they define named stages and their dependencies. For example — linting and testing can both start as soon as setup finishes, running in parallel, and the compile stage only triggers after both of those pass. I built a parser that reads this file, constructs a Directed Acyclic Graph, checks for circular dependencies, and uses concurrent Promise resolution to execute independent stages simultaneously. In my actual test run — Job #22 — lint and test containers were both spawned at the exact same second, 20:08:20, and their logs were interleaved and correctly prefixed with [LINT] and [TEST] labels in real-time.

The second is dependency caching. Downloading node_modules from scratch on every single run is slow and wastes bandwidth. So I implemented lockfile hashing — the engine takes a SHA-256 hash of the package-lock.json file. If that hash matches a previous build, it skips the npm install entirely and injects a compressed tarball of the cached dependencies straight into the container's workspace before it even starts. This speeds up repeat builds by up to ninety percent. And it's race-condition safe — because every build runs in its own UUID-named workspace directory, two concurrent builds for the same repository never corrupt each other's cache.

And the third is the auto-revert engine — my personal favorite. If a build fails, MagnusCI doesn't just mark it red and move on. It automatically configures a local Git identity, embeds the authenticated GitHub token into the remote URL, stages a revert commit, parses the stdout logs using framework-specific regex to extract which exact tests failed, builds a structured diagnostic commit message, and pushes the rollback back to the remote repository. The master branch is restored to a working state automatically, with the failure evidence documented inside the Git history itself.

---

Stepping back — what this project ultimately demonstrates is a real distributed system. Not a tutorial app, but something with genuine separation of concerns, process isolation, fault recovery, and horizontal scalability built in from the ground up.

I'd love to show you a live demo if you're up for it — watching a broken commit get automatically reverted in real-time is honestly very satisfying. But I'm happy to go deeper on any part of the architecture, especially the queue design, the Docker integration, or the DAG execution model. Thank you."
