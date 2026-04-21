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
      input: "task",
      autoMR: true,
      mrLabels: ["vteam"],
      scanPaths: ["src/"],
      excludePaths: ["node_modules/"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts autoMR without worktree", () => {
    const result = agentFrontmatterSchema.safeParse({
      autoMR: true,
      worktree: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects input pr without worktree", () => {
    const result = agentFrontmatterSchema.safeParse({
      input: "pr",
      worktree: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts input pr with worktree", () => {
    const result = agentFrontmatterSchema.safeParse({
      input: "pr",
      worktree: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts input task without worktree", () => {
    const result = agentFrontmatterSchema.safeParse({
      input: "task",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid input value", () => {
    const result = agentFrontmatterSchema.safeParse({
      input: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts prLabels with input pr", () => {
    const result = agentFrontmatterSchema.safeParse({
      input: "pr",
      prLabels: ["vteam"],
      worktree: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid cron pattern", () => {
    const result = agentFrontmatterSchema.safeParse({
      cron: "0 */6 * * *",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid cron pattern", () => {
    const result = agentFrontmatterSchema.safeParse({
      cron: "not a cron",
    });
    expect(result.success).toBe(false);
  });
});
