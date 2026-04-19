import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { buildCodeReviewerPrompt, buildRefactorerPrompt } from "./prompt-builder.js";
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
  writeFileSync(agentMdPath, "# Test Agent\n\nYou are a test agent.", "utf-8");

  const overviewPath = resolve(tmp, "overview.md");
  writeFileSync(overviewPath, "# Overview\n\n- **[backlog]** existing task", "utf-8");

  return {
    agentConfig: {
      name: "code-reviewer",
      agentMdPath,
      model: "sonnet",
      scanPaths: ["src/", "lib/"],
      excludePaths: ["node_modules/"],
    },
    overviewPath,
  };
}

describe("buildCodeReviewerPrompt", () => {
  it("includes agent md content as system prompt", () => {
    const { agentConfig, overviewPath } = setup();
    const { systemPrompt } = buildCodeReviewerPrompt(agentConfig, overviewPath);
    expect(systemPrompt).toContain("You are a test agent");
  });

  it("includes overview in user prompt", () => {
    const { agentConfig, overviewPath } = setup();
    const { userPrompt } = buildCodeReviewerPrompt(agentConfig, overviewPath);
    expect(userPrompt).toContain("existing task");
    expect(userPrompt).toContain("DO NOT report findings");
  });

  it("includes scan paths in user prompt", () => {
    const { agentConfig, overviewPath } = setup();
    const { userPrompt } = buildCodeReviewerPrompt(agentConfig, overviewPath);
    expect(userPrompt).toContain("src/, lib/");
  });

  it("includes exclude paths in user prompt", () => {
    const { agentConfig, overviewPath } = setup();
    const { userPrompt } = buildCodeReviewerPrompt(agentConfig, overviewPath);
    expect(userPrompt).toContain("node_modules/");
  });

  it("handles missing scan paths", () => {
    const { agentConfig, overviewPath } = setup();
    agentConfig.scanPaths = undefined;
    const { userPrompt } = buildCodeReviewerPrompt(agentConfig, overviewPath);
    expect(userPrompt).toContain("Review the entire codebase");
  });
});

describe("buildRefactorerPrompt", () => {
  it("includes task details in user prompt", () => {
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

    const { systemPrompt, userPrompt } = buildRefactorerPrompt(agentConfig, overviewPath, task);
    expect(systemPrompt).toContain("You are a test agent");
    expect(userPrompt).toContain("Fix null check");
    expect(userPrompt).toContain("high");
    expect(userPrompt).toContain("src/auth.ts:45");
    expect(userPrompt).toContain("auth module is broken");
  });

  it("includes commit message instruction with task title", () => {
    const { agentConfig, overviewPath } = setup();
    const task: TaskFile = {
      filename: "task.md",
      path: "/tasks/todo/task.md",
      frontmatter: {
        title: "Remove dead code",
        created: "",
        status: "todo",
        severity: "low",
        "found-by": "human",
        files: ["src/utils.ts"],
      },
      body: "Clean up unused functions.",
    };

    const { userPrompt } = buildRefactorerPrompt(agentConfig, overviewPath, task);
    expect(userPrompt).toContain('vteam: Remove dead code');
  });
});
