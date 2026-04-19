---
title: Change task filename format to sortable ISO order
created: 2026-04-19T10:30:00Z
status: todo
severity: medium
found-by: human
files:
  - src/tasks/task-file.ts
  - src/templates/code-reviewer.agent.md
---

## Description

Task filenames currently use `DD-MM-YYYY-HH:mm-<slug>.md` which does not sort chronologically in directory listings or `ls`. The format should be changed to `YYYY-MM-DD-HH-mm-ss-<slug>.md` so files sort naturally by date.

This affects:
1. `generateTaskFilename` in `src/tasks/task-file.ts` — the function that builds the filename
2. `src/templates/code-reviewer.agent.md` — documents the filename format for the code-reviewer agent
3. Any other references to the `DD-MM-YYYY-HH:mm` format in prompts or documentation

## Suggested Fix

In `src/tasks/task-file.ts`, change `generateTaskFilename` to produce `YYYY-MM-DD-HH-mm-ss-<slug>.md`:

```typescript
const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
```

Update the filename format documentation in `src/templates/code-reviewer.agent.md` to match:

```
**Filename**: `YYYY-MM-DD-HH-mm-ss-<slugified-title>.md`
```

Use dashes instead of colons in the time component to avoid filesystem issues on Windows.

## Affected Files

- `src/tasks/task-file.ts` — `generateTaskFilename` produces the old format
- `src/templates/code-reviewer.agent.md` — documents the filename convention for the agent
