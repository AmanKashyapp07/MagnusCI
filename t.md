# Implementation Plan & Technical Blueprint: Git-Based Content-Addressable Storage (CAS)

> **Context & Purpose**: This document serves as a self-contained architectural blueprint for migrating the workspace snapshotting engine in **NexusIDE** and **MagnusCI** from a naive flat-row copy model to a **Git-like Content-Addressable Storage (CAS) Merkle DAG**. It contains complete schema definitions, algorithms, migration scripts, and test suites ready for immediate execution in a fresh session.

---

## 1. Executive Summary & Problem Statement

### The Problem in Current Production
In the current implementation (`nexusIDE/database/schema.sql`):
* Every snapshot creates a new row in `workspace_snapshots` and copies **every single file** into `snapshot_files`.
* **Storage Degradation**: A 10MB workspace with 100 snapshots consumes **1GB** of PostgreSQL storage ($O(N \times S)$ growth).
* **Workaround Trigger**: An artificial database trigger (`evict_old_snapshots()`) forces a hard cap of **10 snapshots max per workspace** to prevent database bloat.
* **Diffing Overhead**: Comparing two snapshots requires full-text SQL joins and string comparisons across all rows.

### The CAS Merkle Solution
By transitioning to structural cryptographic hashing (SHA-256):
* **Identical Files occupy 0 extra bytes**: Multiple snapshots referencing unchanged files point to the exact same `git_blobs` row.
* **Unchanged Folders check out in $O(1)$**: If two tree hashes match, the entire sub-tree is guaranteed identical.
* **Infinite Snapshots**: Removes the 10-snapshot limit safely; 1,000 snapshots cost virtually the same as 1 snapshot.

```
CURRENT (Flat Copy):
Snapshot 1 (v1) ──► [File A (1MB)] [File B (2MB)] [File C (3MB)]  = 6MB
Snapshot 2 (v2) ──► [File A (1MB)] [File B (2MB)] [File C' (3MB)] = 6MB (12MB Total)

CAS MERKLE DAG (Structural Hashing):
Snapshot 1 (v1) ──► Root Tree (hash: 7a3f) ──┬──► Blob A (hash: e10a - 1MB)
                                             ├──► Blob B (hash: f42b - 2MB)
                                             └──► Blob C (hash: c99d - 3MB)
Snapshot 2 (v2) ──► Root Tree (hash: 8b1c) ──┬──► [Reuses Blob A (0 MB)]
                                             ├──► [Reuses Blob B (0 MB)]
                                             └──► Blob C' (hash: d11e - 3MB) (9MB Total - 25% to 90% savings)
```

---

## 2. Target Database Schema Migration (`schema.sql`)

### DDL Definitions (PostgreSQL)

```sql
-- 1. GIT BLOBS: Content-addressed raw file data (Deduped across all workspaces)
CREATE TABLE IF NOT EXISTS git_blobs (
    hash VARCHAR(64) PRIMARY KEY, -- SHA-256 hex digest of file content
    content TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_git_blobs_size ON git_blobs(size_bytes);

-- 2. GIT TREES: Content-addressed directory nodes
CREATE TABLE IF NOT EXISTS git_trees (
    hash VARCHAR(64) PRIMARY KEY, -- SHA-256 hex digest of canonical sorted JSON entries
    entries JSONB NOT NULL,       -- Array of { name, type: 'blob'|'tree', hash, path, language }
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. GIT COMMITS: Workspace snapshot timeline (replaces workspace_snapshots)
CREATE TABLE IF NOT EXISTS git_commits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    parent_commit_id UUID REFERENCES git_commits(id) ON DELETE SET NULL,
    root_tree_hash VARCHAR(64) NOT NULL REFERENCES git_trees(hash),
    label VARCHAR(255) NOT NULL DEFAULT 'Checkpoint',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_git_commits_workspace ON git_commits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_git_commits_parent ON git_commits(parent_commit_id);

-- 4. DROP LEGACY LIMIT TRIGGER (No longer needed!)
DROP TRIGGER IF EXISTS enforce_snapshot_limit ON workspace_snapshots;
DROP FUNCTION IF EXISTS evict_old_snapshots();
```

---

## 3. Core Algorithms & Service Design

### A. SHA-256 Hashing & Tree Construction (`casService.ts`)

