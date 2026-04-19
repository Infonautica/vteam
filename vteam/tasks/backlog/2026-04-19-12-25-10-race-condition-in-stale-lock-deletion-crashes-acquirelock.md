---
title: Race condition in stale lock deletion crashes acquireLock
created: 2026-04-19T12:25:10.000Z
status: backlog
severity: high
found-by: code-reviewer
files:
  - src/memory/lock.ts:78
---

## Description

In `acquireLock`, when `mkdirSync` throws `EEXIST`, the code checks `isLockStale(lockDir)` and, if true, calls `rmdirSync(lockDir, { recursive: true })` at line 78 — but this call is NOT wrapped in a try-catch. When two processes simultaneously detect the same stale lock, both call `rmdirSync`. The second call fails with `ENOENT` (directory already removed by the first). Because `rmdirSync` is inside the `catch (err)` block that only handled the `mkdirSync` EEXIST, the ENOENT escapes uncaught, propagating out of `acquireLock` and crashing the agent run with a cryptic file-system error rather than retrying or waiting.

## Suggested Fix

Wrap the stale-lock `rmdirSync` call in its own try-catch and ignore ENOENT (the lock was already cleaned up by another process — just retry):

```typescript
if (isLockStale(lockDir)) {
  try {
    rmdirSync(lockDir, { recursive: true });
  } catch (rmErr) {
    if ((rmErr as NodeJS.ErrnoException).code !== "ENOENT") throw rmErr;
  }
  continue;
}
```

## Affected Files

- `src/memory/lock.ts:78` — `rmdirSync` called without try-catch inside the EEXIST catch block; ENOENT from concurrent removal propagates and crashes the caller
