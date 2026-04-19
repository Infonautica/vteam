---
title: Deprecated rmdirSync recursive option used in lock module
created: 2026-04-19T10:13:00.000Z
status: backlog
severity: low
found-by: code-reviewer
files:
  - src/memory/lock.ts:69
  - src/memory/lock.ts:78
  - src/memory/lock.ts:94
---

## Description

`src/memory/lock.ts` calls `rmdirSync` with `{ recursive: true }` in three places (lines 69, 78, 94):

```ts
rmdirSync(lockDir, { recursive: true });
```

The `recursive` option on `rmdirSync` was deprecated in Node.js v16.0.0 and emits a `DeprecationWarning` at runtime (`DEP0147`). Node.js documentation states that `fs.rmSync` with `{ recursive: true, force: true }` is the correct replacement. While the option still works in Node 20, it may be removed in a future LTS release, and the deprecation warning pollutes output from the CLI.

## Suggested Fix

Replace all three calls with `rmSync`:

```ts
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";

// Line 69 (lock release):
rmSync(lockDir, { recursive: true, force: true });

// Line 78 (stale lock cleanup):
rmSync(lockDir, { recursive: true, force: true });

// Line 94 (breakLock):
rmSync(lockDir, { recursive: true, force: true });
```

Also remove the `rmdirSync` import.

## Affected Files

- `src/memory/lock.ts:69` — deprecated `rmdirSync({ recursive: true })` in lock release
- `src/memory/lock.ts:78` — deprecated `rmdirSync({ recursive: true })` in stale lock cleanup
- `src/memory/lock.ts:94` — deprecated `rmdirSync({ recursive: true })` in `breakLock`
