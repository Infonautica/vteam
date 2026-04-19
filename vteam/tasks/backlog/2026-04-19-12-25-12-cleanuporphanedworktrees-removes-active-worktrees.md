---
title: cleanupOrphanedWorktrees removes active worktrees without checking live locks
created: 2026-04-19T12:25:12.000Z
status: backlog
severity: medium
found-by: code-reviewer
files:
  - src/worktree/manager.ts:83
---

## Description

`cleanupOrphanedWorktrees` (called by `vteam clean`) iterates over all git worktrees whose path starts with `worktreeDir` and removes every one of them unconditionally. It does not check whether any of those worktrees has an active agent lock in `vteam/.locks/`. If a user runs `vteam clean` while another agent invocation is running (e.g. the refactorer is mid-implementation), the active worktree is silently removed, corrupting the in-flight run. The agent continues writing to a path that no longer exists, git commands fail, and the task is neither completed nor rolled back — the task file stays in "todo" with a stale retry-count increment.

The function name `cleanupOrphanedWorktrees` implies orphan detection, but no orphan check is performed.

## Suggested Fix

Before removing a worktree, check whether the associated agent lock exists and is held by a live process. Skip (and warn about) any worktree with an active lock:

```typescript
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { isLockStale } from "../memory/lock.js"; // or inline the check

// Inside the loop:
const agentName = wt.branch.split("/").pop() ?? "";
const lockDir = resolve(repoRoot, "vteam", ".locks", agentName + ".lock");
if (existsSync(lockDir) && !isLockStale(lockDir)) {
  console.warn(`Skipping active worktree: ${wt.path} (lock held)`);
  continue;
}
removeWorktree(repoRoot, wt.path);
cleaned.push(wt.path);
```

Alternatively, expose `isLockStale` from `lock.ts` and use it here. Note that deriving the agent name from the branch name is fragile; a better solution would store the lock path in a worktree metadata file at creation time.

## Affected Files

- `src/worktree/manager.ts:83` — `removeWorktree` called unconditionally without checking for a live lock
