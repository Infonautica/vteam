---
title: No timeout on Claude subprocess hangs vteam indefinitely
created: 2026-04-19T16:08:30.000Z
status: backlog
severity: high
found-by: code-reviewer
files:
  - src/orchestrator/agent-runner.ts:78
---

## Description

`runClaudeAgent` spawns the `claude` subprocess with no timeout. If Claude hangs — due to a network stall, a deadlock inside the model, or any other reason — the `await new Promise` on line 77 never resolves. The vteam process blocks forever, the file lock in `src/memory/lock.ts` is never released, and any concurrently queued agents are stuck until the process is killed manually.

Because the lock stale threshold is 30 minutes, other agent invocations will wait the full stale window before forcibly clearing the lock, further amplifying the blast radius.

## Suggested Fix

Add a deadline timer inside the promise. On expiry, `SIGTERM` the child process so the `close` event fires and the promise resolves (with a non-zero exit code that the caller already handles):

```typescript
const proc = spawn("claude", args, { ... });

const timeoutMs = 30 * 60 * 1000; // 30 min — matches lock stale window
const deadline = setTimeout(() => {
  proc.kill("SIGTERM");
}, timeoutMs);

proc.on("close", (code) => {
  clearTimeout(deadline);
  // existing close logic ...
  resolve({ stdout, stderr, exitCode: code ?? 1 });
});
```

The timeout value should ideally come from `AgentRunOptions` so callers can tune it per agent, but a hard 30-minute cap is already a strict improvement over the current unbounded wait.

## Affected Files

- `src/orchestrator/agent-runner.ts:78` — `spawn` call with no timeout; promise never rejects on hang
