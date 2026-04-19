import { describe, it, expect } from "vitest";
import { vteamConfigSchema } from "./schema.js";

const validConfig = {
  baseBranch: "main",
  platform: "github",
  worktreeDir: ".vteam-worktrees",
  agents: {
    "code-reviewer": {
      model: "sonnet",
      worktree: true,
      autoMR: true,
      scanPaths: ["src/"],
      excludePaths: ["node_modules/"],
    },
    refactorer: {
      model: "sonnet",
      worktree: true,
      taskInput: true,
      autoMR: true,
      mrLabels: ["vteam"],
    },
  },
  tasks: { maxRetries: 3 },
};

describe("vteamConfigSchema", () => {
  it("accepts a valid config", () => {
    const result = vteamConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("accepts config with no agents", () => {
    const result = vteamConfigSchema.safeParse({
      ...validConfig,
      agents: {},
    });
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

  it("rejects autoMR without worktree", () => {
    const result = vteamConfigSchema.safeParse({
      ...validConfig,
      agents: {
        broken: { autoMR: true, worktree: false },
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts autoMR with worktree", () => {
    const result = vteamConfigSchema.safeParse({
      ...validConfig,
      agents: {
        valid: { autoMR: true, worktree: true },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts agent with no flags (bare AGENT.md)", () => {
    const result = vteamConfigSchema.safeParse({
      ...validConfig,
      agents: { "custom-agent": {} },
    });
    expect(result.success).toBe(true);
  });
});
