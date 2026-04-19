---
title: Shell injection in merge request creation via execSync command strings
created: 2026-04-19T08:59:00.000Z
status: backlog
severity: high
found-by: code-reviewer
files:
  - src/integrations/merge-request.ts:39
  - src/integrations/merge-request.ts:69
---

## Description

`merge-request.ts` builds shell command strings by mapping each argument through `shellEscape()` and joining them, then passing the result to `execSync` (lines 39 and 69). While `shellEscape` correctly implements POSIX single-quote escaping, running any constructed command string through a shell introduces unnecessary risk: the shell parses the full string, meaning any edge case in escaping logic (e.g. null bytes, locale-specific behaviour, shell version differences) can result in injection. The PR title and body originate from task files written by Claude agents — content that could include arbitrary text.

The `shellEscape` function (line 79-80) wraps with single quotes and replaces `'` with `'\''`. This is correct for the common case but bypasses are known in specific shell implementations and environments.

Using `execFile` with an args array is the idiomatic Node.js fix: the OS executes the binary directly without any shell parsing.

## Suggested Fix

Replace both `execSync` call sites with `execFileSync` from `node:child_process`, passing the args array directly:

```typescript
import { execFileSync } from "node:child_process";

// createGitHubPR (line 39)
const result = execFileSync("gh", args, {
  cwd: options.cwd,
  encoding: "utf-8",
  stdio: ["pipe", "pipe", "pipe"],
});

// createGitLabMR (line 69)
const result = execFileSync("glab", args, {
  cwd: options.cwd,
  encoding: "utf-8",
  stdio: ["pipe", "pipe", "pipe"],
});
```

With `execFileSync`, `shellEscape` is no longer needed and can be removed.

## Affected Files

- `src/integrations/merge-request.ts:39` — `execSync` with shell command string for `gh pr create`
- `src/integrations/merge-request.ts:69` — `execSync` with shell command string for `glab mr create`
- `src/integrations/merge-request.ts:79` — `shellEscape` helper becomes dead code after fix
