import { resolve, join } from "node:path";
import { homedir } from "node:os";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
} from "node:fs";

function defaultSkillsDir(): string {
  return join(homedir(), ".claude", "skills");
}

interface SkillEntry {
  name: string;
  source: string;
}

export function discoverSkills(cwd: string): SkillEntry[] {
  const skillsDir = resolve(cwd, "skills");
  if (!existsSync(skillsDir)) return [];

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(skillsDir, d.name, "SKILL.md")))
    .map((d) => ({ name: d.name, source: resolve(skillsDir, d.name) }));
}

export async function installSkills(cwd: string, targetDir: string): Promise<void> {
  const skills = discoverSkills(cwd);

  if (skills.length === 0) {
    console.error("No skills found. Skills should be directories under skills/ containing a SKILL.md file.");
    process.exit(1);
  }

  mkdirSync(targetDir, { recursive: true });

  let installed = 0;
  for (const skill of skills) {
    const target = join(targetDir, skill.name);

    try {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) {
        const existing = readlinkSync(target);
        if (existing === skill.source) {
          console.log(`  ${skill.name} — already installed`);
          continue;
        }
        console.log(`  ${skill.name} — updating (was linked to ${existing})`);
        unlinkSync(target);
      } else {
        console.error(`  ${skill.name} — skipped: ${target} exists and is not a symlink`);
        continue;
      }
    } catch {
      // Path doesn't exist — proceed to create symlink
    }

    symlinkSync(skill.source, target);
    console.log(`  ${skill.name} — installed`);
    installed++;
  }

  if (installed > 0) {
    console.log(`\nInstalled ${installed} skill(s). Use /<skill-name> in Claude Code from any project.`);
  } else {
    console.log("\nAll skills already installed.");
  }
}

export async function uninstallSkills(cwd: string, targetDir: string): Promise<void> {
  const skills = discoverSkills(cwd);

  if (skills.length === 0) {
    console.error("No skills found. Skills should be directories under skills/ containing a SKILL.md file.");
    process.exit(1);
  }

  let removed = 0;
  for (const skill of skills) {
    const target = join(targetDir, skill.name);

    try {
      const stat = lstatSync(target);
      if (!stat.isSymbolicLink()) {
        console.error(`  ${skill.name} — skipped: ${target} is not a symlink`);
        continue;
      }
    } catch {
      console.log(`  ${skill.name} — not installed`);
      continue;
    }

    unlinkSync(target);
    console.log(`  ${skill.name} — removed`);
    removed++;
  }

  if (removed > 0) {
    console.log(`\nRemoved ${removed} skill(s). Source files in this repo are untouched.`);
  } else {
    console.log("\nNo installed skills to remove.");
  }
}

export async function skillInstallCommand(): Promise<void> {
  await installSkills(process.cwd(), defaultSkillsDir());
}

export async function skillUninstallCommand(): Promise<void> {
  await uninstallSkills(process.cwd(), defaultSkillsDir());
}