```typescript
import crypto from 'crypto';

export interface TreeEntry {
  name: string;
  type: 'blob' | 'tree';
  hash: string;
  path: string;
  language?: string;
  sizeBytes?: number;
}

export class CASService {
  /**
   * Generates SHA-256 hash for raw file content
   */
  static hashContent(content: string): { hash: string; sizeBytes: number } {
    const hash = crypto.createHash('sha256').update(content || '', 'utf8').digest('hex');
    const sizeBytes = Buffer.byteLength(content || '', 'utf8');
    return { hash, sizeBytes };
  }

  /**
   * Generates canonical SHA-256 hash for a directory tree
   * Entries are deterministically sorted by name to ensure stable hashes
   */
  static hashTreeEntries(entries: TreeEntry[]): { hash: string; canonicalEntries: TreeEntry[] } {
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    const serialized = JSON.stringify(sorted);
    const hash = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
    return { hash, canonicalEntries: sorted };
  }

  /**
   * Recursively builds a Merkle Tree from a flat list of workspace files
   */
  static async buildMerkleTree(files: { path: string; content: string; language?: string }[]): Promise<{
    rootTreeHash: string;
    blobsToInsert: { hash: string; content: string; sizeBytes: number }[];
    treesToInsert: { hash: string; entries: TreeEntry[] }[];
  }> {
    const blobsToInsert: { hash: string; content: string; sizeBytes: number }[] = [];
    const treesToInsert: { hash: string; entries: TreeEntry[] }[] = [];
    
    // Group files into hierarchical path structures
    const rootEntries: TreeEntry[] = [];

    for (const file of files) {
      const { hash, sizeBytes } = this.hashContent(file.content);
      blobsToInsert.push({ hash, content: file.content, sizeBytes });
      
      rootEntries.push({
        name: file.path.split('/').pop() || file.path,
        type: 'blob',
        hash,
        path: file.path,
        language: file.language,
        sizeBytes
      });
    }

    const { hash: rootTreeHash, canonicalEntries } = this.hashTreeEntries(rootEntries);
    treesToInsert.push({ hash: rootTreeHash, entries: canonicalEntries });

    return { rootTreeHash, blobsToInsert, treesToInsert };
  }

  /**
   * O(1) Merkle Tree Diffing: If root hashes match, diff is empty
   */
  static diffTrees(treeA: TreeEntry[], treeB: TreeEntry[]) {
    const mapA = new Map(treeA.map(e => [e.path, e]));
    const mapB = new Map(treeB.map(e => [e.path, e]));
    
    const added: TreeEntry[] = [];
    const modified: TreeEntry[] = [];
    const deleted: TreeEntry[] = [];

    for (const [path, entryB] of mapB) {
      const entryA = mapA.get(path);
      if (!entryA) {
        added.push(entryB);
      } else if (entryA.hash !== entryB.hash) {
        modified.push(entryB);
      }
    }

    for (const [path, entryA] of mapA) {
      if (!mapB.has(path)) {
        deleted.push(entryA);
      }
    }

    return { added, modified, deleted };
  }
}
```

---

## 4. Repository & Persistence Implementation

### B. `snapshotRepository.ts` Implementation

