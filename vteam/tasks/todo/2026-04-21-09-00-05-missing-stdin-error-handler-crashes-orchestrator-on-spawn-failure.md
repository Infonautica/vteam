---
title: Missing stdin error handler crashes orchestrator on Claude spawn failure
created: 2026-04-21T09:00:05Z
status: todo
severity: medium
found-by: code-reviewer
files:
  - src/orchestrator/agent-runner.ts:91
---

## Description

`runClaudeAgent` writes the user prompt to `proc.stdin` and then calls `proc.stdin.end()`, but never registers an error handler on `proc.stdin`:

```typescript
proc.stdin.write(options.userPrompt);
proc.stdin.end();
```

When `claude` fails to spawn (binary not in PATH, permission error, etc.), Node.js destroys the child process streams asynchronously. The buffered write to `proc.stdin` then emits an EPIPE error on the stream. Because there is no `proc.stdin.on("error", ...)` listener, the EventEmitter throws, producing an uncaught exception that crashes the orchestrator process — rather than a clean rejection of the returned Promise.

The `proc.on("error", reject)` handler at line 124 only catches process-level spawn errors; it does not cover errors on the stdin stream itself.

## Suggested Fix

Add a no-op error handler on `proc.stdin` immediately after opening the stream, before writing:

```typescript
proc.stdin.on("error", () => {});
proc.stdin.write(options.userPrompt);
proc.stdin.end();
```

The EPIPE case is already handled via `proc.on("error", ...)`, so the stdin error can be safely swallowed here.

## Affected Files

- `src/orchestrator/agent-runner.ts:91` — `proc.stdin.write` called without an error handler on the stream; EPIPE on spawn failure is uncaught
