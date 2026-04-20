---
title: Stale lock removal crashes agent under concurrent access
created: 2026-04-19T18:35:36Z
status: todo
severity: high
found-by: code-reviewer
files:
  - src/memory/lock.ts:77
---

## Description

In `acquireLock`, when a stale lock is detected, the code calls `rmSync(lockDir, { recursive: true })` without `force: true` and without guarding against a concurrent removal. If two agents detect the same stale lock simultaneously, both enter the `if (isLockStale(lockDir))` branch. The first removes the directory successfully; the second's `rmSync` throws `ENOENT`. Because this call is inside the `catch` block that only handles `EEXIST` errors, the `ENOENT` error is re-thrown (line 84: `throw err`), propagating up through `acquireLock` and crashing the agent process.

This is a TOCTOU bug in the exact concurrent-access scenario the lock exists to protect against. Any time two agents race on a stale lock, one crashes instead of retrying.

## Suggested Fix

Pass `force: true` to the `rmSync` call so a missing directory is silently ignored, letting both processes safely retry `mkdirSync`:

```typescript
rmSync(lockDir, { recursive: true, force: true });
```

This makes the stale-removal idempotent. Both processes will hit `mkdirSync` again; exactly one will succeed, the other will get `EEXIST` and retry normally.

## Affected Files

- `src/memory/lock.ts:77` — `rmSync(lockDir, { recursive: true })` missing `force: true`; throws `ENOENT` when a concurrent agent already removed the lock directory
