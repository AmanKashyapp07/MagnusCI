////////////////////////////////////////////////////////////////////////////////
// Webhook Ingestion Gateway & Security Gate
//
// File Purpose:
// This file intercepts code push webhook triggers sent by GitHub, verifies
// payload authenticity timing-safely, and enqueues jobs to BullMQ.
//
// High-Level Architecture:
// 1. HMAC Middleware: Intercepts the HTTP request, calculates the SHA-256 HMAC
//    signature using the unparsed body, and performs constant-time comparisons.
// 2. Loop Circuit Breaker: Evaluates author credentials to drop push events
//    created by MagnusCI's git reverts, preventing infinite loop cascades.
// 3. Normalized Persistence: Normalizes URLs, upserts repository records in DB,
//    logs raw events, inserts builds, and enqueues jobs.
//
// Interview Topics:
// - Cryptographic security: HMAC verification vs simple checksums.
// - Replay protection & Timing safe comparisons (preventing side-channel timing attacks).
// - System loops and automated recovery safety guards.
// - Normalization of strings to prevent data duplication.
//
// Dependencies: express, crypto, pg pool, BullMQ queue
////////////////////////////////////////////////////////////////////////////////

const express = require("express");
const crypto = require("crypto");
const pool = require("../db");
const buildQueue = require("../queue");

const router = express.Router();

////////////////////////////////////////////////////////////////////////////////
// Middleware: verifyGithubSignature
// Purpose: Validates incoming payloads are authentic requests from GitHub.
// Inputs: req (Express request object), res (Express response object), next (callback)
// Outputs: Calls next() or rejects with HTTP 401/400/500
// Side Effects: Recomputes hashes.
// Time Complexity: O(N) where N is request payload size.
//
// Security Deep Dive (Timing Attacks):
// Q: Why not use a standard string comparison (===)?
// A: Standard string comparison terminates early on the first mismatch. Attackers
//    can measure response latencies at the nanosecond scale to guess the hash
//    character-by-character.
// Q: How does crypto.timingSafeEqual solve this?
// A: It runs in constant time by comparing all bytes of the signature buffer,
//    preventing side-channel timing analysis.
//
// Ingress Design Decision (rawBody):
// Express body parsers mutate the request stream into JSON objects and discard
// the raw bytes. We configured express.json parser in index.js to store the
// unparsed stream in req.rawBody, keeping signature calculations cryptographically
// accurate.
////////////////////////////////////////////////////////////////////////////////
const verifyGithubSignature = (req, res, next) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  
  // If no secret is configured, bypass verification (useful for local testing)
  if (!secret) {
    console.warn("WARNING: GITHUB_WEBHOOK_SECRET is not set. Skipping webhook signature verification.");
    return next();
  }

  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    return res.status(401).json({ error: "No signature header found (x-hub-signature-256)" });
  }

  if (!req.rawBody) {
    return res.status(400).json({ error: "Missing raw request body for verification" });
  }

  try {
    const hmac = crypto.createHmac("sha256", secret);
    const digest = Buffer.from("sha256=" + hmac.update(req.rawBody).digest("hex"), "utf8");
    const checksum = Buffer.from(signature, "utf8");

    if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
      return res.status(401).json({ error: "Invalid signature. Verification failed." });
    }

    next();
  } catch (error) {
    console.error("Signature verification error:", error);
    return res.status(500).json({ error: "Internal signature verification error" });
  }
};

