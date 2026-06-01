import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readlinkSync, existsSync, lstatSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { discoverSkills, installSkills, uninstallSkills } from "./skill.js";

let tmp: string;
let projectDir: string;
let targetDir: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vteam-skill-test-"));
  projectDir = resolve(tmp, "project");
  targetDir = resolve(tmp, "claude-skills");
  mkdirSync(projectDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function createSkill(name: string): void {
  const skillDir = resolve(projectDir, "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(resolve(skillDir, "SKILL.md"), `# ${name}\n`);
}

describe("discoverSkills", () => {
  it("returns empty when no skills/ directory exists", () => {
    expect(discoverSkills(projectDir)).toEqual([]);
  });

  it("returns empty when skills/ has no subdirectories with SKILL.md", () => {
    mkdirSync(resolve(projectDir, "skills", "empty-dir"), { recursive: true });
    expect(discoverSkills(projectDir)).toEqual([]);
  });

  it("discovers skills with SKILL.md files", () => {
    createSkill("my-skill");
    createSkill("another-skill");

    const skills = discoverSkills(projectDir);
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(["another-skill", "my-skill"]);
  });

  it("ignores files in skills/ that are not directories", () => {
    mkdirSync(resolve(projectDir, "skills"), { recursive: true });
    writeFileSync(resolve(projectDir, "skills", "README.md"), "# readme\n");
    createSkill("real-skill");

    const skills = discoverSkills(projectDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("real-skill");
  });
});

describe("installSkills", () => {
  it("creates symlinks in the target directory", async () => {
    createSkill("my-skill");

    await installSkills(projectDir, targetDir);

    const link = resolve(targetDir, "my-skill");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(resolve(projectDir, "skills", "my-skill"));
  });

  it("creates the target directory if it does not exist", async () => {
    createSkill("my-skill");
    const nested = resolve(tmp, "deep", "nested", "skills");

    await installSkills(projectDir, nested);

    expect(existsSync(resolve(nested, "my-skill"))).toBe(true);
  });

  it("skips already-installed skills with correct symlink", async () => {
    createSkill("my-skill");

    await installSkills(projectDir, targetDir);
    await installSkills(projectDir, targetDir);

    expect(lstatSync(resolve(targetDir, "my-skill")).isSymbolicLink()).toBe(true);
  });

  it("updates symlinks pointing to a different location", async () => {
    createSkill("my-skill");
    mkdirSync(targetDir, { recursive: true });
    symlinkSync("/some/old/path", resolve(targetDir, "my-skill"));

    await installSkills(projectDir, targetDir);

    expect(readlinkSync(resolve(targetDir, "my-skill"))).toBe(
      resolve(projectDir, "skills", "my-skill"),
    );
  });

  it("skips non-symlink entries at the target path", async () => {
    createSkill("my-skill");
    mkdirSync(resolve(targetDir, "my-skill"), { recursive: true });

    await installSkills(projectDir, targetDir);

    expect(lstatSync(resolve(targetDir, "my-skill")).isSymbolicLink()).toBe(false);
  });

  it("exits when no skills are found", async () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    await expect(installSkills(projectDir, targetDir)).rejects.toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });

  it("installs multiple skills", async () => {
    createSkill("skill-a");
    createSkill("skill-b");

    await installSkills(projectDir, targetDir);

    expect(lstatSync(resolve(targetDir, "skill-a")).isSymbolicLink()).toBe(true);
    expect(lstatSync(resolve(targetDir, "skill-b")).isSymbolicLink()).toBe(true);
  });
});

describe("uninstallSkills", () => {
  it("removes symlinks from the target directory", async () => {
    createSkill("my-skill");
    await installSkills(projectDir, targetDir);

    await uninstallSkills(projectDir, targetDir);

    expect(existsSync(resolve(targetDir, "my-skill"))).toBe(false);
  });

  it("reports skills that are not installed", async () => {
    createSkill("my-skill");

    await uninstallSkills(projectDir, targetDir);
    // Should not throw — just logs "not installed"
  });

  it("skips non-symlink entries", async () => {
    createSkill("my-skill");
    mkdirSync(resolve(targetDir, "my-skill"), { recursive: true });

    await uninstallSkills(projectDir, targetDir);

    expect(existsSync(resolve(targetDir, "my-skill"))).toBe(true);
  });

  it("exits when no skills are found", async () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    await expect(uninstallSkills(projectDir, targetDir)).rejects.toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });

  it("removes multiple skills", async () => {
    createSkill("skill-a");
    createSkill("skill-b");
    await installSkills(projectDir, targetDir);

    await uninstallSkills(projectDir, targetDir);

    expect(existsSync(resolve(targetDir, "skill-a"))).toBe(false);
    expect(existsSync(resolve(targetDir, "skill-b"))).toBe(false);
  });
});
