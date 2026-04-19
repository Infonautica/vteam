---
title: vteam.config.json loaded without schema validation causes cryptic TypeError
created: 2026-04-19T12:25:14.000Z
status: backlog
severity: medium
found-by: code-reviewer
files:
  - src/commands/run.ts:33
  - src/commands/run.ts:155
---

## Description

`loadConfig` at `run.ts:33` reads and JSON-parses `vteam.config.json` then returns the result cast to `VteamConfig` with no structural validation:

```typescript
return JSON.parse(readFileSync(configPath, "utf-8"));
```

If the config file is missing required fields, the failure surfaces far from the parse site with a cryptic runtime error. Concrete example: if `tasks` is absent (or `vteam.config.json` was written before the `tasks` block was added), `run.ts:155` throws:

```
TypeError: Cannot read properties of undefined (reading 'maxRetries')
```

…deep inside the task-selection loop, with no indication that the config is malformed. Similarly, missing `baseBranch` propagates to `createWorktree` with an empty string argument, and missing `platform` reaches `createMergeRequest` with `undefined`, both causing misleading errors.

The same unvalidated parse pattern appears in `clean.ts:51`, though that path uses `loadConfigSafe` which suppresses the error entirely and silently uses the default `worktreeDir`.

## Suggested Fix

Validate the required fields immediately after parsing and throw a clear error with a list of what is missing:

```typescript
function loadConfig(cwd: string): VteamConfig {
  const configPath = resolve(cwd, "vteam", "vteam.config.json");
  if (!existsSync(configPath)) {
    throw new Error("vteam.config.json not found. Run 'vteam init' first.");
  }
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  const required = ["baseBranch", "platform", "worktreeDir", "tasks", "agents"];
  const missing = required.filter((k) => !(k in raw));
  if (missing.length) {
    throw new Error(`vteam.config.json is missing required fields: ${missing.join(", ")}`);
  }
  if (typeof raw.tasks?.maxRetries !== "number") {
    throw new Error("vteam.config.json: tasks.maxRetries must be a number");
  }
  return raw as VteamConfig;
}
```

Alternatively, use a lightweight schema library (e.g. `zod`) if the project already has it or is willing to add it.

## Affected Files

- `src/commands/run.ts:33` — raw JSON cast to `VteamConfig` without validation
- `src/commands/run.ts:155` — `config.tasks.maxRetries` throws TypeError if `tasks` field is absent
