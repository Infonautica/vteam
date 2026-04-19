# vteam — Virtual Development Team Framework

## What this project is

An npm package (`vteam`) that orchestrates AI agents powered by `claude -p` (Claude Code's headless mode) to autonomously review codebases and implement fixes. The framework manages a task lifecycle (backlog → todo → done), runs agents in isolated git worktrees, and maintains a shared memory file so stateless agent invocations don't duplicate work.

The end user's workflow:
1. Define agent prompts in `AGENT.md` files
2. Run code-reviewer — it scans the codebase and writes findings to backlog
3. Human triages backlog, moves useful tasks to todo
4. Run refactorer (on a cron) — it picks up a task, implements it in a worktree, creates a branch + MR, moves the task to done

## Architecture

**Core principle: the orchestrator owns all state, Claude owns all intelligence.**

The TypeScript orchestrator handles state transitions — creating worktrees, moving task files, updating `overview.md`, creating MRs. Claude (`-p` mode) handles reasoning — reading code, finding issues, implementing fixes. If Claude crashes mid-run, no state is corrupted because the orchestrator applies changes atomically after Claude finishes.

### How agents run

Each agent is invoked as a `claude -p` subprocess with:
- `--append-system-prompt` — the agent's `AGENT.md` content
- `--json-schema` — enforces structured JSON output
- `--permission-mode bypassPermissions` — allows all tools in headless mode
- `--output-format json` — machine-parseable response
- `--no-session-persistence` — no session clutter

The orchestrator assembles a layered prompt: AGENT.md (role) → overview.md (memory) → task content → instructions. Claude returns structured JSON validated against the schema. The orchestrator parses it and acts on the results.

### Memory management

Each `claude -p` call is stateless. Memory is external:

- **`vteam/tasks/overview.md`** — flat, append-only list of all tasks. Injected into every agent's prompt so they know what's already been found/done. One line per task, status inline. Minimizes git merge conflicts.
- **Task files** — individual markdown files with YAML frontmatter in `backlog/`, `todo/`, or `done/`. Self-contained descriptions of findings.
- **Deduplication** — Claude reads the overview and avoids reporting existing issues. The orchestrator also does a normalized title comparison as a safety net. No hashing.

### Worktrees

The refactorer creates a git worktree (`git worktree add`) for each task so it works on an isolated copy of the repo. After Claude commits changes in the worktree, the orchestrator pushes the branch, creates an MR, and cleans up the worktree.

## Project structure

```
src/
├── bin.ts                        CLI entry point (commander)
├── types.ts                      All shared TypeScript types
├── commands/
│   ├── init.ts                   vteam init — scaffold vteam/ in any project
│   ├── run.ts                    vteam run <agent> — main orchestration flow
│   ├── status.ts                 vteam status — task board overview
│   └── clean.ts                  vteam clean — prune worktrees, stale locks
├── orchestrator/
│   ├── agent-runner.ts           Spawns claude -p, captures output
│   ├── prompt-builder.ts         Assembles layered prompts
│   └── output-parser.ts          Parses Claude's JSON envelope + validates
├── memory/
│   ├── overview.ts               Read/write/append overview.md
│   ├── task-index.ts             Scans task dirs, builds title list for dedup
│   └── lock.ts                   Advisory file locking (atomic mkdir)
├── tasks/
│   └── task-file.ts              Task markdown CRUD (frontmatter + body)
├── worktree/
│   └── manager.ts                Git worktree create/remove/list/cleanup
├── integrations/
│   └── merge-request.ts          GitHub (gh) and GitLab (glab) MR creation
└── templates/                    Scaffolding templates copied by vteam init
    ├── code-reviewer.agent.md
    ├── refactorer.agent.md
    ├── overview.md
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

## v1 scope and constraints

- Two hardcoded agents: `code-reviewer` and `refactorer`. Custom agents are v2.
- Supports both GitHub (`gh`) and GitLab (`glab`) — configured via `platform` in `vteam.config.json`.
- No Slack integration yet.
- No `--max-budget-usd` caps on agent runs.
- ESM-only (`"type": "module"`), Node >= 20, TypeScript with strict mode.
- Templates are non-TS files in `src/templates/` — the build step copies them to `dist/templates/`.

## Conventions

- Self-documenting code, no comments unless the why is non-obvious.
- Task filenames: `DD-MM-YYYY-HH:mm-<slugified-title>.md`
- Task frontmatter uses YAML via `gray-matter`.
- Locking uses atomic `mkdir` with stale detection (30 min timeout).
- The orchestrator never lets Claude write to `overview.md` or move task files — it does that itself after parsing Claude's structured output.

## Dogfooding

This project has a `vteam/` directory that points the code-reviewer and refactorer at its own `src/`. Run `just dev run code-reviewer` to have vteam review itself.
