import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { stringify } from "../frontmatter.js";
import { buildPrompt, buildOnFinishPrompt } from "./prompt-builder.js";
import { FilesystemTaskManager } from "../tasks/filesystem-manager.js";
import type { TaskManager } from "../tasks/task-manager.js";
import type { AgentConfig, TaskFile, TaskFrontmatter, PRReviewContext, RunOutcome } from "../types.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vteam-prompt-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function createTasksDir(): string {
  const tasksDir = resolve(tmp, "tasks");
  for (const sub of ["todo", "done"]) {
    mkdirSync(resolve(tasksDir, sub), { recursive: true });
  }
  return tasksDir;
}

function writeTask(
  tasksDir: string,
  status: "todo" | "done",
  filename: string,
  fm: TaskFrontmatter,
  body: string,
): void {
  const content = stringify(body, fm);
  writeFileSync(resolve(tasksDir, status, filename), content, "utf-8");
}

function setup(): { agentConfig: AgentConfig; taskManager: TaskManager; tasksDir: string } {
  const agentMdPath = resolve(tmp, "AGENT.md");
  writeFileSync(agentMdPath, "---\nmodel: sonnet\nworktree: true\n---\n\n# Test Agent\n\nYou are a test agent.", "utf-8");

  const tasksDir = createTasksDir();
  const taskManager = new FilesystemTaskManager(tasksDir);

  return {
    agentConfig: {
      name: "test-agent",
      agentMdPath,
      model: "sonnet",
      scanPaths: ["src/", "lib/"],
      excludePaths: ["node_modules/"],
    },
    taskManager,
    tasksDir,
  };
}

