---
title: Unquoted baseBranch in hasNewCommit silently drops agent commits
created: 2026-04-20T06:43:23Z
status: todo
severity: medium
found-by: code-reviewer
files:
  - src/commands/run.ts:389
---

## Description

`hasNewCommit` in `src/commands/run.ts` constructs its git command via string interpolation without quoting `baseBranch`:

```typescript
const log = execSync(`git log ${baseBranch}..HEAD --oneline`, {
  cwd: worktreePath,
  encoding: "utf-8",
});
```

Every other shell command in `worktree/manager.ts` consistently double-quotes branch names (e.g. `git worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`). This one does not.

If `config.baseBranch` contains a space (e.g. a branch named `"release 1.0"`, which is a valid git branch name), the command becomes `git log release 1.0..HEAD --oneline`, which git interprets as a revision range starting with `release` followed by the unknown argument `1.0..HEAD`. Git exits non-zero, the catch block swallows the error and returns `false`, and `hasNewCommit` incorrectly reports no new commits. The orchestrator then skips the push, MR creation, and task-to-done transition — silently losing the agent's work.

## Suggested Fix

Add quotes around `baseBranch` in the template literal:

```typescript
const log = execSync(`git log "${baseBranch}"..HEAD --oneline`, {
  cwd: worktreePath,
  encoding: "utf-8",
});
```

This is the same quoting pattern already used throughout `worktree/manager.ts`.

## Affected Files

- `src/commands/run.ts:389` — `baseBranch` interpolated without quotes into shell command; a branch name with spaces causes `execSync` to throw, `hasNewCommit` returns `false`, and the orchestrator silently skips the push/MR/task-completion flow
