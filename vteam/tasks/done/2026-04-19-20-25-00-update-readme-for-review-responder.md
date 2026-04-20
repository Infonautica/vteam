---
title: Update README.md for review-responder and custom agents
created: '2026-04-19T20:25:00+02:00'
status: done
severity: low
found-by: human
files:
  - README.md
completed: '2026-04-19T18:42:04.053Z'
branch: vteam/2026-04-19-20-25-00-update-readme-for-review-responder
mr-url: 'https://github.com/Infonautica/vteam/pull/9'
---
## Description

The README is outdated after the review-responder agent was added. It needs three updates:

1. **Add review-responder documentation** — add a `### Review responder` subsection under `## Agents` and a `### vteam run review-responder` subsection under `## Commands` explaining the label-based review loop: user leaves PR comments, adds `vteam:changes-requested` label, runs the agent, agent addresses feedback, pushes, replies to comment threads, orchestrator removes the trigger label.

2. **Update configuration section** — the config example still shows the old `agents` key inside `vteam.config.json`. Agent config now lives in AGENT.md frontmatter. Update the example JSON to only show global settings (`baseBranch`, `platform`, `worktreeDir`, `tasks`). Add a section or note explaining that agent behavior is configured via YAML frontmatter in each agent's `AGENT.md`, listing the available fields: `model`, `worktree`, `taskInput`, `prInput`, `prLabels`, `prTriggerLabel`, `autoMR`, `mrLabels`, `scanPaths`, `excludePaths`.

3. **Replace hardcoded agent count** — remove "v1 ships with two hardcoded agents. Custom agents are planned for v2." and replace with something like: "vteam ships with three default agents (code-reviewer, refactorer, review-responder). Add custom agents by creating `vteam/agents/<name>/AGENT.md` — no config changes needed."

Also update the `vteam init` scaffolding output to show the `review-responder/` directory, and fix the MR creation caveat ("labels silently skipped if they don't exist" is no longer true — labels are now auto-created).

## Affected Files

- `README.md` — all changes
