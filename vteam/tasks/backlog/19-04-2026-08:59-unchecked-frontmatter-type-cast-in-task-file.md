---
title: Unchecked type cast on gray-matter frontmatter breaks runtime safety
created: 2026-04-19T08:59:00.000Z
status: backlog
severity: medium
found-by: code-reviewer
files:
  - src/tasks/task-file.ts:25
---

## Description

`parseTaskFile` (line 19-28) casts the raw `data` object returned by `gray-matter` directly to `TaskFrontmatter` with `data as TaskFrontmatter` (line 25). `gray-matter` types `data` as `{ [key: string]: any }`, so the cast is a compile-time assertion with zero runtime validation.

If a task file is manually edited, written by an older agent version, or corrupted, the returned `TaskFile` will have `undefined` values for required fields like `status`, `severity`, or `title`. Downstream consumers of `parseTaskFile` — including `isDuplicateTitle`, `moveTask`, `severityPriority`, and the orchestrator in `run.ts` — all access these fields without null-checks, causing `TypeError` crashes at unpredictable points rather than a clear parse error at the source.

`listTaskFiles` (line 30-35) calls `parseTaskFile` for every file in a directory, so one malformed file breaks the entire task index.

## Suggested Fix

Add a lightweight runtime guard in `parseTaskFile` that throws an informative error for malformed files:

```typescript
export function parseTaskFile(filePath: string): TaskFile {
  const raw = readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  const requiredFields = ["title", "status", "severity"] as const;
  for (const field of requiredFields) {
    if (!data[field]) {
      throw new Error(`Task file ${filePath} is missing required frontmatter field: "${field}"`);
    }
  }

  return {
    filename: basename(filePath),
    path: filePath,
    frontmatter: data as TaskFrontmatter,
    body: content.trim(),
  };
}
```

And wrap `listTaskFiles` so one bad file is skipped rather than crashing the whole scan:

```typescript
export function listTaskFiles(dir: string): TaskFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== ".gitkeep")
    .flatMap((f) => {
      try {
        return [parseTaskFile(resolve(dir, f))];
      } catch (err) {
        console.warn(`Skipping malformed task file ${f}: ${err}`);
        return [];
      }
    });
}
```

## Affected Files

- `src/tasks/task-file.ts:25` — `data as TaskFrontmatter` cast with no runtime validation of required fields
- `src/tasks/task-file.ts:30` — `listTaskFiles` propagates parse errors, crashing entire task index on one bad file