describe("buildPrompt", () => {
  it("includes agent md content as system prompt", async () => {
    const { agentConfig, taskManager } = setup();
    const { systemPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(systemPrompt).toContain("You are a test agent");
  });

  it("includes existing task titles in user prompt", async () => {
    const { agentConfig, taskManager, tasksDir } = setup();
    writeTask(tasksDir, "todo", "task-a.md", {
      title: "Null check missing",
      created: "2026-04-19",
      status: "todo",
      severity: "high",
      "found-by": "code-reviewer",
      files: ["src/auth.ts:45"],
    }, "## Description\n\nSome bug.");

    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).toContain("Null check missing");
    expect(userPrompt).toContain("Existing Tasks");
  });

  it("omits existing tasks section when no tasks exist", async () => {
    const { agentConfig, taskManager } = setup();
    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).not.toContain("Existing Tasks");
  });

  it("includes scan paths in user prompt", async () => {
    const { agentConfig, taskManager } = setup();
    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).toContain("src/, lib/");
  });

  it("includes exclude paths in user prompt", async () => {
    const { agentConfig, taskManager } = setup();
    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).toContain("node_modules/");
  });

  it("omits scope section when no scan paths configured", async () => {
    const { agentConfig, taskManager } = setup();
    agentConfig.scanPaths = undefined;
    agentConfig.excludePaths = undefined;
    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).not.toContain("## Scope");
  });

  it("includes task details when task provided", async () => {
    const { agentConfig, taskManager } = setup();
    const task: TaskFile = {
      id: "task.md",
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

    const { systemPrompt, userPrompt } = await buildPrompt(agentConfig, taskManager, task);
    expect(systemPrompt).toContain("You are a test agent");
    expect(userPrompt).toContain("Fix null check");
    expect(userPrompt).toContain("high");
    expect(userPrompt).toContain("src/auth.ts:45");
    expect(userPrompt).toContain("auth module is broken");
  });

  it("excludes frontmatter from system prompt", async () => {
    const { agentConfig, taskManager } = setup();
    const { systemPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(systemPrompt).not.toContain("model:");
    expect(systemPrompt).not.toContain("worktree:");
    expect(systemPrompt).not.toContain("---");
  });

  it("omits task section when no task provided", async () => {
    const { agentConfig, taskManager } = setup();
    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).not.toContain("## Your Task");
  });

  it("shows tasks from all status directories", async () => {
    const { agentConfig, taskManager, tasksDir } = setup();
    writeTask(tasksDir, "todo", "a.md", {
      title: "Todo task",
      created: "2026-04-19",
      status: "todo",
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

    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).toContain("Todo task");
    expect(userPrompt).toContain("Done task");
  });

  it("includes review context when provided", async () => {
    const { agentConfig, taskManager } = setup();
    const review: PRReviewContext = {
      pr: {
        number: 42,
        title: "vteam: Fix null check in auth",
        branch: "vteam/fix-null-check",
        url: "https://github.com/org/repo/pull/42",
      },
      repoSlug: "org/repo",
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

    const { userPrompt } = await buildPrompt(agentConfig, taskManager, undefined, review);
    expect(userPrompt).toContain("Pull Request");
    expect(userPrompt).toContain("#42");
    expect(userPrompt).toContain("org/repo");
    expect(userPrompt).toContain("vteam: Fix null check in auth");
    expect(userPrompt).toContain("vteam/fix-null-check");
    expect(userPrompt).toContain("https://github.com/org/repo/pull/42");
    expect(userPrompt).toContain("reviewer1 on `src/auth.ts:45`");
    expect(userPrompt).toContain("concurrent requests");
    expect(userPrompt).toContain("reviewer2");
    expect(userPrompt).toContain("Test coverage");
  });

  it("omits review section when no review provided", async () => {
    const { agentConfig, taskManager } = setup();
    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).not.toContain("Pull Request");
    expect(userPrompt).not.toContain("Review Comments");
  });

  it("includes focus as first section in user prompt", async () => {
    const { agentConfig, taskManager } = setup();
    const { userPrompt } = await buildPrompt(agentConfig, taskManager, undefined, undefined, "the invite user functionality");
    expect(userPrompt).toContain("## Priority Focus");
    expect(userPrompt).toContain("the invite user functionality");
    const focusIndex = userPrompt.indexOf("## Priority Focus");
    const scopeIndex = userPrompt.indexOf("## Scope");
    expect(focusIndex).toBeLessThan(scopeIndex);
  });

  it("omits focus section when not provided", async () => {
    const { agentConfig, taskManager } = setup();
    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).not.toContain("Priority Focus");
  });

  it("uses unified output schema with status for all agents", async () => {
    const { agentConfig, taskManager } = setup();
    agentConfig.worktree = true;
    agentConfig.readOnly = true;
    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).toContain('"status"');
    expect(userPrompt).toContain('"summary"');
  });

  it("uses task content schema when output is task", async () => {
    const { agentConfig, taskManager } = setup();
    agentConfig.output = "task";
    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).toContain('"type": "task"');
    expect(userPrompt).toContain('"severity"');
    expect(userPrompt).toContain('"title"');
  });

  it("uses generic content schema by default (no output field)", async () => {
    const { agentConfig, taskManager } = setup();
    agentConfig.output = undefined;
    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).toContain('"type": "generic"');
    expect(userPrompt).toContain('"status"');
  });

  it("uses task content schema for worktree agent with output task", async () => {
    const { agentConfig, taskManager } = setup();
    agentConfig.worktree = true;
    agentConfig.output = "task";
    const { userPrompt } = await buildPrompt(agentConfig, taskManager);
    expect(userPrompt).toContain('"type": "task"');
  });
});

