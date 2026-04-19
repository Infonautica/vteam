---
title: formatEvent dead code in streaming data handler logs raw JSON always
created: 2026-04-19T12:25:11.000Z
status: backlog
severity: medium
found-by: code-reviewer
files:
  - src/orchestrator/agent-runner.ts:103
---

## Description

In `runClaudeAgent`, the `data` event handler (lines 99–109) parses each line as `StreamEvent` but then immediately calls `console.log(trimmed)` — logging the raw JSON string regardless. The parsed `event` variable is assigned but never used. The `formatEvent` function is defined to produce clean, human-readable output (e.g. `[tool] Bash: git log …`) but is only called once in the `close` handler for the last partial line buffer. During every actual agent run, all streaming output is raw JSON, producing hundreds of noisy lines that are unreadable without a JSON formatter. The formatted output path is effectively dead code.

## Suggested Fix

Replace the raw `console.log(trimmed)` in the data handler with a call to `formatEvent`:

```typescript
try {
  const event: StreamEvent = JSON.parse(trimmed);
  const formatted = formatEvent(event);
  if (formatted) console.log(formatted);
} catch {
  console.log(trimmed);
}
```

## Affected Files

- `src/orchestrator/agent-runner.ts:103` — `console.log(trimmed)` logs raw JSON; `formatEvent(event)` is never called in the streaming path