////////////////////////////////////////////////////////////////////////////////
// Route: POST /github
// Purpose: Main webhook entry point. Ingests, logs, and enqueues push events.
// Inputs: Request with header x-github-event and body containing repository info
// Outputs: HTTP 202 Accepted with buildId, or HTTP 400/500
// Side Effects: Database records written, Redis BullMQ task enqueued.
//
// Ingress Logic Flow:
// 1. Filters eventType. We only process 'push' events.
// 2. Infinite Loop Guard: Screens payload head_commit metadata. If author/committer
//    name equals 'Magnus CI' or email matches 'ci@magnus.internal', drops the push
//    immediately with 200 OK.
// 3. Normalizes git clone URL (lowercase, trims, removes '.git' and trailing slashes).
// 4. Looks up repository. If missing, performs database insert.
// 5. Audits payload in 'webhook_events' JSONB column.
// 6. Creates a 'PENDING' build record and enqueues a job to BullMQ.
// 7. Responds with 202 Accepted.
//
// Interview Q&A:
// Q: Why return 202 Accepted immediately instead of waiting for the build?
// A: Decoupling. Webhook triggers are network actions. Waiting for a build
//    (which takes minutes) would cause the connection to time out. Returning
//    202 in under 30ms frees up the Express server to receive more requests.
// Q: Why did you normalize URLs?
// A: To prevent duplicate repo records. Developers push to URLs that differ by case
//    or formatting (e.g., Repo.git vs repo/). Normalization ensures a single DB record.
////////////////////////////////////////////////////////////////////////////////
router.post("/github", verifyGithubSignature, async (req, res) => {
  const eventType = req.headers["x-github-event"];
  const payload = req.body;

  // We are mainly interested in 'push' events for triggering builds
  if (eventType !== "push") {
    return res.status(200).json({ message: `Webhook received. Ignored event type: ${eventType}` });
  }

  // Prevent infinite loops from Magnus CI auto-reverting commits
  const headCommit = payload.head_commit;
  if (headCommit && (
    headCommit.author?.name === 'Magnus CI' ||
    headCommit.committer?.name === 'Magnus CI' ||
    headCommit.author?.email === 'ci@magnus.internal' ||
    headCommit.committer?.email === 'ci@magnus.internal'
  )) {
    console.log(`[Webhook] Ignoring push event triggered by Magnus CI.`);
    return res.status(200).json({ message: "Ignored commit pushed by Magnus CI to prevent infinite loops." });
  }

  try {
    const repository = payload.repository;
    const commitHash = payload.after; // The SHA of the commit that triggered the webhook

    if (!repository || !repository.clone_url) {
      return res.status(400).json({ error: "Missing repository information in payload" });
    }

    const repoName = repository.name;
    const githubUrl = repository.clone_url;
    
    const normalizeUrl = (url) => {
      if (!url) return url;
      return url.trim().toLowerCase().replace(/\.git$/, "").replace(/\/$/, "");
    };
    
    const normalizedUrl = normalizeUrl(githubUrl);

    // 1. Find or create the repository in the database
    let repoId;
    const repoResult = await pool.query(
      "SELECT id FROM repositories WHERE github_url = $1",
      [normalizedUrl]
    );

    if (repoResult.rows.length > 0) {
      repoId = repoResult.rows[0].id;
    } else {
      const insertRepoResult = await pool.query(
        "INSERT INTO repositories (name, github_url) VALUES ($1, $2) RETURNING id",
        [repoName, normalizedUrl]
      );
      repoId = insertRepoResult.rows[0].id;
    }

    // 2. Log the webhook event
    await pool.query(
      "INSERT INTO webhook_events (repository_id, event_type, payload) VALUES ($1, $2, $3)",
      [repoId, eventType, JSON.stringify(payload)]
    );

    // 3. Create a pending build trace
    const buildResult = await pool.query(
      "INSERT INTO builds (repository_id, commit_hash, status) VALUES ($1, $2, 'PENDING') RETURNING id",
      [repoId, commitHash]
    );

    const buildId = buildResult.rows[0].id;
    const branchName = (payload.ref && payload.ref.startsWith('refs/heads/'))
      ? payload.ref.replace('refs/heads/', '')
      : 'main';

    // Add job to the queue
    await buildQueue.add("run-build", {
      buildId: buildId,
      repoUrl: normalizedUrl,
      commitHash: commitHash,
      branchName: branchName
    });

    // 4. Return 202 Accepted immediately with build info
    res.status(202).json({
      message: "Build triggered successfully",
      buildId: buildId,
      status: "PENDING",
    });
  } catch (error) {
    console.error("Webhook ingestion error:", error);
    res.status(500).json({ error: "Failed to process webhook event" });
  }
});

module.exports = router;

