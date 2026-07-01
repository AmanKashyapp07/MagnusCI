# MagnusCI: Live Demo Commit Sequence

During the interview, you should perform **three specific commits** in sequence to your `magnus-ci-demo` repository. This sequence is carefully designed to prove every advanced feature of your engine.

Keep both your React Dashboard and your Worker Terminal (`node src/worker.js`) visible on the screen.

---

## 🎬 Commit 1: The "Happy Path" (Showcasing Architecture)

**Goal:** Prove that the decoupled architecture, DAG parsing, parallel execution, and WebSockets all work seamlessly.

**What to edit in `math.test.js`:**
Add a simple comment at the top of the file:
```javascript
// [Commit 1] Testing the base CI/CD pipeline
```

**What to run in your terminal:**
```bash
git commit -am "Commit 1: Trigger base build" && git push
```

**What to point out to the interviewer:**
1. **The Architecture:** "Notice how my Express API Gateway just caught the webhook and pushed it to Redis. Now, look at the Worker terminal—it just woke up and pulled the job."
2. **The Logs:** Click on the active build in your React dashboard. "Because the worker binds to the Docker standard output streams, it's broadcasting these logs to my React app in real-time via Socket.io."
3. **The DAG:** "Notice how `lint` and `test` just started at the exact same time. The engine parsed the DAG and realized they don't depend on each other, so it spun up two isolated Docker containers concurrently to save time."

---

## ⚡ Commit 2: The "Cache Hit" (Showcasing Speed & Optimization)

**Goal:** Prove that your custom Dependency Caching Engine works.

**What to edit in `math.test.js`:**
Add another simple comment:
```javascript
// [Commit 2] Testing the dependency caching engine
```

**What to run in your terminal:**
```bash
git commit -am "Commit 2: Testing Cache Hit" && git push
```

**What to point out to the interviewer:**
1. **The Hash Detection:** Point at the worker terminal and say, "Because I didn't change the `package-lock.json`, the worker calculated the SHA-256 hash and realized it already has this exact dependency tree."
2. **The Speed:** "Look at the terminal output: `Cache hit! Restored dependency folder node_modules`. Instead of downloading 267 packages from the internet again, it just instantly unzipped the cached volume from the previous build directly into the new container."

---

## 🛡️ Commit 3: The "Auto-Revert" (Showcasing Resilience & GitHub API Integration)

**Goal:** Prove that your system handles failures gracefully and acts autonomously.

**What to edit in `math.test.js`:**
Intentionally break the math test by changing the expected result from `2` to `3`.
```javascript
test('basic addition logic', () => {
  // INTENTIONALLY BREAKING THIS TEST
  expect(1 + 1).toBe(3); 
});
```

**What to run in your terminal:**
```bash
git commit -am "Commit 3: Breaking the tests!" && git push
```

**What to point out to the interviewer:**
1. **The Failure:** "As you can see, the test container failed and returned a non-zero exit code. The engine immediately aborted the rest of the DAG."
2. **The Auto-Revert:** "But watch what happens next. Because I have Auto-Revert enabled, the worker daemon just used the GitHub REST API to automatically calculate the reverse diff of my commit, and it autonomously pushed a revert commit back to the `main` branch to protect the codebase."
3. **The Proof:** Go to the GitHub repository in your browser and refresh the page. Show them the new commit authored by `Magnus CI` that says `Auto-revert: Commit 3: Breaking the tests!`.

---

### End of Demo
If you execute these three commits flawlessly while narrating what the worker is doing in the background, you will absolutely blow their minds. It proves you aren't just a React developer; you are a Systems Engineer.
