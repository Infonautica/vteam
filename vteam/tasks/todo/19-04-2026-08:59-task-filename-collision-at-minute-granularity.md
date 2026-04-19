---
title: Task filename collision when multiple findings share the same minute timestamp
created: 2026-04-19T08:59:00.000Z
status: backlog
severity: medium
found-by: code-reviewer
files:
  - src/tasks/task-file.ts:37
---

## Description

`generateTaskFilename` (line 37-43) produces filenames in the format `DD-MM-YYYY-HH:mm-<slug>.md`. The timestamp has minute-level granularity with no seconds component. When the code-reviewer runs and returns multiple findings (which all get written in the same second), any two findings whose titles produce identical slugs after `slugify` will generate the same filename. The second `writeFileSync` call (line 74 via `createTaskFile`) will silently overwrite the first, discarding one task.

Even with distinct titles, titles that differ only by punctuation or casing collapse to the same slug. For example, "Shell injection in worktree" and "Shell injection in worktree!" both slugify to `shell-injection-in-worktree`.

The code-reviewer is invoked in batch, so all findings are processed within the same minute — making this a near-certain collision in practice for a codebase with related findings.

## Suggested Fix

Add seconds to the timestamp format:

```typescript
// src/tasks/task-file.ts:41
const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
```

Note: colons in filenames are problematic on Windows and some filesystems — the current format already uses colons (`HH:mm`) which is a secondary issue. Switching the separator to `-` for the time component is recommended.

Also consider a short random suffix as a tie-breaker if sub-second collision is a concern:

```typescript
const jitter = Math.random().toString(36).slice(2, 6);
return `${date}-${time}-${slug}-${jitter}.md`;
```

## Affected Files

- `src/tasks/task-file.ts:37` — `generateTaskFilename` uses `HH:mm` with no seconds, causing overwrites for same-minute same-slug findings