describe("buildOnFinishPrompt", () => {
  function setupOnFinish(): string {
    const onFinishPath = resolve(tmp, "ON_FINISH.md");
    writeFileSync(
      onFinishPath,
      "---\nmodel: haiku\nallowedTools: [Bash(curl *)]\n---\n\nPost a Slack notification with the run result.",
      "utf-8",
    );
    return onFinishPath;
  }

  it("uses ON_FINISH.md body as system prompt", () => {
    const path = setupOnFinish();
    const outcome: RunOutcome = {
      agent: "refactorer",
      status: "completed",
      startedAt: "2026-04-21T10:00:00Z",
      completedAt: "2026-04-21T10:05:00Z",
    };
    const { systemPrompt } = buildOnFinishPrompt({ onFinishMdPath: path }, outcome);
    expect(systemPrompt).toContain("Slack notification");
    expect(systemPrompt).not.toContain("model:");
  });

  it("includes run outcome in user prompt", () => {
    const path = setupOnFinish();
    const outcome: RunOutcome = {
      agent: "refactorer",
      status: "completed",
      startedAt: "2026-04-21T10:00:00Z",
      completedAt: "2026-04-21T10:05:00Z",
    };
    const { userPrompt } = buildOnFinishPrompt({ onFinishMdPath: path }, outcome);
    expect(userPrompt).toContain("refactorer");
    expect(userPrompt).toContain("completed");
    expect(userPrompt).toContain("2026-04-21T10:00:00Z");
  });

  it("includes task details when present", () => {
    const path = setupOnFinish();
    const outcome: RunOutcome = {
      agent: "refactorer",
      status: "completed",
      startedAt: "2026-04-21T10:00:00Z",
      completedAt: "2026-04-21T10:05:00Z",
      task: { title: "Fix null check", severity: "high", files: ["src/auth.ts:45"] },
      branch: "vteam/fix-null-check",
      prUrl: "https://github.com/org/repo/pull/42",
    };
    const { userPrompt } = buildOnFinishPrompt({ onFinishMdPath: path }, outcome);
    expect(userPrompt).toContain("Fix null check");
    expect(userPrompt).toContain("high");
    expect(userPrompt).toContain("src/auth.ts:45");
    expect(userPrompt).toContain("vteam/fix-null-check");
    expect(userPrompt).toContain("https://github.com/org/repo/pull/42");
  });

  it("includes error on failure", () => {
    const path = setupOnFinish();
    const outcome: RunOutcome = {
      agent: "refactorer",
      status: "failed",
      startedAt: "2026-04-21T10:00:00Z",
      completedAt: "2026-04-21T10:01:00Z",
      error: "Claude exited with code 1",
    };
    const { userPrompt } = buildOnFinishPrompt({ onFinishMdPath: path }, outcome);
    expect(userPrompt).toContain("failed");
    expect(userPrompt).toContain("Claude exited with code 1");
  });

  it("includes reviewed PR details", () => {
    const path = setupOnFinish();
    const outcome: RunOutcome = {
      agent: "review-responder",
      status: "completed",
      startedAt: "2026-04-21T10:00:00Z",
      completedAt: "2026-04-21T10:05:00Z",
      reviewedPR: { number: 42, title: "Fix auth", url: "https://github.com/org/repo/pull/42" },
    };
    const { userPrompt } = buildOnFinishPrompt({ onFinishMdPath: path }, outcome);
    expect(userPrompt).toContain("Reviewed PR");
    expect(userPrompt).toContain("#42");
    expect(userPrompt).toContain("Fix auth");
  });

  it("omits optional sections when not present", () => {
    const path = setupOnFinish();
    const outcome: RunOutcome = {
      agent: "code-reviewer",
      status: "completed",
      startedAt: "2026-04-21T10:00:00Z",
      completedAt: "2026-04-21T10:05:00Z",
    };
    const { userPrompt } = buildOnFinishPrompt({ onFinishMdPath: path }, outcome);
    expect(userPrompt).not.toContain("## Task");
    expect(userPrompt).not.toContain("## Branch");
    expect(userPrompt).not.toContain("## Error");
    expect(userPrompt).not.toContain("## Reviewed PR");
    expect(userPrompt).not.toContain("## Content");
  });

  it("includes generic content when present", () => {
    const path = setupOnFinish();
    const outcome: RunOutcome = {
      agent: "pr-reviewer",
      status: "completed",
      startedAt: "2026-04-21T10:00:00Z",
      completedAt: "2026-04-21T10:05:00Z",
      content: { type: "generic", body: "## Review\n\nLooks good overall." },
    };
    const { userPrompt } = buildOnFinishPrompt({ onFinishMdPath: path }, outcome);
    expect(userPrompt).toContain("## Content");
    expect(userPrompt).toContain("Looks good overall");
  });

  it("includes task content as JSON when present", () => {
    const path = setupOnFinish();
    const outcome: RunOutcome = {
      agent: "code-reviewer",
      status: "completed",
      startedAt: "2026-04-21T10:00:00Z",
      completedAt: "2026-04-21T10:05:00Z",
      content: {
        type: "task",
        body: {
          title: "Missing null check",
          severity: "high",
          description: "Potential NPE",
          files: ["src/auth.ts:45"],
        },
      },
    };
    const { userPrompt } = buildOnFinishPrompt({ onFinishMdPath: path }, outcome);
    expect(userPrompt).toContain("## Content");
    expect(userPrompt).toContain("Missing null check");
  });
});
