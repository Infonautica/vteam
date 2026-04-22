# vteam — Virtual Development Team Framework

## What this project is

An npm package (`vteam`) that orchestrates AI agents powered by `claude -p` (Claude Code's headless mode) to autonomously review codebases and implement fixes. The framework manages a task lifecycle (todo → done), runs agents in isolated git worktrees, and maintains a shared memory file so stateless agent invocations don't duplicate work.

The end user's workflow:
1. Define agent prompts in `AGENT.md` files
2. Run code-reviewer — it scans the codebase and writes findings straight to todo
3. Run refactorer (on a cron) — it picks up a task, implements it in a worktree, creates a branch + PR, moves the task to done

## Architecture

**Core principle: the orchestrator owns all state, Claude owns all intelligence.**

The TypeScript orchestrator handles state transitions — creating worktrees, moving task files, creating PRs. Claude (`-p` mode) handles reasoning — reading code, finding issues, implementing fixes. If Claude crashes mid-run, no state is corrupted because the orchestrator applies changes atomically after Claude finishes.

### How agents run

Each agent is invoked as a `claude -p` subprocess with:
- `--append-system-prompt-file` — the agent's `AGENT.md` content (via temp file)
- `--output-format stream-json` + `--verbose` — real-time streaming of tool calls; the runner accumulates `assistant` text events to extract the final result
- `--allowedTools` / `--disallowedTools` — per-agent tool permissions from frontmatter (uses the same syntax as native Claude Code CLI flags)
- `--no-session-persistence` — no session clutter

The orchestrator assembles a layered prompt: AGENT.md (role) → existing task titles (from task file frontmatter) → task content or PR review comments → output format instructions. The prompt is passed via stdin. Claude returns structured JSON as its final output — the orchestrator parses this to create task files, git commits, and PRs.

### Structured output contract

Claude's text output (extracted from the `result` field of the JSON envelope) must be valid JSON matching one of two schemas:

**Code-reviewer** (no worktree): `{ findings: [{title, severity, description, suggestedFix?, files}], summary, areasScanned }` — the orchestrator creates task files from each finding.

**Worktree agents** (refactorer, review-responder, test-writer): `{ status, summary, filesChanged, commitMessage: {subject, body}, blockerReason? }` — the orchestrator runs `git add -A` + `git commit` using the provided commit message, then pushes and creates PRs.

The output format instructions are injected into every agent's user prompt by the prompt builder (`buildOutputInstruction`). The orchestrator validates the output via zod schemas in `orchestrator/output-schema.ts`. Markdown fences are stripped before parsing as a fallback.

### Memory management

Each `claude -p` call is stateless. Memory is external:

- **Task files** — individual markdown files with YAML frontmatter in `todo/` or `done/`. Local-only and gitignored — they are workflow state, not source code. The orchestrator scans these directories at prompt-build time and injects a summary of existing task titles, severities, and statuses into every agent's prompt.
- **Deduplication** — The prompt builder reads all task files via `buildTaskIndex()` and includes them in the "Existing Tasks" section. Claude avoids reporting duplicates. No hashing. No separate overview file — task files are the single source of truth.

### Worktrees

Agents with `worktree: true` get an isolated git worktree (`git worktree add`). Claude edits files in the worktree but does not commit — it returns a structured JSON output with a commit message. The orchestrator then runs `git add -A` + `git commit`, pushes the branch, optionally creates a PR (if `autoPR: true`), and cleans up the worktree.

Agents with `input: "pr"` use `checkoutWorktree` to check out an existing PR branch (via `git fetch` + `git worktree add` from the remote tracking branch). Claude edits files and returns a commit message. The orchestrator commits, pushes to the same branch, posts a summary comment on the PR, and removes the `prTriggerLabel`. Discovery is label-based: the orchestrator searches for open PRs matching all `prFilterLabels` AND the `prTriggerLabel`. The user adds the trigger label when they want changes; the orchestrator removes it after the agent pushes. This avoids GitHub's limitation where PR authors cannot submit "Request changes" reviews on their own PRs.

### Agent configuration

Agents are defined at `vteam/agents/<name>/AGENT.md`. Each AGENT.md uses YAML frontmatter to declare orchestrator behavior:

```yaml
---
model: sonnet
cron: "0 */6 * * *"
worktree: true
input: task
autoPR: true
prCreateLabels: [vteam]
scanPaths: [src/]
excludePaths: [node_modules/, dist/]
---
```

- `worktree` (default: `false`) — run in an isolated git worktree, push branch on commit
- `input` (optional, `"task"` or `"pr"`) — `"task"`: pick a task from `todo/` queue, manage task lifecycle; `"pr"`: pick a PR with pending review feedback, check out its branch (requires `worktree: true`)
- `prFilterLabels` — labels used to filter PRs when `input` is `"pr"` (e.g. `[vteam]`)
- `prTriggerLabel` — transient label that signals "this PR needs work" (e.g. `vteam:changes-requested`); removed by the orchestrator after the agent pushes
- `autoPR` (default: `false`) — create a pull request after pushing
- `cron` — cron expression (5 fields: minute hour day month weekday) for scheduling via `vteam loop start`
- `scanPaths` / `excludePaths` — scope injected into the user prompt
- `model` — Claude model override
- `prCreateLabels` — labels applied to created PRs
- `allowedTools` — Claude Code tools the agent may use (same syntax as the `--allowedTools` CLI flag, e.g. `["Read", "Bash(git *)"]`)
- `disallowedTools` — Claude Code tools the agent may NOT use (same syntax as `--disallowedTools`)

The frontmatter is validated via zod on agent load. The markdown body (after frontmatter) becomes the system prompt. `vteam.config.json` contains only global settings (baseBranch, platform, worktreeDir, tasks). Add custom agents by creating `vteam/agents/<name>/AGENT.md` — no config changes needed.

### On-finish hooks

An agent can optionally have an `ON_FINISH.md` file at `vteam/agents/<name>/ON_FINISH.md`. When present, the orchestrator spawns a second `claude -p` call after the agent run completes (both success and failure). The hook receives a structured summary of the run outcome (status, branch, PR URL, task info, error) as its user prompt.

The ON_FINISH.md uses YAML frontmatter for its own configuration:

```yaml
---
model: haiku
allowedTools: ["Bash(curl *)", "mcp__slack__send_message"]
---

Post a notification to #eng-prs with the run result.
```

Supported frontmatter fields: `model`, `allowedTools`, `disallowedTools`. The markdown body becomes the hook's system prompt. The hook runs in the main project directory (not the worktree) and its failure does not affect the agent run's exit status.

## Project structure

```
src/
├── bin.ts                        CLI entry point (commander)
├── types.ts                      All shared TypeScript types
├── commands/
│   ├── init.ts                   vteam init — scaffold vteam/ in any project
│   ├── run.ts                    vteam run <agent> — main orchestration flow
│   ├── loop.ts                   vteam loop — long-lived scheduler process
│   ├── status.ts                 vteam status — task board overview
│   └── clean.ts                  vteam clean — prune worktrees, stale locks
├── config/
│   ├── schema.ts                 Zod schemas for config and agent frontmatter
│   ├── agent.ts                  Agent resolution and listing from AGENT.md files
│   └── load.ts                   Reads and validates vteam.config.json
├── orchestrator/
│   ├── agent-runner.ts           Spawns claude -p, captures structured JSON output
│   ├── output-schema.ts          Zod schemas for Claude's structured output (reviewer/committer)
│   └── prompt-builder.ts         Assembles layered prompts + output format instructions
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
vteam loop start            # start long-lived scheduler for agents with cron patterns
vteam loop status           # show agents with cron schedules and next fire times
```

`vteam loop start` runs a foreground Node.js process that schedules agents based on `cron` patterns in their frontmatter (parsed via `croner`). Each agent run spawns a subprocess (`vteam run <agent>`). If an agent is still running when its next cron tick fires, the tick is skipped. Logs are appended to `vteam/.logs/<agent>.log`. Stop with Ctrl+C.

## Before submitting changes

All three must pass before any commit or PR:

1. **`just test`** — all vitest tests must pass
2. **`just lint`** — no TypeScript errors, no eslint violations
3. **`just build`** — clean compilation to dist/

## v1 scope and constraints

- Ships with four default agents (`code-reviewer`, `refactorer`, `review-responder`, `test-writer`). Custom agents supported by creating `vteam/agents/<name>/AGENT.md`.
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
- Task files are local-only and gitignored (`vteam/tasks/`). The real shared artifacts are PRs.
- Claude produces structured JSON output; the orchestrator handles all state mutations (task file creation, git commits, pushing, PR creation, moving task files). Agents without `worktree` (e.g. code-reviewer) return findings as JSON — the orchestrator creates task files. Agents with `worktree` (e.g. refactorer, review-responder, test-writer) edit files and return a commit message — the orchestrator commits, pushes, and creates PRs.

## Keeping CLAUDE.md and README.md current

This file is the primary source of truth for how Claude understands vteam. `README.md` is the public-facing documentation for users. When you make changes that alter vteam's behavior, update the relevant sections of both files in the same commit. Specifically:

- **New or removed CLI commands** — update Commands and project structure
- **New or changed agent frontmatter fields** — update Agent configuration
- **Changes to prompt assembly, agent invocation flags, or orchestrator flow** — update Architecture subsections
- **New or changed config options in `vteam.config.json`** — update Agent configuration or v1 scope
- **New conventions (file naming, locking, task lifecycle)** — update Conventions
- **New integrations or platform support** — update v1 scope and constraints
- **Added, moved, or deleted source files** — update Project structure tree

Do not update CLAUDE.md or README.md for internal refactors that don't change external behavior, test additions, or bug fixes that don't alter documented behavior.

## Dogfooding

This project has a `vteam/` directory that points the code-reviewer and refactorer at its own `src/`. Run `just dev run code-reviewer` to have vteam review itself.
