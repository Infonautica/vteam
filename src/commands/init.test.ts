import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

let tmp: string;
let originalCwd: () => string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vteam-init-test-"));
  originalCwd = process.cwd;
  process.cwd = () => tmp;
});

afterEach(() => {
  process.cwd = originalCwd;
  rmSync(tmp, { recursive: true, force: true });
});

describe("initCommand", () => {
  it("scaffolds the vteam directory structure", async () => {
    const { initCommand } = await import("./init.js");
    await initCommand();

    expect(existsSync(resolve(tmp, "vteam"))).toBe(true);
    expect(existsSync(resolve(tmp, "vteam", "vteam.config.json"))).toBe(true);
    expect(existsSync(resolve(tmp, "vteam", "agents", "code-reviewer", "AGENT.md"))).toBe(true);
    expect(existsSync(resolve(tmp, "vteam", "agents", "refactorer", "AGENT.md"))).toBe(true);
    expect(existsSync(resolve(tmp, "vteam", "tasks", "overview.md"))).toBe(true);
    expect(existsSync(resolve(tmp, "vteam", "tasks", "backlog", ".gitkeep"))).toBe(true);
    expect(existsSync(resolve(tmp, "vteam", "tasks", "todo", ".gitkeep"))).toBe(true);
    expect(existsSync(resolve(tmp, "vteam", "tasks", "done", ".gitkeep"))).toBe(true);
  });

  it("creates .gitignore with worktree entry", async () => {
    const { initCommand } = await import("./init.js");
    await initCommand();

    const gitignore = readFileSync(resolve(tmp, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".vteam-worktrees/");
  });

  it("appends to existing .gitignore without duplicating", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(resolve(tmp, ".gitignore"), "node_modules/\n", "utf-8");

    const { initCommand } = await import("./init.js");
    await initCommand();

    const gitignore = readFileSync(resolve(tmp, ".gitignore"), "utf-8");
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).toContain(".vteam-worktrees/");
  });

  it("exits if vteam/ already exists", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(resolve(tmp, "vteam"));

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const { initCommand } = await import("./init.js");
    await expect(initCommand()).rejects.toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });

  it("creates valid JSON config", async () => {
    const { initCommand } = await import("./init.js");
    await initCommand();

    const config = JSON.parse(
      readFileSync(resolve(tmp, "vteam", "vteam.config.json"), "utf-8"),
    );
    expect(config.baseBranch).toBe("main");
    expect(config.platform).toBe("github");
    expect(config.agents).toBeUndefined();
  });
});
