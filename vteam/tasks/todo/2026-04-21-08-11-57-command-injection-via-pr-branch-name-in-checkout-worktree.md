---
title: Command injection via PR branch name in checkoutWorktree
created: 2026-04-21T08:11:57Z
status: todo
severity: critical
found-by: code-reviewer
files:
  - src/worktree/manager.ts:41
  - src/worktree/manager.ts:47
  - src/worktree/manager.ts:55
---

## Description

`checkoutWorktree` in `src/worktree/manager.ts` interpolates `remoteBranch` directly into shell command strings passed to `execSync`. The `remoteBranch` value originates from `pr.headRefName` (GitHub) or `mr.source_branch` (GitLab) — both fields are fully controlled by the PR author, any external user who can open a pull request.

Because Node's `execSync(string)` passes the command to the system shell, a branch name containing shell metacharacters breaks out of the double-quote delimiters:

```
remoteBranch = 'legit"; rm -rf /; echo "'
```

expands to:

```sh
git fetch origin "legit"; rm -rf /; echo ""
```

The injected shell commands run with the privileges of the `vteam` process. All three `execSync` calls in `checkoutWorktree` are affected (fetch, branch delete, worktree add). The same pattern exists for `pushBranch` at line 123 where `branch` is also used in a shell string, though that value is derived from internal slugification and is less directly attacker-controlled.

## Suggested Fix

Replace shell string interpolation with `execFileSync` (or `execSync` with `shell: false` and an argv array). `execFileSync` never invokes the shell — arguments are passed directly to the process, so no escaping is needed and injection is structurally impossible:

```typescript
import { execFileSync } from "node:child_process";

// Instead of:
execSync(`git fetch origin "${remoteBranch}"`, { cwd: repoRoot, stdio: "pipe" });

// Use:
execFileSync("git", ["fetch", "origin", remoteBranch], { cwd: repoRoot, stdio: "pipe" });
```

Apply the same change to every `execSync` call that embeds a variable in a shell string:
- Line 21: `git branch -D "${branch}"` → `execFileSync("git", ["branch", "-D", branch], ...)`
- Line 27: `git worktree add -b ...` → `execFileSync("git", ["worktree", "add", "-b", branch, worktreePath, baseBranch], ...)`
- Line 41: `git fetch origin "${remoteBranch}"` → `execFileSync("git", ["fetch", "origin", remoteBranch], ...)`
- Line 47: `git branch -D "${remoteBranch}"` → `execFileSync("git", ["branch", "-D", remoteBranch], ...)`
- Line 55: `git worktree add -b ...` → `execFileSync("git", ["worktree", "add", "-b", remoteBranch, worktreePath, `origin/${remoteBranch}`], ...)`
- Line 68: `git worktree remove "${worktreePath}" --force` → `execFileSync("git", ["worktree", "remove", worktreePath, "--force"], ...)`
- Line 123: `git push --force origin "${branch}"` → `execFileSync("git", ["push", "--force", "origin", branch], ...)`

`execFileSync` is a drop-in replacement for the git calls because git does not need a shell; the return type and error behaviour are identical.

## Affected Files

- `src/worktree/manager.ts:41` — `remoteBranch` injected unescaped into `git fetch` shell string
- `src/worktree/manager.ts:47` — `remoteBranch` injected unescaped into `git branch -D` shell string
- `src/worktree/manager.ts:55` — `remoteBranch` injected unescaped into `git worktree add` shell string
