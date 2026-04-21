---
title: Non-atomic task move causes duplicate processing on crash
created: 2026-04-21T06:52:40Z
status: todo
severity: high
found-by: code-reviewer
files:
  - src/tasks/task-file.ts:88
  - src/commands/run.ts:344
---

## Description

`moveTask` has two code paths: when no `extraFrontmatter` is provided it uses `renameSync` (atomic); when `extraFrontmatter` is provided it uses `writeFileSync(destPath)` followed by `unlinkSync(srcPath)` (non-atomic). The latter path is always taken in practice — `run.ts:344` always passes `extraFrontmatter` when moving a task to `done/`.

If the process is killed (OOM, Ctrl-C, power loss) between the `writeFileSync` and the `unlinkSync`, the task file survives in both `todo/` and `done/`. On the next agent run the orchestrator finds the task still in `todo/` and dispatches it again, potentially creating a duplicate branch and MR for work that was already completed.

## Suggested Fix

Merge the frontmatter update into the `renameSync` path: write to a temp file in the same directory as `destPath`, then rename atomically, then unlink `srcPath`. Or simpler: write the updated content back to `srcPath` first (overwriting in-place), then `renameSync(srcPath, destPath)` — this keeps the atomic move while still allowing frontmatter changes:

```typescript
export function moveTask(
  fromDir: string,
  toDir: string,
  filename: string,
  extraFrontmatter?: Partial<TaskFrontmatter>,
): void {
  const srcPath = resolve(fromDir, filename);
  const destPath = resolve(toDir, filename);

  if (extraFrontmatter) {
    const task = parseTaskFile(srcPath);
    const merged = { ...task.frontmatter, ...extraFrontmatter };
    const content = stringify(task.body, merged);
    writeFileSync(srcPath, content, "utf-8"); // overwrite in-place first
  }
  renameSync(srcPath, destPath); // atomic move
}
```

`renameSync` within the same filesystem is atomic (POSIX rename(2)), so a crash after `writeFileSync(srcPath)` leaves the updated file in `todo/` (re-processable but not duplicated), and a crash after `renameSync` leaves it in `done/` (safe).

## Affected Files

- `src/tasks/task-file.ts:88` — `writeFileSync(destPath)` + `unlinkSync(srcPath)` is not atomic; crash between the two leaves the task in both `todo/` and `done/`
- `src/commands/run.ts:344` — only caller; always supplies `extraFrontmatter`, so the non-atomic path is always taken at runtime
