import { resolve } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { buildTaskIndex } from "../memory/task-index.js";
import { listWorktrees } from "../worktree/manager.js";

export async function statusCommand(): Promise<void> {
  const cwd = process.cwd();
  const tasksDir = resolve(cwd, "vteam", "tasks");

  if (!existsSync(tasksDir)) {
    console.error("No vteam/tasks directory found. Run 'vteam init' first.");
    process.exit(1);
  }

  const index = buildTaskIndex(tasksDir);

  const backlog = index.byStatus.get("backlog") ?? [];
  const todo = index.byStatus.get("todo") ?? [];
  const done = index.byStatus.get("done") ?? [];

  console.log("=== vteam status ===\n");
  console.log(`  Backlog: ${backlog.length} tasks`);
  console.log(`  Todo:    ${todo.length} tasks`);
  console.log(`  Done:    ${done.length} tasks`);
  console.log(`  Total:   ${index.all.length} tasks`);

  if (todo.length > 0) {
    console.log("\n--- Todo ---");
    for (const t of todo) {
      const retries = t.frontmatter["retry-count"] ?? 0;
      const retryNote = retries > 0 ? ` (retries: ${retries})` : "";
      console.log(`  [${t.frontmatter.severity}] ${t.frontmatter.title}${retryNote}`);
    }
  }

  if (backlog.length > 0) {
    console.log("\n--- Backlog (latest 5) ---");
    for (const t of backlog.slice(-5)) {
      console.log(`  [${t.frontmatter.severity}] ${t.frontmatter.title}`);
    }
  }

  try {
    const worktrees = listWorktrees(cwd);
    const vteamWorktrees = worktrees.filter((w) =>
      w.branch.includes("vteam/"),
    );
    if (vteamWorktrees.length > 0) {
      console.log("\n--- Active worktrees ---");
      for (const w of vteamWorktrees) {
        console.log(`  ${w.branch} → ${w.path}`);
      }
    }
  } catch {
    // Not a git repo or no worktrees
  }

  const runsDir = resolve(cwd, "vteam", ".runs");
  if (existsSync(runsDir)) {
    const runFiles = readdirSync(runsDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, 3);

    if (runFiles.length > 0) {
      console.log("\n--- Recent runs ---");
      for (const f of runFiles) {
        console.log(`  ${f.replace(".json", "")}`);
      }
    }
  }

  console.log();
}
