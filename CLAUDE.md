# vteam — Virtual Development Team Framework

## What this project is

An npm package (`vteam`) that orchestrates AI agents powered by `claude -p` (Claude Code's headless mode) to autonomously review codebases and implement fixes. The framework manages a task lifecycle (todo → done), runs agents in isolated git worktrees, and maintains a shared memory file so stateless agent invocations don't duplicate work.

The end user's workflow:
1. Define agent prompts in `AGENT.md` files
2. Run code-reviewer — it scans the codebase and writes findings straight to todo
3. Run refactorer (on a cron) — it picks up a task, implements it in a worktree, creates a branch + MR, moves the task to done

## Architecture

**Core principle: the orchestrator owns all state, Claude owns all intelligence.**

The TypeScript orchestrator handles state transitions — creating worktrees, moving task files, creating MRs. Claude (`-p` mode) handles reasoning — reading code, finding issues, implementing fixes. If Claude crashes mid-run, no state is corrupted because the orchestrator applies changes atomically after Claude finishes.

### How agents run

Each agent is invoked as a `claude -p` subprocess with:
- `--append-system-prompt-file` — the agent's `AGENT.md` content (via temp file)
- `--output-format stream-json` + `--verbose` — real-time streaming of tool calls and text
- `--permission-mode bypassPermissions` — allows all tools in headless mode
- `--no-session-persistence` — no session clutter

The orchestrator assembles a layered prompt: AGENT.md (role) → existing task titles (from task file frontmatter) → task content or PR review comments → instructions. The prompt is passed via stdin. Claude uses its own tools (Read, Write, Edit, Bash) to create task files and implement changes directly.

### Memory management

Each `claude -p` call is stateless. Memory is external:

- **Task files** — individual markdown files with YAML frontmatter in `todo/` or `done/`. Self-contained descriptions of findings. The orchestrator scans these directories at prompt-build time and injects a summary of existing task titles, severities, and statuses into every agent's prompt.
- **Deduplication** — The prompt builder reads all task files via `buildTaskIndex()` and includes them in the "Existing Tasks" section. Claude avoids reporting duplicates. The orchestrator also does a normalized title comparison as a safety net. No hashing. No separate overview file — task files are the single source of truth.

### Worktrees

Agents with `worktree: true` get an isolated git worktree (`git worktree add`). After Claude commits changes in the worktree, the orchestrator pushes the branch, optionally creates an MR (if `autoMR: true`), and cleans up the worktree.

Agents with `prInput: true` use `checkoutWorktree` to check out an existing PR branch (via `git fetch` + `git worktree add` from the remote tracking branch). After Claude commits, the orchestrator pushes to the same branch, posts a summary comment on the PR, and removes the `prTriggerLabel`. Discovery is label-based: the orchestrator searches for open PRs matching all `prLabels` AND the `prTriggerLabel`. The user adds the trigger label when they want changes; the orchestrator removes it after the agent pushes. This avoids GitHub's limitation where PR authors cannot submit "Request changes" reviews on their own PRs.

### Agent configuration

Agents are defined at `vteam/agents/<name>/AGENT.md`. Each AGENT.md uses YAML frontmatter to declare orchestrator behavior:

```yaml
---
model: sonnet
cron: "0 */6 * * *"
worktree: true
taskInput: true
autoMR: true
mrLabels: [vteam, automated]
scanPaths: [src/]
excludePaths: [node_modules/, dist/]
---
```

- `worktree` (default: `false`) — run in an isolated git worktree, push branch on commit
- `taskInput` (default: `false`) — pick a task from `todo/` queue, manage task lifecycle
- `prInput` (default: `false`) — pick a PR with pending review feedback, check out its branch (requires `worktree: true`, mutually exclusive with `taskInput`)
- `prLabels` — labels used to filter PRs when `prInput: true` (e.g. `[vteam]`)
- `prTriggerLabel` — transient label that signals "this PR needs work" (e.g. `vteam:changes-requested`); removed by the orchestrator after the agent pushes
- `autoMR` (default: `false`) — create a merge request after pushing (requires `worktree: true`)
- `cron` — cron expression (5 fields: minute hour day month weekday) for scheduling via `vteam cron schedule`
- `scanPaths` / `excludePaths` — scope injected into the user prompt
- `model` — Claude model override
- `mrLabels` — labels applied to created MRs

The frontmatter is validated via zod on agent load. The markdown body (after frontmatter) becomes the system prompt. `vteam.config.json` contains only global settings (baseBranch, platform, worktreeDir, tasks). Add custom agents by creating `vteam/agents/<name>/AGENT.md` — no config changes needed.

## Project structure

```
src/
├── bin.ts                        CLI entry point (commander)
├── types.ts                      All shared TypeScript types
├── commands/
│   ├── init.ts                   vteam init — scaffold vteam/ in any project
│   ├── run.ts                    vteam run <agent> — main orchestration flow
│   ├── cron.ts                   vteam cron — schedule/clear/status via crontab
│   ├── status.ts                 vteam status — task board overview
│   └── clean.ts                  vteam clean — prune worktrees, stale locks
├── config/
│   ├── schema.ts                 Zod schemas for config and agent frontmatter
│   ├── agent.ts                  Agent resolution and listing from AGENT.md files
│   └── load.ts                   Reads and validates vteam.config.json
├── orchestrator/
│   ├── agent-runner.ts           Spawns claude -p, captures output
│   └── prompt-builder.ts         Assembles layered prompts (single generic function)
├── memory/
│   ├── task-index.ts             Scans task dirs, builds title list for dedup
│   └── lock.ts                   Advisory file locking (atomic mkdir)
├── tasks/
│   └── task-file.ts              Task markdown CRUD (frontmatter + body)
├── worktree/
│   └── manager.ts                Git worktree create/remove/list/cleanup
├── integrations/
│   ├── merge-request.ts          GitHub (gh) and GitLab (glab) MR creation
│   └── pull-request.ts           PR review discovery, comment fetching, posting
└── templates/                    Scaffolding templates copied by vteam init
    ├── code-reviewer.agent.md
    ├── refactorer.agent.md
    ├── review-responder.agent.md
    └── vteam.config.json
```

## Commands

```
just build          # tsc + copy templates to dist/
just dev <args>     # run CLI via tsx (e.g. just dev run code-reviewer)
just lint           # tsc --noEmit + eslint
just test           # vitest
just clean          # rm -rf dist/
```

### CLI commands

```
vteam init                  # scaffold vteam/ directory
vteam run <agent>           # run a specific agent
vteam status                # show task board overview
vteam clean                 # prune worktrees, break stale locks
vteam cron schedule         # install crontab entries for agents with cron patterns
vteam cron clear            # remove all vteam crontab entries for this project
vteam cron status           # show currently scheduled agents
```

`vteam cron schedule` reads `cron` from each agent's frontmatter, resolves the absolute paths for cwd/npx/logs, and writes a fenced block into the user's crontab. Each project gets its own block (keyed by cwd), so multiple projects coexist safely. Logs are appended to `vteam/.logs/<agent>.log`.

## Before submitting changes

All three must pass before any commit or PR:

1. **`just test`** — all vitest tests must pass
2. **`just lint`** — no TypeScript errors, no eslint violations
3. **`just build`** — clean compilation to dist/

## v1 scope and constraints

- Ships with three default agents (`code-reviewer`, `refactorer`, `review-responder`). Custom agents supported by creating `vteam/agents/<name>/AGENT.md`.
- Supports both GitHub (`gh`) and GitLab (`glab`) — configured via `platform` in `vteam.config.json`.
- No Slack integration yet.
- No `--max-budget-usd` caps on agent runs.
- ESM-only (`"type": "module"`), Node >= 20, TypeScript with strict mode.
- Templates are non-TS files in `src/templates/` — the build step copies them to `dist/templates/`.

## Conventions

- Self-documenting code, no comments unless the why is non-obvious.
- Task filenames: `YYYY-MM-DD-HH-mm-ss-<slugified-title>.md`
- Task frontmatter uses YAML via `gray-matter`.
- Locking uses atomic `mkdir` with stale detection (30 min timeout).
- Agents without `worktree` (e.g. code-reviewer) write files directly using Claude's tools. Agents with `worktree` + `taskInput` (e.g. refactorer) commit changes; the orchestrator handles pushing, MR creation, and moving task files. Agents with `worktree` + `prInput` (e.g. review-responder) check out existing PR branches, commit changes, push, and post a comment on the PR.

## Keeping CLAUDE.md current

This file is the primary source of truth for how Claude understands vteam. When you make changes that alter vteam's behavior, update the relevant sections of this file in the same commit. Specifically:

- **New or removed CLI commands** — update Commands and project structure
- **New or changed agent frontmatter fields** — update Agent configuration
- **Changes to prompt assembly, agent invocation flags, or orchestrator flow** — update Architecture subsections
- **New or changed config options in `vteam.config.json`** — update Agent configuration or v1 scope
- **New conventions (file naming, locking, task lifecycle)** — update Conventions
- **New integrations or platform support** — update v1 scope and constraints
- **Added, moved, or deleted source files** — update Project structure tree

Do not update CLAUDE.md for internal refactors that don't change external behavior, test additions, or bug fixes that don't alter documented behavior.

## Dogfooding

This project has a `vteam/` directory that points the code-reviewer and refactorer at its own `src/`. Run `just dev run code-reviewer` to have vteam review itself.
