# Setting up the create-vteam-agent skill

The `create-vteam-agent` skill source lives in this repo (`skills/create-vteam-agent/SKILL.md`) but needs to be available as a **user-scoped** Claude Code skill so it works from any project.

## Symlink setup

Create a symlink from your user-scoped skills directory to this repo:

```bash
ln -s /Users/leoniddanilov/Desktop/Projects/project-vd/skills/create-vteam-agent ~/.claude/skills/create-vteam-agent
```

That's it. Claude Code follows symlinks when loading skills, so changes you make here are immediately available everywhere.

## Verify

From any project directory, run Claude Code and type `/create-vteam-agent`. The skill should appear in the skill list.

## How it works

- `~/.claude/skills/` is where Claude Code loads user-scoped skills from
- Each skill is a directory containing a `SKILL.md` file
- The symlink makes Claude Code see `~/.claude/skills/create-vteam-agent/SKILL.md` which points to the real file in this repo
- Edits in this repo are reflected immediately — no copy step, no rebuild

## If you move this repo

The symlink uses an absolute path. If you relocate the repo, recreate the symlink:

```bash
rm ~/.claude/skills/create-vteam-agent
ln -s /new/path/to/project-vd/skills/create-vteam-agent ~/.claude/skills/create-vteam-agent
```

## Removing the skill

```bash
rm ~/.claude/skills/create-vteam-agent
```

This only removes the symlink — the source files in this repo are untouched.

## Note on the skills git repo

Your `~/.claude/skills/` is tracked as a separate git repo (`Infonautica/skills`). The symlink will appear as a new entry there. You can commit it if you want the link tracked, but the symlink target is an absolute path specific to this machine — keep that in mind if you share the skills repo across machines.
