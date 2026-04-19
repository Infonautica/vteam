---
title: Regex injection in extractField via unescaped label interpolation
created: 2026-04-19T08:59:00.000Z
status: backlog
severity: low
found-by: code-reviewer
files:
  - src/memory/overview.ts:38
---

## Description

`extractField` (line 37-39) in `overview.ts` constructs a `RegExp` by directly interpolating the `label` parameter:

```typescript
const match = line.match(new RegExp(`${label}: \`(.+?)\``));
```

If `label` contains regex metacharacters (`.`, `*`, `+`, `?`, `(`, `[`, `{`, `\`, `^`, `$`, `|`), the resulting expression will not match what the caller intends and could match unintended substrings or throw a `SyntaxError`.

The two current callers (lines 25-26) use hardcoded string literals `"branch"` and `"MR"`, neither of which contain metacharacters, so this does not cause a runtime failure today. The risk is that `extractField` is a generic internal utility — if a future caller passes a label sourced from config or agent output, the bug becomes exploitable.

## Suggested Fix

Escape the label before interpolating:

```typescript
function extractField(line: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(new RegExp(`${escaped}: \`(.+?)\``));
  return match?.[1];
}
```

Alternatively, since both labels are known at compile time, inline the patterns as regex literals at the call sites and remove the generic helper.

## Affected Files

- `src/memory/overview.ts:38` — `new RegExp(\`${label}: ...\`)` interpolates label without escaping regex metacharacters
