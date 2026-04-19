import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import matter from "gray-matter";
import { buildPrompt } from "./prompt-builder.js";
import type { AgentConfig, TaskFile, TaskFrontmatter, PRReviewContext } from "../types.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vteam-prompt-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function createTasksDir(): string {
  const tasksDir = resolve(tmp, "tasks");
  for (const sub of ["backlog", "todo", "done"]) {
    mkdirSync(resolve(tasksDir, sub), { recursive: true });
  }
  return tasksDir;
}

function writeTask(
  tasksDir: string,
  status: "backlog" | "todo" | "done",
  filename: string,
  fm: TaskFrontmatter,
  body: string,
): void {
  const content = matter.stringify(body, fm);
  writeFileSync(resolve(tasksDir, status, filename), content, "utf-8");
}

function setup(): { agentConfig: AgentConfig; tasksDir: string } {
  const agentMdPath = resolve(tmp, "AGENT.md");
  writeFileSync(agentMdPath, "---\nmodel: sonnet\nworktree: true\n---\n\n# Test Agent\n\nYou are a test agent.", "utf-8");

  const tasksDir = createTasksDir();

  return {
    agentConfig: {
      name: "test-agent",
      agentMdPath,
      model: "sonnet",
      scanPaths: ["src/", "lib/"],
      excludePaths: ["node_modules/"],
    },
    tasksDir,
  };
}

describe("buildPrompt", () => {
  it("includes agent md content as system prompt", () => {
    const { agentConfig, tasksDir } = setup();
    const { systemPrompt } = buildPrompt(agentConfig, tasksDir);
    expect(systemPrompt).toContain("You are a test agent");
  });

  it("includes existing task titles in user prompt", () => {
    const { agentConfig, tasksDir } = setup();
    writeTask(tasksDir, "backlog", "task-a.md", {
      title: "Null check missing",
      created: "2026-04-19",
      status: "backlog",
      severity: "high",
      "found-by": "code-reviewer",
      files: ["src/auth.ts:45"],
    }, "## Description\n\nSome bug.");

    const { userPrompt } = buildPrompt(agentConfig, tasksDir);
    expect(userPrompt).toContain("Null check missing");
    expect(userPrompt).toContain("Existing Tasks");
  });

  it("omits existing tasks section when no tasks exist", () => {
    const { agentConfig, tasksDir } = setup();
    const { userPrompt } = buildPrompt(agentConfig, tasksDir);
    expect(userPrompt).not.toContain("Existing Tasks");
  });

  it("includes scan paths in user prompt", () => {
    const { agentConfig, tasksDir } = setup();
    const { userPrompt } = buildPrompt(agentConfig, tasksDir);
    expect(userPrompt).toContain("src/, lib/");
  });

  it("includes exclude paths in user prompt", () => {
    const { agentConfig, tasksDir } = setup();
    const { userPrompt } = buildPrompt(agentConfig, tasksDir);
    expect(userPrompt).toContain("node_modules/");
  });

  it("omits scope section when no scan paths configured", () => {
    const { agentConfig, tasksDir } = setup();
    agentConfig.scanPaths = undefined;
    agentConfig.excludePaths = undefined;
    const { userPrompt } = buildPrompt(agentConfig, tasksDir);
    expect(userPrompt).not.toContain("## Scope");
  });

  it("includes task details when task provided", () => {
    const { agentConfig, tasksDir } = setup();
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

    const { systemPrompt, userPrompt } = buildPrompt(agentConfig, tasksDir, task);
    expect(systemPrompt).toContain("You are a test agent");
    expect(userPrompt).toContain("Fix null check");
    expect(userPrompt).toContain("high");
    expect(userPrompt).toContain("src/auth.ts:45");
    expect(userPrompt).toContain("auth module is broken");
  });

  it("excludes frontmatter from system prompt", () => {
    const { agentConfig, tasksDir } = setup();
    const { systemPrompt } = buildPrompt(agentConfig, tasksDir);
    expect(systemPrompt).not.toContain("model:");
    expect(systemPrompt).not.toContain("worktree:");
    expect(systemPrompt).not.toContain("---");
  });

  it("omits task section when no task provided", () => {
    const { agentConfig, tasksDir } = setup();
    const { userPrompt } = buildPrompt(agentConfig, tasksDir);
    expect(userPrompt).not.toContain("## Your Task");
  });

  it("shows tasks from all status directories", () => {
    const { agentConfig, tasksDir } = setup();
    writeTask(tasksDir, "backlog", "a.md", {
      title: "Backlog task",
      created: "2026-04-19",
      status: "backlog",
      severity: "high",
      "found-by": "code-reviewer",
      files: ["a.ts"],
    }, "");
    writeTask(tasksDir, "done", "b.md", {
      title: "Done task",
      created: "2026-04-19",
      status: "done",
      severity: "low",
      "found-by": "code-reviewer",
      files: ["b.ts"],
    }, "");

    const { userPrompt } = buildPrompt(agentConfig, tasksDir);
    expect(userPrompt).toContain("Backlog task");
    expect(userPrompt).toContain("Done task");
  });

  it("includes review context when provided", () => {
    const { agentConfig, tasksDir } = setup();
    const review: PRReviewContext = {
      pr: {
        number: 42,
        title: "vteam: Fix null check in auth",
        branch: "vteam/fix-null-check",
        url: "https://github.com/org/repo/pull/42",
      },
      comments: [
        {
          author: "reviewer1",
          body: "This approach won't work for concurrent requests.",
          path: "src/auth.ts",
          line: 45,
          createdAt: "2026-04-19T10:00:00Z",
        },
        {
          author: "reviewer2",
          body: "Test coverage is insufficient.",
          createdAt: "2026-04-19T11:00:00Z",
        },
      ],
    };

    const { userPrompt } = buildPrompt(agentConfig, tasksDir, undefined, review);
    expect(userPrompt).toContain("Pull Request");
    expect(userPrompt).toContain("vteam: Fix null check in auth");
    expect(userPrompt).toContain("vteam/fix-null-check");
    expect(userPrompt).toContain("https://github.com/org/repo/pull/42");
    expect(userPrompt).toContain("reviewer1 on `src/auth.ts:45`");
    expect(userPrompt).toContain("concurrent requests");
    expect(userPrompt).toContain("reviewer2");
    expect(userPrompt).toContain("Test coverage");
  });

  it("omits review section when no review provided", () => {
    const { agentConfig, tasksDir } = setup();
    const { userPrompt } = buildPrompt(agentConfig, tasksDir);
    expect(userPrompt).not.toContain("Pull Request");
    expect(userPrompt).not.toContain("Review Comments");
  });
});
