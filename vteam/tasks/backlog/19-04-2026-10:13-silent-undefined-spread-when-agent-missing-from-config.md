---
title: Silent undefined spread when agent name is absent from vteam.config.json
created: 2026-04-19T10:13:00.000Z
status: backlog
severity: medium
found-by: code-reviewer
files:
  - src/commands/run.ts:41
---

## Description

`resolveAgentConfig` at `src/commands/run.ts:38-43` returns:

```ts
return {
  name,
  agentMdPath,
  ...config.agents[name],   // line 41
};
```

If the named agent has an `AGENT.md` file (so the `existsSync` check passes) but has no entry in `config.agents`, then `config.agents[name]` is `undefined`. Spreading `undefined` is silently a no-op in JavaScript, so the agent runs with no `model`, no `scanPaths`, no `excludePaths`, and `autoMR` defaulting to `undefined` (treated as `true` later). This bypasses any project-specific configuration the user thought they set and can result in the agent scanning the entire repo or creating MRs the user didn't intend. No error or warning is emitted.

## Suggested Fix

Validate that the config entry exists before using it:

```ts
function resolveAgentConfig(name: string, cwd: string, config: VteamConfig): AgentConfig {
  const agentDir = resolve(cwd, "vteam", name);
  const agentMdPath = resolve(agentDir, "AGENT.md");

  if (!existsSync(agentMdPath)) {
    throw new Error(`Agent "${name}" not found at ${agentMdPath}`);
  }

  const agentConfig = config.agents[name];
  if (!agentConfig) {
    throw new Error(`Agent "${name}" has no entry in vteam.config.json`);
  }

  return { name, agentMdPath, ...agentConfig };
}
```

## Affected Files

- `src/commands/run.ts:41` — `config.agents[name]` spread without a null check; silently drops agent configuration when the key is absent
