import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { AgentRunResult } from "../orchestrator/agent-runner.js";

vi.mock("../orchestrator/agent-runner.js", () => ({
  runClaudeAgent: vi.fn(),
}));

import { runClaudeAgent } from "../orchestrator/agent-runner.js";
import { runCommand } from "./run.js";

const mockRunClaude = vi.mocked(runClaudeAgent);

let tmp: string;

function makeResult(
  resultText: string | null,
  exitCode = 0,
): AgentRunResult {
  return {
    stdout: "",
    stderr: "",
    exitCode,
    resultText,
    costUsd: 0.01,
    durationMs: 1000,
  };
}

function setupProject(opts: {
  hasOnFinish?: boolean;
  hasMemory?: boolean;
  existingMemory?: string;
  agentFrontmatter?: string;
} = {}): void {
  const {
    hasOnFinish = false,
    hasMemory = false,
    existingMemory,
    agentFrontmatter = "---\nmodel: sonnet\n---",
  } = opts;

  const vteamDir = resolve(tmp, "vteam");
  mkdirSync(vteamDir, { recursive: true });
  writeFileSync(
    resolve(vteamDir, "vteam.config.json"),
    JSON.stringify({
      baseBranch: "main",
      platform: "github",
      worktreeDir: ".worktrees",
      tasks: { maxRetries: 3 },
    }),
  );

  const agentDir = resolve(vteamDir, "agents", "test-agent");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    resolve(agentDir, "AGENT.md"),
    `${agentFrontmatter}\n\nYou are a test agent.`,
  );

  if (hasOnFinish) {
    writeFileSync(
      resolve(agentDir, "ON_FINISH.md"),
      "---\nmodel: haiku\n---\n\nPost notification.",
    );
  }

  if (hasMemory) {
    writeFileSync(
      resolve(agentDir, "MEMORY.md"),
      "---\nmodel: haiku\n---\n\nKeep a running list of scanned areas.",
    );
  }

  if (existingMemory) {
    const memDir = resolve(vteamDir, ".memory", "test-agent");
    mkdirSync(memDir, { recursive: true });
    writeFileSync(resolve(memDir, "store.md"), existingMemory);
  }

  mkdirSync(resolve(vteamDir, "tasks", "todo"), { recursive: true });
  mkdirSync(resolve(vteamDir, "tasks", "done"), { recursive: true });
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vteam-pipeline-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmp);
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockRunClaude.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmp, { recursive: true, force: true });
});

