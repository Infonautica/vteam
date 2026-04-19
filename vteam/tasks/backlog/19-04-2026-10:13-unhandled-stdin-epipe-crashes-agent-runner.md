---
title: Unhandled stdin EPIPE error crashes agent-runner process
created: 2026-04-19T10:13:00.000Z
status: backlog
severity: high
found-by: code-reviewer
files:
  - src/orchestrator/agent-runner.ts:84
---

## Description

At `src/orchestrator/agent-runner.ts:84`, the orchestrator writes the user prompt to `claude`'s stdin:

```ts
proc.stdin.write(options.userPrompt);
proc.stdin.end();
```

There is no `proc.stdin.on("error", ...)` handler. If `claude` exits before fully consuming stdin (e.g., it crashes at startup, fails authentication, or the prompt is rejected immediately), the stdin stream emits an `EPIPE` or `ERR_STREAM_DESTROYED` error. Because no error handler is registered, Node.js treats this as an uncaught stream error and terminates the entire orchestrator process — bypassing the Promise rejection path, the `finally` cleanup block, and the lock release. This leaves the task lock permanently held (until the 30-minute stale timeout) and the temp directory may not be cleaned up.

## Suggested Fix

Add an error handler on `proc.stdin` before writing to it:

```ts
proc.stdin.on("error", (err) => {
  // EPIPE is expected if the child exits early; other errors are real failures
  if ((err as NodeJS.ErrnoException).code !== "EPIPE") {
    reject(err);
  }
});
proc.stdin.write(options.userPrompt);
proc.stdin.end();
```

## Affected Files

- `src/orchestrator/agent-runner.ts:84` — `proc.stdin.write` with no error handler; EPIPE propagates as uncaught error
