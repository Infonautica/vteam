import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { buildPrompt } from "./prompt-builder.js";
import type { AgentConfig, TaskFile } from "../types.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vteam-prompt-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function setup(): { agentConfig: AgentConfig; overviewPath: string } {
  const agentMdPath = resolve(tmp, "AGENT.md");
  writeFileSync(agentMdPath, "---\nmodel: sonnet\nworktree: true\n---\n\n# Test Agent\n\nYou are a test agent.", "utf-8");

  const overviewPath = resolve(tmp, "overview.md");
  writeFileSync(overviewPath, "# Overview\n\n- **[backlog]** existing task", "utf-8");

  return {
    agentConfig: {
      name: "test-agent",
      agentMdPath,
      model: "sonnet",
      scanPaths: ["src/", "lib/"],
      excludePaths: ["node_modules/"],
    },
    overviewPath,
  };
}

describe("buildPrompt", () => {
  it("includes agent md content as system prompt", () => {
    const { agentConfig, overviewPath } = setup();
    const { systemPrompt } = buildPrompt(agentConfig, overviewPath);
    expect(systemPrompt).toContain("You are a test agent");
  });

  it("includes overview in user prompt", () => {
    const { agentConfig, overviewPath } = setup();
    const { userPrompt } = buildPrompt(agentConfig, overviewPath);
    expect(userPrompt).toContain("existing task");
  });

  it("includes scan paths in user prompt", () => {
    const { agentConfig, overviewPath } = setup();
    const { userPrompt } = buildPrompt(agentConfig, overviewPath);
    expect(userPrompt).toContain("src/, lib/");
  });

  it("includes exclude paths in user prompt", () => {
    const { agentConfig, overviewPath } = setup();
    const { userPrompt } = buildPrompt(agentConfig, overviewPath);
    expect(userPrompt).toContain("node_modules/");
  });

  it("omits scope section when no scan paths configured", () => {
    const { agentConfig, overviewPath } = setup();
    agentConfig.scanPaths = undefined;
    agentConfig.excludePaths = undefined;
    const { userPrompt } = buildPrompt(agentConfig, overviewPath);
    expect(userPrompt).not.toContain("## Scope");
  });

  it("includes task details when task provided", () => {
    const { agentConfig, overviewPath } = setup();
    const task: TaskFile = {
      filename: "task.md",
      path: "/tasks/todo/task.md",
      frontmatter: {
        title: "Fix null check",
        created: "2026-04-19",
        status: "todo",
        severity: "high",
        "found-by": "code-reviewer",
        files: ["src/auth.ts:45"],
      },
      body: "## Description\n\nThe auth module is broken.",
    };

    const { systemPrompt, userPrompt } = buildPrompt(agentConfig, overviewPath, task);
    expect(systemPrompt).toContain("You are a test agent");
    expect(userPrompt).toContain("Fix null check");
    expect(userPrompt).toContain("high");
    expect(userPrompt).toContain("src/auth.ts:45");
    expect(userPrompt).toContain("auth module is broken");
  });

  it("excludes frontmatter from system prompt", () => {
    const { agentConfig, overviewPath } = setup();
    const { systemPrompt } = buildPrompt(agentConfig, overviewPath);
    expect(systemPrompt).not.toContain("model:");
    expect(systemPrompt).not.toContain("worktree:");
    expect(systemPrompt).not.toContain("---");
  });

  it("omits task section when no task provided", () => {
    const { agentConfig, overviewPath } = setup();
    const { userPrompt } = buildPrompt(agentConfig, overviewPath);
    expect(userPrompt).not.toContain("## Your Task");
  });
});