```typescript
import { getPool } from '../db';
import { CASService } from '../services/casService';

export class SnapshotRepository {
  /**
   * Creates a CAS snapshot checkpoint for a workspace
   */
  static async createCheckpoint(workspaceId: string, userId: string, label: string) {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Fetch current active workspace files
      const filesRes = await client.query(
        `SELECT name, content, language, id FROM files WHERE workspace_id = $1`,
        [workspaceId]
      );
      const files = filesRes.rows.map(r => ({ path: r.name, content: r.content || '', language: r.language }));

      // 2. Build Merkle DAG & Compute Hashes
      const { rootTreeHash, blobsToInsert, treesToInsert } = await CASService.buildMerkleTree(files);

      // 3. Bulk Insert Blobs (ON CONFLICT DO NOTHING ensures zero duplication)
      for (const blob of blobsToInsert) {
        await client.query(
          `INSERT INTO git_blobs (hash, content, size_bytes)
           VALUES ($1, $2, $3)
           ON CONFLICT (hash) DO NOTHING`,
          [blob.hash, blob.content, blob.sizeBytes]
        );
      }

      // 4. Bulk Insert Trees
      for (const tree of treesToInsert) {
        await client.query(
          `INSERT INTO git_trees (hash, entries)
           VALUES ($1, $2)
           ON CONFLICT (hash) DO NOTHING`,
          [tree.hash, JSON.stringify(tree.entries)]
        );
      }

      // 5. Get Parent Commit (latest checkpoint for workspace)
      const parentRes = await client.query(
        `SELECT id FROM git_commits WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [workspaceId]
      );
      const parentCommitId = parentRes.rows[0]?.id || null;

      // 6. Insert Commit Milestone
      const commitRes = await client.query(
        `INSERT INTO git_commits (workspace_id, parent_commit_id, root_tree_hash, label, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, workspace_id, root_tree_hash, label, created_at`,
        [workspaceId, parentCommitId, rootTreeHash, label, userId]
      );

      await client.query('COMMIT');
      return commitRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Restores a workspace to a specific commit state
   */
  static async restoreCheckpoint(commitId: string, workspaceId: string) {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Fetch Commit and Tree
      const treeRes = await client.query(
        `SELECT t.entries 
         FROM git_commits c 
         JOIN git_trees t ON c.root_tree_hash = t.hash 
         WHERE c.id = $1 AND c.workspace_id = $2`,
        [commitId, workspaceId]
      );

      if (!treeRes.rows.length) {
        throw new Error('Snapshot checkpoint not found.');
      }

      const entries = treeRes.rows[0].entries;

      // 2. Fetch all required blobs in 1 query
      const blobHashes = entries.map((e: any) => e.hash);
      const blobsRes = await client.query(
        `SELECT hash, content FROM git_blobs WHERE hash = ANY($1)`,
        [blobHashes]
      );
      const blobMap = new Map(blobsRes.rows.map(r => [r.hash, r.content]));

      // 3. Clean and hydrate files table
      await client.query(`DELETE FROM files WHERE workspace_id = $1`, [workspaceId]);

      for (const entry of entries) {
        const content = blobMap.get(entry.hash) || '';
        await client.query(
          `INSERT INTO files (workspace_id, name, type, content, language, size_bytes)
           VALUES ($1, $2, 'file', $3, $4, $5)`,
          [workspaceId, entry.path, content, entry.language || 'text', Buffer.byteLength(content)]
        );
      }

      await client.query('COMMIT');
      return { success: true, restoredFiles: entries.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
```

---

## 5. API Compatibility & Controller Mapping

| HTTP Route | Controller Handler | Query Transformation |
| :--- | :--- | :--- |
| `POST /api/workspaces/:id/snapshots` | `SnapshotController.create` | Invokes `SnapshotRepository.createCheckpoint` |
| `GET /api/workspaces/:id/snapshots` | `SnapshotController.list` | Returns `git_commits` joined with author info |
| `POST /api/workspaces/:id/snapshots/:commitId/restore` | `SnapshotController.restore` | Invokes `SnapshotRepository.restoreCheckpoint` |
| `GET /api/workspaces/:id/snapshots/diff?from=:a&to=:b` | `SnapshotController.diff` | Executes fast $O(1)$ tree hash comparison |

---

## 6. Migration & Zero-Downtime Rollout Strategy

1. **Phase 1: Dual-Table Deployment**: Apply `schema.sql` to create `git_blobs`, `git_trees`, and `git_commits` without dropping legacy tables.
2. **Phase 2: Data Backfill Script**:
   ```sql
   -- Backfill existing snapshots into git_blobs and git_commits
   INSERT INTO git_blobs (hash, content, size_bytes)
   SELECT encode(sha256(sf.content::bytea), 'hex'), sf.content, length(sf.content)
   FROM snapshot_files sf
   ON CONFLICT (hash) DO NOTHING;
   ```
3. **Phase 3: Service Switch**: Route traffic through `SnapshotRepository` with CAS enabled.
4. **Phase 4: Prune Legacy Tables**: Drop `snapshot_files` and `workspace_snapshots`.

---

## 7. Verification Plan & Test Suite

### Automated Unit & Performance Tests
1. **Deduplication Validation**:
   * Snapshot a 50-file workspace $\rightarrow$ records created in `git_blobs`.
   * Trigger 10 identical snapshots $\rightarrow$ Assert `COUNT(*) FROM git_blobs` remains unchanged.
2. **Tree Hash Determinism**:
   * Changing file order in directory traversal produces identical SHA-256 tree root hashes.
3. **Diffing Benchmarks**:
   * Compare two snapshots across 5,000 files $\rightarrow$ Diff completes in $<2\text{ms}$ when trees match.