describe("pipeline: agent output → ON_FINISH", () => {
  it("passes generic content to ON_FINISH hook", async () => {
    setupProject({ hasOnFinish: true });

    mockRunClaude
      .mockResolvedValueOnce(
        makeResult(
          JSON.stringify({
            status: "completed",
            summary: "Review done.",
            content: { type: "generic", body: "All looks good." },
          }),
        ),
      )
      .mockResolvedValueOnce(makeResult("hook ok"));

    await runCommand("test-agent", {});

    expect(mockRunClaude).toHaveBeenCalledTimes(2);

    const onFinishCall = mockRunClaude.mock.calls[1][0];
    expect(onFinishCall.userPrompt).toContain("completed");
    expect(onFinishCall.userPrompt).toContain("All looks good.");
    expect(onFinishCall.systemPrompt).toContain("Post notification.");
  });

  it("passes task content as JSON to ON_FINISH hook", async () => {
    setupProject({
      hasOnFinish: true,
      agentFrontmatter: "---\nmodel: sonnet\noutput: task\n---",
    });

    mockRunClaude
      .mockResolvedValueOnce(
        makeResult(
          JSON.stringify({
            status: "completed",
            summary: "Found issue.",
            content: {
              type: "task",
              body: {
                title: "Null pointer in auth",
                severity: "high",
                description: "NPE when user.email is null",
                files: ["src/auth.ts:45"],
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(makeResult("hook ok"));

    await runCommand("test-agent", {});

    expect(mockRunClaude).toHaveBeenCalledTimes(2);

    const onFinishCall = mockRunClaude.mock.calls[1][0];
    expect(onFinishCall.userPrompt).toContain("Null pointer in auth");
    expect(onFinishCall.userPrompt).toContain("high");
  });

  it("runs ON_FINISH with error details when agent fails", async () => {
    setupProject({ hasOnFinish: true });

    mockRunClaude
      .mockResolvedValueOnce(makeResult(null, 1))
      .mockResolvedValueOnce(makeResult("hook ok"));

    await runCommand("test-agent", {});

    expect(mockRunClaude).toHaveBeenCalledTimes(2);

    const onFinishCall = mockRunClaude.mock.calls[1][0];
    expect(onFinishCall.userPrompt).toContain("failed");
    expect(onFinishCall.userPrompt).toContain("Claude exited with code 1");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("includes branch and PR info in ON_FINISH when present in outcome", async () => {
    setupProject({ hasOnFinish: true });

    mockRunClaude
      .mockResolvedValueOnce(
        makeResult(
          JSON.stringify({
            status: "completed",
            summary: "Done.",
            content: { type: "generic", body: "Result." },
          }),
        ),
      )
      .mockResolvedValueOnce(makeResult("hook ok"));

    await runCommand("test-agent", {});

    const onFinishCall = mockRunClaude.mock.calls[1][0];
    expect(onFinishCall.userPrompt).toContain("test-agent");
    expect(onFinishCall.userPrompt).toContain("completed");
  });
});

describe("pipeline: agent output → MEMORY curation", () => {
  it("passes memoryUpdate to curation agent", async () => {
    setupProject({ hasMemory: true });

    mockRunClaude
      .mockResolvedValueOnce(
        makeResult(
          JSON.stringify({
            status: "completed",
            summary: "Scanned auth module.",
            memoryUpdate: "Scanned src/auth.ts — found singleton pattern.",
          }),
        ),
      )
      .mockResolvedValueOnce(makeResult("Updated memory content."));

    await runCommand("test-agent", {});

    expect(mockRunClaude).toHaveBeenCalledTimes(2);

    const memoryCall = mockRunClaude.mock.calls[1][0];
    expect(memoryCall.userPrompt).toContain(
      "Scanned src/auth.ts — found singleton pattern.",
    );
    expect(memoryCall.userPrompt).toContain("## New Update");
    expect(memoryCall.systemPrompt).toContain(
      "Keep a running list of scanned areas.",
    );
  });

  it("writes curation result to store.md", async () => {
    setupProject({ hasMemory: true });

    mockRunClaude
      .mockResolvedValueOnce(
        makeResult(
          JSON.stringify({
            status: "completed",
            summary: "Done.",
            memoryUpdate: "New info.",
          }),
        ),
      )
      .mockResolvedValueOnce(
        makeResult("- Scanned auth module\n- Found singleton pattern"),
      );

    await runCommand("test-agent", {});

    const storeFile = resolve(
      tmp,
      "vteam",
      ".memory",
      "test-agent",
      "store.md",
    );
    expect(existsSync(storeFile)).toBe(true);
    const content = readFileSync(storeFile, "utf-8");
    expect(content).toContain("Scanned auth module");
    expect(content).toContain("Found singleton pattern");
  });

  it("includes existing memory in curation prompt", async () => {
    setupProject({
      hasMemory: true,
      existingMemory: "Previously: scanned foo/",
    });

    mockRunClaude
      .mockResolvedValueOnce(
        makeResult(
          JSON.stringify({
            status: "completed",
            summary: "Done.",
            memoryUpdate: "Now: scanned bar/",
          }),
        ),
      )
      .mockResolvedValueOnce(makeResult("Merged memory."));

    await runCommand("test-agent", {});

    const memoryCall = mockRunClaude.mock.calls[1][0];
    expect(memoryCall.userPrompt).toContain("Previously: scanned foo/");
    expect(memoryCall.userPrompt).toContain("Now: scanned bar/");
  });

  it("skips curation when agent returns no memoryUpdate", async () => {
    setupProject({ hasMemory: true });

    mockRunClaude.mockResolvedValueOnce(
      makeResult(
        JSON.stringify({ status: "completed", summary: "Done." }),
      ),
    );

    await runCommand("test-agent", {});

    expect(mockRunClaude).toHaveBeenCalledTimes(1);
  });

  it("skips curation when agent has no MEMORY.md even if memoryUpdate present", async () => {
    setupProject({ hasMemory: false });

    mockRunClaude.mockResolvedValueOnce(
      makeResult(
        JSON.stringify({
          status: "completed",
          summary: "Done.",
          memoryUpdate: "Something to remember.",
        }),
      ),
    );

    await runCommand("test-agent", {});

    expect(mockRunClaude).toHaveBeenCalledTimes(1);
  });
});

describe("pipeline: agent output → task file creation", () => {
  it("creates task file when agent returns task content", async () => {
    setupProject({
      agentFrontmatter: "---\nmodel: sonnet\noutput: task\n---",
    });

    mockRunClaude.mockResolvedValueOnce(
      makeResult(
        JSON.stringify({
          status: "completed",
          summary: "Found issue.",
          content: {
            type: "task",
            body: {
              title: "Missing error handling",
              severity: "medium",
              description: "No try-catch around DB call",
              files: ["src/db.ts:20"],
            },
          },
        }),
      ),
    );

    await runCommand("test-agent", {});

    const todoDir = resolve(tmp, "vteam", "tasks", "todo");
    const files = readdirSync(todoDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBe(1);

    const content = readFileSync(resolve(todoDir, files[0]), "utf-8");
    expect(content).toContain("Missing error handling");
    expect(content).toContain("medium");
  });

  it("does not create task file for generic content", async () => {
    setupProject();

    mockRunClaude.mockResolvedValueOnce(
      makeResult(
        JSON.stringify({
          status: "completed",
          summary: "Done.",
          content: { type: "generic", body: "All good." },
        }),
      ),
    );

    await runCommand("test-agent", {});

    const todoDir = resolve(tmp, "vteam", "tasks", "todo");
    const files = readdirSync(todoDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBe(0);
  });
});

describe("pipeline: combined ON_FINISH + MEMORY", () => {
  it("runs both ON_FINISH and memory curation when both configured", async () => {
    setupProject({ hasOnFinish: true, hasMemory: true });

    mockRunClaude
      .mockResolvedValueOnce(
        makeResult(
          JSON.stringify({
            status: "completed",
            summary: "Done.",
            content: { type: "generic", body: "Review report." },
            memoryUpdate: "Scanned module X.",
          }),
        ),
      )
      .mockResolvedValueOnce(makeResult("hook ok"))
      .mockResolvedValueOnce(makeResult("Updated memory."));

    await runCommand("test-agent", {});

    expect(mockRunClaude).toHaveBeenCalledTimes(3);

    const onFinishCall = mockRunClaude.mock.calls[1][0];
    expect(onFinishCall.userPrompt).toContain("Review report.");

    const memoryCall = mockRunClaude.mock.calls[2][0];
    expect(memoryCall.userPrompt).toContain("Scanned module X.");
  });

  it("runs ON_FINISH even when memory curation is skipped", async () => {
    setupProject({ hasOnFinish: true, hasMemory: true });

    mockRunClaude
      .mockResolvedValueOnce(
        makeResult(
          JSON.stringify({
            status: "completed",
            summary: "Done.",
            content: { type: "generic", body: "Report." },
          }),
        ),
      )
      .mockResolvedValueOnce(makeResult("hook ok"));

    await runCommand("test-agent", {});

    expect(mockRunClaude).toHaveBeenCalledTimes(2);
  });

  it("makes no extra calls when neither ON_FINISH nor MEMORY configured", async () => {
    setupProject();

    mockRunClaude.mockResolvedValueOnce(
      makeResult(
        JSON.stringify({ status: "completed", summary: "Done." }),
      ),
    );

    await runCommand("test-agent", {});

    expect(mockRunClaude).toHaveBeenCalledTimes(1);
  });
});

describe("pipeline: existing memory flows to agent prompt", () => {
  it("injects existing memory into agent's user prompt", async () => {
    setupProject({
      hasMemory: true,
      existingMemory: "Previous run: scanned auth/",
    });

    mockRunClaude.mockResolvedValueOnce(
      makeResult(
        JSON.stringify({ status: "completed", summary: "Done." }),
      ),
    );

    await runCommand("test-agent", {});

    const agentCall = mockRunClaude.mock.calls[0][0];
    expect(agentCall.userPrompt).toContain("Previous run: scanned auth/");
    expect(agentCall.userPrompt).toContain("Agent Memory");
  });
});
