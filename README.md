# vteam

A virtual development team framework that orchestrates AI agents powered by [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to autonomously review codebases and implement fixes.

You define agent prompts, triage findings, and review merge requests. vteam handles everything else: scheduling agent runs, managing task lifecycle, isolating work in git worktrees, and creating branches and pull requests.

## How it works

vteam runs Claude in headless mode (`claude -p`) as a subprocess. Each agent invocation is stateless — all memory is external, injected into the prompt as markdown files.

```
┌──────────────────────────────────────────────────────┐
│                    Orchestrator (TypeScript)          │
│                                                      │
│  Owns all state: tasks, overview.md, worktrees, MRs  │
│                                                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐ │
│  │ Lock mgr │   │ Worktree │   │ MR integration   │ │
│  │ (mkdir)  │   │ manager  │   │ (gh / glab CLI)  │ │
│  └──────────┘   └──────────┘   └──────────────────┘ │
└──────────────┬───────────────────────────────────────┘
               │ spawns claude -p
               ▼
┌──────────────────────────────────────────────────────┐
│                Claude (headless)                      │
│                                                      │
│  Owns all intelligence: reads code, finds issues,    │
│  implements fixes, writes task files, commits         │
└──────────────────────────────────────────────────────┘
```

The orchestrator never reasons about code. Claude never moves task files or pushes branches. This separation means if Claude crashes mid-run, no state is corrupted — the orchestrator applies state transitions only after Claude finishes.

## Prerequisites

- **Node.js** >= 20
- **Claude Code** CLI — `claude` must be on your PATH ([install guide](https://docs.anthropic.com/en/docs/claude-code/getting-started))
- **Git** — the project must be a git repository
- **`gh`** (GitHub CLI) or **`glab`** (GitLab CLI) — required for automatic pull/merge request creation. Without it, branches are pushed but MRs must be created manually.

## Installation

```bash
npm install -g vteam
```

Or run from source:

```bash
git clone git@github.com:Infonautica/vteam.git
cd vteam
npm install
npm run build
npm link
```

## Quick start

```bash
cd your-project

# 1. Scaffold the vteam directory
vteam init

# 2. Edit the config
$EDITOR vteam/vteam.config.json

# 3. Run the code reviewer — finds issues, writes them to backlog
vteam run code-reviewer

# 4. Triage: move tasks you want fixed from backlog/ to todo/
mv vteam/tasks/backlog/some-finding.md vteam/tasks/todo/

# 5. Run the refactorer — picks a task, fixes it, pushes a branch, opens a PR
vteam run refactorer

# 6. Review the PR as you would any other
```

## Commands

### `vteam init`

Scaffolds a `vteam/` directory in the current project:

```
vteam/
├── vteam.config.json           # Project-level configuration
├── code-reviewer/
│   └── AGENT.md                # Code reviewer prompt/personality
├── refactorer/
│   └── AGENT.md                # Refactorer prompt/personality
└── tasks/
    ├── overview.md             # Shared memory — all known tasks
    ├── backlog/                # Findings from code reviewer
    ├── todo/                   # Human-triaged tasks ready for implementation
    └── done/                   # Completed tasks
```

Also adds `.vteam-worktrees/` to `.gitignore`.

Will refuse to run if `vteam/` already exists.

### `vteam run code-reviewer`

1. Acquires an advisory lock (`vteam/.locks/code-reviewer.lock`)
2. Reads the agent prompt from `vteam/code-reviewer/AGENT.md`
3. Reads `vteam/tasks/overview.md` (shared memory) and injects it into the prompt so Claude knows what's already been found
4. Spawns `claude -p` — Claude scans the codebase, creates task files directly in `vteam/tasks/backlog/`, and updates `overview.md`
5. Releases the lock

Claude uses its own file tools (Read, Write, Edit) to create findings. The orchestrator just manages the lifecycle around the Claude invocation.

### `vteam run refactorer`

1. Acquires an advisory lock (`vteam/.locks/refactorer.lock`)
2. Scans `vteam/tasks/todo/` for the highest-severity task (skips tasks that have failed 3+ times)
3. Creates a git worktree at `.vteam-worktrees/vteam/<task-slug>` branched from the base branch
4. Builds the prompt with the task description, overview, and agent instructions
5. Spawns `claude -p` in the worktree — Claude implements the fix and commits
6. If Claude committed changes:
   - Force-pushes the branch to origin
   - Creates a pull/merge request via `gh` or `glab` (falls back gracefully if CLI is missing or labels don't exist)
   - Moves the task file from `todo/` to `done/` with completion metadata
   - Updates `overview.md` status
7. If Claude made no commit: increments `retry-count` in the task frontmatter
8. Cleans up the worktree
9. Releases the lock

### `vteam status`

Displays task counts by status (backlog, todo, done), lists in-progress todo items with retry counts, shows active worktrees, and prints recent run IDs.

### `vteam clean`

Removes orphaned worktrees and breaks stale locks. Run this after a crash or if a lock is stuck.

## Configuration

`vteam/vteam.config.json`:

```json
{
  "baseBranch": "main",
  "platform": "github",
  "worktreeDir": ".vteam-worktrees",
  "agents": {
    "code-reviewer": {
      "model": "sonnet",
      "scanPaths": ["src/"],
      "excludePaths": ["node_modules/", "dist/"]
    },
    "refactorer": {
      "model": "sonnet",
      "autoMR": true,
      "mrLabels": ["vteam", "automated"]
    }
  },
  "tasks": {
    "maxRetries": 3
  }
}
```

| Field | Description |
|---|---|
| `baseBranch` | Branch to create worktrees from and target MRs against |
| `platform` | `"github"` or `"gitlab"` — determines which CLI (`gh` / `glab`) is used for MR creation |
| `worktreeDir` | Where worktrees are created (relative to repo root). Gitignored. |
| `agents.<name>.model` | Claude model to use (e.g., `"sonnet"`, `"opus"`, `"haiku"`) |
| `agents.code-reviewer.scanPaths` | Directories to review (empty = entire repo) |
| `agents.code-reviewer.excludePaths` | Directories to skip |
| `agents.refactorer.autoMR` | Set to `false` to skip MR creation (branch is still pushed) |
| `agents.refactorer.mrLabels` | Labels to apply to MRs. Silently skipped if they don't exist in the repo. |
| `tasks.maxRetries` | How many times the refactorer retries a failing task before skipping it |

## Task lifecycle

```
code-reviewer finds issue
        │
        ▼
    ┌────────┐       human triage       ┌──────┐      refactorer      ┌──────┐
    │ backlog │ ───────────────────────▶ │ todo │ ──────────────────▶ │ done │
    └────────┘    mv backlog/ todo/     └──────┘   branch + MR       └──────┘
```

### Task file format

Task files are markdown with YAML frontmatter. Named `DD-MM-YYYY-HH:mm-<slugified-title>.md`.

```markdown
---
title: Missing null check in auth middleware
created: 2026-04-18T14:30:00Z
status: backlog
severity: high
found-by: code-reviewer
files:
  - src/middleware/auth.ts:45
---

## Description

The `verifyToken` function does not check for null token before calling
`jwt.verify()`, which throws an unhandled exception.

## Suggested Fix

Add a guard clause at the top of `verifyToken`.

## Affected Files

- `src/middleware/auth.ts:45` — missing null check
```

When a task is completed, the orchestrator adds to its frontmatter:

```yaml
completed: 2026-04-19T10:15:00Z
branch: vteam/missing-null-check-auth
mr-url: https://github.com/org/repo/pull/42
```

### Severity levels

`critical` > `high` > `medium` > `low`

The refactorer picks the highest-severity task first.

## Memory: overview.md

`vteam/tasks/overview.md` is a flat, append-only file listing every task ever created. It's injected into every agent's prompt so they know what's been found, what's in progress, and what's done.

```markdown
# Virtual Team — Task Overview

## Tasks

- **[backlog]** 18-04-2026-14:30 | high | Null check missing in auth middleware | `src/middleware/auth.ts` | [→ backlog/18-04-2026-14:30-null-check-auth.md](backlog/18-04-2026-14:30-null-check-auth.md)
- **[done]** 17-04-2026-09:15 | medium | Unused imports in UserService | `src/services/user.ts` | branch: `vteam/unused-imports` | MR: #12 | [→ done/17-04-2026-09:15-unused-imports-user.md](done/17-04-2026-09:15-unused-imports-user.md)
```

Deduplication is simple: Claude reads the full overview and avoids reporting existing issues. The orchestrator also does a basic normalized title comparison as a safety net.

There are no size limits on overview.md in v1. If it grows beyond the context window in practice, archiving done entries is the planned mitigation.

## Agents

v1 ships with two hardcoded agents. Custom agents are planned for v2.

### Code reviewer

- Read-only — scans the codebase, never modifies source files
- Creates task files in `vteam/tasks/backlog/` and updates `overview.md`
- Limited to 5 findings per run (configurable in the AGENT.md prompt)
- Prioritizes severity: security bugs > performance > code quality

### Refactorer

- Picks one task per run from `todo/`
- Works in an isolated git worktree (never touches the main working tree)
- Makes minimal, focused changes following existing code style
- Commits with `vteam: <task-title>` message format
- Does not push — the orchestrator handles pushing and MR creation

Both agents receive `overview.md` in their prompt, giving them full context of past and present work.

## Caveats and known limitations

### Locking

vteam uses advisory file locking via atomic `mkdir` (POSIX guarantees this is atomic). Each lock directory contains an `info.json` with the holding PID and timestamp.

- **Stale detection**: A lock is considered stale if the holding process is dead (checked via `kill -0`) or the lock is older than 30 minutes.
- **Not distributed**: Locks are local to the filesystem. If you run vteam from multiple machines against the same repo (e.g., via NFS), locks won't protect against concurrent runs.
- **Crash recovery**: If vteam crashes while holding a lock, the lock may persist. Run `vteam clean` to break stale locks, or wait 30 minutes for automatic stale detection.
- **Same agent concurrency**: Two runs of the same agent are serialized by the lock. Different agents (code-reviewer + refactorer) can run concurrently.

### Worktrees

- **Crash cleanup**: If the refactorer crashes after creating a worktree but before cleanup, the worktree and its branch persist. Run `vteam clean` to remove orphans.
- **Stale branches**: On retry, `createWorktree` deletes any existing local branch with the same name before creating a new worktree. Remote branches are overwritten via `git push --force`.
- **Force push**: vteam force-pushes to its own branches (`vteam/*`). This is safe because these branches are ephemeral and owned by the tool — no human should be pushing to them. But if you manually commit to a `vteam/*` branch, those commits will be lost on the next refactorer run.
- **Disk space**: Each worktree is a full checkout. On large repos, this can be significant. Worktrees are cleaned up after each run.

### MR / PR creation

- Requires `gh` (GitHub) or `glab` (GitLab) CLI installed and authenticated.
- If the CLI is missing, the branch is still pushed — you just need to create the MR manually.
- If configured labels don't exist in the repository, MR creation retries without labels.
- Set `autoMR: false` in config to skip MR creation entirely.

### General

- **No budget caps**: There's no `--max-budget-usd` on agent runs. A single code-reviewer or refactorer invocation uses one Claude session with no spending limit. Monitor usage via your Anthropic dashboard.
- **No rollback**: If the refactorer's changes break something, you close the PR. There's no automatic revert mechanism.
- **Overview.md grows forever**: In v1, completed tasks stay in overview.md. Large histories may eventually hit context limits.
- **Title-based dedup only**: Duplicate detection relies on Claude reading the overview and a basic string comparison. Similar but differently-worded findings may slip through.

## Development

```bash
just build          # tsc + copy templates to dist/
just dev <args>     # run CLI via tsx (e.g., just dev run code-reviewer)
just lint           # tsc --noEmit + eslint
just test           # vitest
just clean          # rm -rf dist/
```

### Dogfooding

This project has its own `vteam/` directory pointing the agents at `src/`. Run `just dev run code-reviewer` to have vteam review itself.

### npm dependencies

| Package | Purpose |
|---|---|
| `commander` | CLI argument parsing |
| `gray-matter` | YAML frontmatter parsing/serialization in task markdown files |
| `slugify` | Generates filesystem-safe slugs for task filenames and branch names |

### System dependencies

| Tool | Required | Purpose |
|---|---|---|
| `claude` | Yes | Claude Code CLI — all agent intelligence |
| `git` | Yes | Worktree management, branch operations |
| `gh` | For GitHub | Pull request creation (`gh pr create`) |
| `glab` | For GitLab | Merge request creation (`glab mr create`) |

## License

MIT
