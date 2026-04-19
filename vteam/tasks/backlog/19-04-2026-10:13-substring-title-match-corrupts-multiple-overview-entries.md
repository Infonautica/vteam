---
title: Substring title match in updateOverviewEntryStatus corrupts multiple entries
created: 2026-04-19T10:13:00.000Z
status: backlog
severity: medium
found-by: code-reviewer
files:
  - src/memory/overview.ts:74
---

## Description

`updateOverviewEntryStatus` in `src/memory/overview.ts:74` identifies the target line using a substring check:

```ts
if (!line.toLowerCase().includes(normalizedTitle)) return line;
```

If task title A is a substring of task title B, updating A's status will also rewrite B's status line. For example, updating a task titled `"fix"` would corrupt every entry whose title contains `"fix"`. Since `overview.md` is append-only and the match is case-insensitive, this is easily triggered in practice (common words like "injection", "missing", "unhandled" appear in many task titles). The result is silent data corruption: multiple entries get an incorrect status, potentially causing the refactorer to re-pick already-completed tasks or skip pending ones.

## Suggested Fix

Match on the full title field rather than a substring of the raw line. Parse each line with `parseOverviewEntries` (or the same regex used there) and compare titles exactly:

```ts
const updatedLines = lines.map((line) => {
  const match = line.match(/^\- \*\*\[\w+\]\*\* .+? \| \w+ \| (.+?) \| `/);
  if (!match) return line;
  if (match[1].toLowerCase() !== normalizedTitle) return line;
  // apply status update...
});
```

## Affected Files

- `src/memory/overview.ts:74` — `line.includes(normalizedTitle)` matches partial titles, corrupting unrelated entries
