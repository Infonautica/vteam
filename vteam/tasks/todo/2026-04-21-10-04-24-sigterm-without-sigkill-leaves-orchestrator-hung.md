---
title: SIGTERM without SIGKILL leaves orchestrator hung after timeout
created: 2026-04-21T10:04:24.000Z
status: todo
severity: medium
found-by: code-reviewer
files:
  - src/orchestrator/agent-runner.ts:86
---

## Description

`runClaudeAgent` sends SIGTERM when the timeout fires but never follows up with SIGKILL. The `close` event — which resolves the Promise — only fires when the child process actually exits. If Claude's process delays or ignores SIGTERM (e.g., while waiting for an internal tool call to finish, or due to a bug in Claude's own shutdown path), the Promise never resolves and the orchestrator hangs indefinitely.

The existing `[done]` task "No timeout on Claude subprocess" added SIGTERM at a deadline, which handles the common case. But SIGTERM is advisory: a process can defer its response for an arbitrarily long time, so the hang can persist past the intended timeout boundary.

## Suggested Fix

After sending SIGTERM, schedule a secondary SIGKILL deadline (e.g., 30 seconds later) as a hard backstop. Cancel the SIGKILL deadline if the process exits cleanly in response to SIGTERM:

```typescript
const deadline = setTimeout(() => {
  console.error(`[vteam] Claude timed out — sending SIGTERM`);
  proc.kill("SIGTERM");

  const killDeadline = setTimeout(() => {
    console.error(`[vteam] Claude did not exit after SIGTERM — sending SIGKILL`);
    proc.kill("SIGKILL");
  }, 30_000);

  proc.once("close", () => clearTimeout(killDeadline));
}, timeoutMs);
```

This guarantees the process terminates within `timeoutMs + 30s` regardless of SIGTERM handling.

## Affected Files

- `src/orchestrator/agent-runner.ts:86` — SIGTERM sent with no SIGKILL fallback; `close` event may never fire if the subprocess ignores the signal
