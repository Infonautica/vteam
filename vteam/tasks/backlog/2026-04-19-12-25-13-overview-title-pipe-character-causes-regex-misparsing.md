---
title: Overview entry title containing pipe character causes regex misparsing
created: 2026-04-19T12:25:13.000Z
status: backlog
severity: medium
found-by: code-reviewer
files:
  - src/memory/overview.ts:14
---

## Description

`parseOverviewEntries` uses a regex with `(.+?) \|` (non-greedy) to extract the title field from each overview line. If a task title contains ` | ` (pipe character surrounded by spaces), the non-greedy `(.+?)` stops at the first pipe, silently truncating the title and causing the subsequent capture groups (severity, primary file, task path) to shift. The result is that `parseOverviewEntries` returns entries with the wrong severity, wrong file reference, and wrong task path — all without any error.

Example: title `"Shell injection in foo | bar"` produces `entry.title = "Shell injection in foo"`, `entry.severity = "bar"`, `entry.files = <severity field>`, and `entry.taskPath = ""` (regex match fails for the link).

The same format is written by `formatOverviewEntry` which places the raw `entry.title` directly into the line, so round-tripping a title with `|` will corrupt the line permanently.

## Suggested Fix

Option 1 — sanitize titles at write time in `formatOverviewEntry` and `createTaskFile` to replace ` | ` with ` – ` (en-dash) before they are written to overview lines.

Option 2 — use a fixed-column format or a delimiter that cannot appear in titles (e.g. tab, or encode `|` as `&#124;`).

Option 3 — quote the title field and update the regex to match a quoted string:
```typescript
// Write:  `"${entry.title.replace(/"/g, '\\"')}"` 
// Regex:  `"(.+?)" \|`
```

The cleanest fix is Option 1: normalize titles to disallow bare pipe characters at creation time.

## Affected Files

- `src/memory/overview.ts:14` — regex `(.+?) \|` truncates titles containing ` | ` at first pipe, misaligning all subsequent capture groups
- `src/memory/overview.ts:43` — `formatOverviewEntry` writes raw title without pipe sanitization, making the corruption permanent on round-trip
