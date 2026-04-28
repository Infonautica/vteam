import { describe, it, expect } from "vitest";
import { vteamConfigSchema, agentFrontmatterSchema, onFinishFrontmatterSchema } from "./schema.js";

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

  it("defaults taskManager to filesystem when omitted", () => {
    const result = vteamConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taskManager).toEqual({ provider: "filesystem" });
    }
  });

  it("accepts explicit filesystem taskManager", () => {
    const result = vteamConfigSchema.safeParse({
      ...validConfig,
      taskManager: { provider: "filesystem" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taskManager.provider).toBe("filesystem");
    }
  });

  it("rejects unknown taskManager provider", () => {
    const result = vteamConfigSchema.safeParse({
      ...validConfig,
      taskManager: { provider: "jira" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects taskManager without provider", () => {
    const result = vteamConfigSchema.safeParse({
      ...validConfig,
      taskManager: {},
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
      autoPR: true,
      prCreateLabels: ["vteam"],
      scanPaths: ["src/"],
      excludePaths: ["node_modules/"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts autoPR without worktree", () => {
    const result = agentFrontmatterSchema.safeParse({
      autoPR: true,
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

  it("accepts output task", () => {
    const result = agentFrontmatterSchema.safeParse({
      output: "task",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid output value", () => {
    const result = agentFrontmatterSchema.safeParse({
      output: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts output task with worktree", () => {
    const result = agentFrontmatterSchema.safeParse({
      output: "task",
      worktree: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts prFilterLabels with input pr", () => {
    const result = agentFrontmatterSchema.safeParse({
      input: "pr",
      prFilterLabels: ["vteam"],
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

  it("accepts allowedTools", () => {
    const result = agentFrontmatterSchema.safeParse({
      allowedTools: ["Read", "Glob", "Grep", "Bash(git *)"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts disallowedTools", () => {
    const result = agentFrontmatterSchema.safeParse({
      disallowedTools: ["Write", "Bash(rm *)"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts both allowedTools and disallowedTools", () => {
    const result = agentFrontmatterSchema.safeParse({
      allowedTools: ["Read", "Edit", "Bash(git *)"],
      disallowedTools: ["Bash(rm *)"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts readOnly with worktree", () => {
    const result = agentFrontmatterSchema.safeParse({
      readOnly: true,
      worktree: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects readOnly without worktree", () => {
    const result = agentFrontmatterSchema.safeParse({
      readOnly: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects readOnly with worktree false", () => {
    const result = agentFrontmatterSchema.safeParse({
      readOnly: true,
      worktree: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects readOnly with autoPR", () => {
    const result = agentFrontmatterSchema.safeParse({
      readOnly: true,
      worktree: true,
      autoPR: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts readOnly with input pr", () => {
    const result = agentFrontmatterSchema.safeParse({
      readOnly: true,
      worktree: true,
      input: "pr",
    });
    expect(result.success).toBe(true);
  });

  it("accepts readOnly with input task", () => {
    const result = agentFrontmatterSchema.safeParse({
      readOnly: true,
      worktree: true,
      input: "task",
    });
    expect(result.success).toBe(true);
  });
});

describe("onFinishFrontmatterSchema", () => {
  it("accepts empty frontmatter", () => {
    const result = onFinishFrontmatterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts model and tool permissions", () => {
    const result = onFinishFrontmatterSchema.safeParse({
      model: "haiku",
      allowedTools: ["Bash(curl *)"],
      disallowedTools: ["Write"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts only model", () => {
    const result = onFinishFrontmatterSchema.safeParse({
      model: "sonnet",
    });
    expect(result.success).toBe(true);
  });
});
