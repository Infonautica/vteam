---
title: Shell injection in worktree manager via unescaped double-quoted args
created: 2026-04-19T08:59:00.000Z
status: backlog
severity: high
found-by: code-reviewer
files:
  - src/worktree/manager.ts:20
  - src/worktree/manager.ts:33
  - src/worktree/manager.ts:88
---

## Description

`worktree/manager.ts` builds shell commands via template literals with double-quoted interpolation (`"${branch}"`, `"${worktreePath}"`, `"${baseBranch}"`). Double-quote wrapping does not protect against embedded double-quote characters. If `worktreePath` (derived from `repoRoot` + `worktreeDir` + branch), `baseBranch` (from config, unvalidated), or any other interpolated value contains a `"`, the shell will misparse the command, causing it to fail or — with crafted input — execute unintended commands. The path `worktreePath` is built with Node's `resolve`, which can include arbitrary filesystem characters including quotes if the repo lives in such a path.

The three affected call sites:
- Line 20-21: `git worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`
- Line 33: `git worktree remove "${worktreePath}" --force`
- Line 88: `git push origin "${branch}"`

## Suggested Fix

Replace `execSync` with shell string with `execFileSync` (or `spawnSync`) passing args as an array, which bypasses the shell entirely:

```typescript
import { execFileSync } from "node:child_process";

// createWorktree (line 20)
execFileSync("git", ["worktree", "add", "-b", branch, worktreePath, baseBranch], {
  cwd: repoRoot, stdio: "pipe",
});

// removeWorktree (line 33)
execFileSync("git", ["worktree", "remove", worktreePath, "--force"], {
  cwd: repoRoot, stdio: "pipe",
});

// pushBranch (line 88)
execFileSync("git", ["push", "origin", branch], {
  cwd: worktreePath, stdio: "pipe",
});
```

Also update `listWorktrees` (line 48) and `getCommitSha` (line 95) the same way for consistency; those use no interpolation today so priority is lower.

## Affected Files

- `src/worktree/manager.ts:20` — `git worktree add` command with three interpolated values, no shell escaping
- `src/worktree/manager.ts:33` — `git worktree remove` command with interpolated `worktreePath`
- `src/worktree/manager.ts:88` — `git push origin` command with interpolated `branch`
