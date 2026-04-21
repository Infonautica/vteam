---
title: Shell injection in findGitLabMRsByLabels via unescaped label values
created: "2026-04-20T16:13:56Z"
status: done
severity: high
found-by: code-reviewer
files: ["src/integrations/pull-request.ts:192"]
completed: "2026-04-21T09:39:30.292Z"
branch: vteam/2026-04-20-16-13-56-shell-injection-in-findgitlabmrsbylabels
mr-url: "https://github.com/Infonautica/vteam/pull/22"
---
## Description

`findGitLabMRsByLabels` joins the `labels` array and interpolates it directly into the `glab api` URL string without escaping:

```typescript
const labelParam =
  labels.length > 0 ? `&labels=${labels.join(",")}` : "";

const result = execSync(
  `glab api "projects/:id/merge_requests?state=opened${labelParam}"`,
  ...
```

The `labels` values come from the agent's `prLabels` frontmatter in `vteam/agents/<name>/AGENT.md`. A label like `review$(malicious command)` or one containing a double-quote (`"`) would break out of the surrounding `glab api "..."` argument and execute arbitrary shell commands in the project's working directory.

The `shellEscape` function already exists in the same file (line 254) and is applied consistently everywhere else labels or user-controlled strings are interpolated — this spot was missed.

## Suggested Fix

Escape each label before joining:

```typescript
const labelParam =
  labels.length > 0
    ? `&labels=${labels.map(shellEscape).join(",")}`
    : "";
```

This is consistent with how other inputs are handled in the file (e.g. lines 33, 38, 54, 59, 85).

## Affected Files

- `src/integrations/pull-request.ts:192` — `labels.join(",")` interpolated into shell command without escaping
