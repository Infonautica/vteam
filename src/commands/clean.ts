import { resolve } from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { cleanupOrphanedWorktrees } from "../worktree/manager.js";
import { breakLock } from "../memory/lock.js";

export async function cleanCommand(): Promise<void> {
  const cwd = process.cwd();
  const config = loadConfigSafe(cwd);
  const worktreeDir = config?.worktreeDir ?? ".vteam-worktrees";

  console.log("=== vteam clean ===\n");

  // Clean up worktrees
  try {
    const cleaned = cleanupOrphanedWorktrees(cwd, worktreeDir);
    if (cleaned.length > 0) {
      console.log(`Removed ${cleaned.length} worktree(s):`);
      for (const p of cleaned) {
        console.log(`  ${p}`);
      }
    } else {
      console.log("No orphaned worktrees found.");
    }
  } catch {
    console.log("No worktrees to clean (or not a git repo).");
  }

  // Clean up locks
  const locksDir = resolve(cwd, "vteam", ".locks");
  if (existsSync(locksDir)) {
    const lockDirs = readdirSync(locksDir).filter((f) => f.endsWith(".lock"));
    let brokenCount = 0;
    for (const lockDir of lockDirs) {
      const lockPath = resolve(locksDir, lockDir.replace(".lock", ""));
      if (breakLock(lockPath)) {
        console.log(`Broke stale lock: ${lockDir}`);
        brokenCount++;
      }
    }
    if (brokenCount === 0) {
      console.log("No stale locks found.");
    }
  }

  console.log("\nDone.");
}

function loadConfigSafe(cwd: string): { worktreeDir?: string } | null {
  try {
    const configPath = resolve(cwd, "vteam", "vteam.config.json");
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}
