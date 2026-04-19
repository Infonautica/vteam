import { describe, it, expect } from "vitest";
import { vteamConfigSchema, agentFrontmatterSchema } from "./schema.js";

describe("vteamConfigSchema", () => {
  const validConfig = {
    baseBranch: "main",
    platform: "github",
    worktreeDir: ".vteam-worktrees",
    tasks: { maxRetries: 3 },
  };

  it("accepts a valid config", () => {
    const result = vteamConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("rejects unknown platform", () => {
    const result = vteamConfigSchema.safeParse({
      ...validConfig,
      platform: "bitbucket",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing baseBranch", () => {
    const { baseBranch: _, ...noBase } = validConfig;
    const result = vteamConfigSchema.safeParse(noBase);
    expect(result.success).toBe(false);
  });

  it("rejects negative maxRetries", () => {
    const result = vteamConfigSchema.safeParse({
      ...validConfig,
      tasks: { maxRetries: -1 },
    });
    expect(result.success).toBe(false);
  });
});

describe("agentFrontmatterSchema", () => {
  it("accepts empty frontmatter (bare AGENT.md)", () => {
    const result = agentFrontmatterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts full frontmatter", () => {
    const result = agentFrontmatterSchema.safeParse({
      model: "sonnet",
      worktree: true,
      taskInput: true,
      autoMR: true,
      mrLabels: ["vteam"],
      scanPaths: ["src/"],
      excludePaths: ["node_modules/"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects autoMR without worktree", () => {
    const result = agentFrontmatterSchema.safeParse({
      autoMR: true,
      worktree: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts autoMR with worktree", () => {
    const result = agentFrontmatterSchema.safeParse({
      autoMR: true,
      worktree: true,
    });
    expect(result.success).toBe(true);
  });
});
