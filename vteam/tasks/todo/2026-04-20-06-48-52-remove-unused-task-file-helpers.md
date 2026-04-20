---
title: Remove unused task file helpers
created: 2026-04-20T06:48:52Z
status: todo
severity: low
found-by: human
files:
  - src/tasks/task-file.ts:47
  - src/tasks/task-file.ts:109
---

## Description

`createTaskFile()` and `isDuplicateTitle()` are dead code. Nothing in the orchestrator calls them. Claude creates task files directly via its own Write tool during `claude -p` runs, so programmatic task creation never happens.

`generateTaskFilename()` is only used by `createTaskFile()`, so it should be removed too.

## Suggested Fix

Delete `createTaskFile`, `isDuplicateTitle`, and `generateTaskFilename` from `src/tasks/task-file.ts`. Remove their corresponding tests from `src/tasks/task-file.test.ts`. Remove the `slugify` import if it becomes unused.

## Affected Files

- `src/tasks/task-file.ts:37` — `generateTaskFilename()` only called by `createTaskFile()`
- `src/tasks/task-file.ts:47` — `createTaskFile()` never called
- `src/tasks/task-file.ts:109` — `isDuplicateTitle()` never called
