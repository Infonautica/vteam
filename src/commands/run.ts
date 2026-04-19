import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTaskIndex } from "../memory/task-index.js";
import { appendToOverview, updateOverviewEntryStatus } from "../memory/overview.js";
import { acquireLock, type FileLock } from "../memory/lock.js";
import {
  createTaskFile,
  isDuplicateTitle,
  moveTask,
  updateTaskFrontmatter,
  severityPriority,
} from "../tasks/task-file.js";
import { buildCodeReviewerPrompt, buildRefactorerPrompt } from "../orchestrator/prompt-builder.js";
import {
  runClaudeAgent,
  REVIEWER_SCHEMA,
  REFACTORER_SCHEMA,
} from "../orchestrator/agent-runner.js";
import {
  parseClaudeJsonOutput,
  parseReviewerOutput,
  parseRefactorerOutput,
} from "../orchestrator/output-parser.js";
import {
  createWorktree,
  removeWorktree,
  pushBranch,
} from "../worktree/manager.js";
import { createMergeRequest } from "../integrations/merge-request.js";
import type { AgentConfig, VteamConfig, RunState, OverviewEntry } from "../types.js";

function loadConfig(cwd: string): VteamConfig {
  const configPath = resolve(cwd, "vteam", "vteam.config.json");
  if (!existsSync(configPath)) {
    throw new Error("vteam.config.json not found. Run 'vteam init' first.");
  }
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

function resolveAgentConfig(
  name: string,
  cwd: string,
  config: VteamConfig,
): AgentConfig {
  const agentDir = resolve(cwd, "vteam", name);
  const agentMdPath = resolve(agentDir, "AGENT.md");

  if (!existsSync(agentMdPath)) {
    throw new Error(`Agent "${name}" not found at ${agentMdPath}`);
  }

  return {
    name,
    agentMdPath,
    ...config.agents[name],
  };
}

function writeRunState(cwd: string, state: RunState): void {
  const runsDir = resolve(cwd, "vteam", ".runs");
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    resolve(runsDir, `${state.runId}.json`),
    JSON.stringify(state, null, 2),
  );
}

function generateRunId(agent: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${ts}-${agent}`;
}

export async function runCommand(agentName: string): Promise<void> {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const agent = resolveAgentConfig(agentName, cwd, config);

  switch (agentName) {
    case "code-reviewer":
      await runCodeReviewer(cwd, config, agent);
      break;
    case "refactorer":
      await runRefactorer(cwd, config, agent);
      break;
    default:
      console.error(`Unknown agent: ${agentName}. Available: code-reviewer, refactorer`);
      process.exit(1);
  }
}

async function runCodeReviewer(
  cwd: string,
  config: VteamConfig,
  agent: AgentConfig,
): Promise<void> {
  const runId = generateRunId("code-reviewer");
  const tasksDir = resolve(cwd, "vteam", "tasks");
  const overviewPath = resolve(tasksDir, "overview.md");
  const locksDir = resolve(cwd, "vteam", ".locks");
  mkdirSync(locksDir, { recursive: true });

  let agentLock: FileLock | undefined;

  try {
    console.log("Acquiring lock...");
    agentLock = await acquireLock(resolve(locksDir, "code-reviewer"), "code-reviewer");

    const runState: RunState = {
      runId,
      agent: "code-reviewer",
      status: "started",
      startedAt: new Date().toISOString(),
    };
    writeRunState(cwd, runState);

    console.log("Building prompt...");
    const { systemPrompt, userPrompt } = buildCodeReviewerPrompt(
      agent,
      overviewPath,
    );

    console.log("Running code reviewer agent...");
    runState.status = "claude_running";
    writeRunState(cwd, runState);

    const result = await runClaudeAgent({
      systemPrompt,
      userPrompt,
      jsonSchema: REVIEWER_SCHEMA,
      cwd,
      model: agent.model,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        `Claude exited with code ${result.exitCode}\nstderr: ${result.stderr}`,
      );
    }

    console.log("Parsing output...");
    runState.status = "processing";
    writeRunState(cwd, runState);

    const resultText = parseClaudeJsonOutput(result.stdout);
    const output = parseReviewerOutput(resultText);

    console.log(`Found ${output.findings.length} findings. Areas scanned: ${output.areasScanned.join(", ")}`);
    console.log(`Summary: ${output.summary}`);

    const taskIndex = buildTaskIndex(tasksDir);
    const backlogDir = resolve(tasksDir, "backlog");
    const newEntries: OverviewEntry[] = [];
    let created = 0;
    let skipped = 0;

    for (const finding of output.findings) {
      if (isDuplicateTitle(finding.title, taskIndex.all)) {
        console.log(`  Skipped (duplicate): ${finding.title}`);
        skipped++;
        continue;
      }

      const filename = createTaskFile(backlogDir, finding, "code-reviewer");
      created++;
      console.log(`  Created: ${filename}`);

      newEntries.push({
        status: "backlog",
        date: new Date().toISOString().slice(0, 16).replace("T", " "),
        severity: finding.severity,
        title: finding.title,
        files: finding.files[0] ?? "",
        taskPath: `backlog/${filename}`,
      });
    }

    if (newEntries.length > 0) {
      const overviewLock = await acquireLock(resolve(locksDir, "overview"), "code-reviewer");
      try {
        appendToOverview(overviewPath, newEntries);
      } finally {
        overviewLock.release();
      }
    }

    console.log(`\nDone. Created ${created} tasks, skipped ${skipped} duplicates.`);

    runState.status = "completed";
    runState.completedAt = new Date().toISOString();
    writeRunState(cwd, runState);
  } catch (err) {
    console.error("Code reviewer failed:", err instanceof Error ? err.message : err);
    const runState: RunState = {
      runId,
      agent: "code-reviewer",
      status: "failed",
      startedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
    writeRunState(cwd, runState);
    process.exit(1);
  } finally {
    agentLock?.release();
  }
}

async function runRefactorer(
  cwd: string,
  config: VteamConfig,
  agent: AgentConfig,
): Promise<void> {
  const runId = generateRunId("refactorer");
  const tasksDir = resolve(cwd, "vteam", "tasks");
  const overviewPath = resolve(tasksDir, "overview.md");
  const todoDir = resolve(tasksDir, "todo");
  const doneDir = resolve(tasksDir, "done");
  const locksDir = resolve(cwd, "vteam", ".locks");
  mkdirSync(locksDir, { recursive: true });

  let agentLock: FileLock | undefined;
  let worktreePath: string | undefined;
  let branchName: string | undefined;

  try {
    console.log("Acquiring lock...");
    agentLock = await acquireLock(resolve(locksDir, "refactorer"), "refactorer");

    const taskIndex = buildTaskIndex(tasksDir);
    const todoTasks = taskIndex.byStatus.get("todo") ?? [];

    const eligible = todoTasks
      .filter((t) => (t.frontmatter["retry-count"] ?? 0) < config.tasks.maxRetries)
      .sort((a, b) => severityPriority(a.frontmatter.severity) - severityPriority(b.frontmatter.severity));

    if (eligible.length === 0) {
      console.log("No tasks in todo/. Nothing to do.");
      return;
    }

    const task = eligible[0];
    console.log(`Picked task: ${task.frontmatter.title} (${task.frontmatter.severity})`);

    const runState: RunState = {
      runId,
      agent: "refactorer",
      status: "started",
      startedAt: new Date().toISOString(),
      taskFile: task.filename,
    };
    writeRunState(cwd, runState);

    console.log("Creating worktree...");
    const slug = task.filename.replace(/\.md$/, "");
    const wt = createWorktree(cwd, slug, config.baseBranch, config.worktreeDir);
    worktreePath = wt.path;
    branchName = wt.branch;
    runState.worktreePath = worktreePath;
    runState.branchName = branchName;
    writeRunState(cwd, runState);

    console.log(`Worktree: ${worktreePath} (branch: ${branchName})`);

    console.log("Building prompt...");
    const { systemPrompt, userPrompt } = buildRefactorerPrompt(
      agent,
      overviewPath,
      task,
    );

    console.log("Running refactorer agent...");
    runState.status = "claude_running";
    writeRunState(cwd, runState);

    const result = await runClaudeAgent({
      systemPrompt,
      userPrompt,
      jsonSchema: REFACTORER_SCHEMA,
      cwd: worktreePath,
      model: agent.model,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        `Claude exited with code ${result.exitCode}\nstderr: ${result.stderr}`,
      );
    }

    console.log("Parsing output...");
    runState.status = "processing";
    writeRunState(cwd, runState);

    const resultText = parseClaudeJsonOutput(result.stdout);
    const output = parseRefactorerOutput(resultText);

    console.log(`Status: ${output.status}`);
    console.log(`Summary: ${output.summary}`);
    console.log(`Files changed: ${output.filesChanged.join(", ")}`);

    if (output.status === "completed") {
      console.log("Pushing branch...");
      let pushAttempts = 0;
      const maxPushAttempts = 3;
      while (pushAttempts < maxPushAttempts) {
        try {
          pushBranch(worktreePath, branchName);
          break;
        } catch (pushErr) {
          pushAttempts++;
          if (pushAttempts >= maxPushAttempts) throw pushErr;
          console.log(`Push attempt ${pushAttempts} failed, retrying...`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      let mrUrl: string | undefined;
      if (agent.autoMR !== false) {
        console.log("Creating merge request...");
        try {
          mrUrl = createMergeRequest({
            platform: config.platform,
            branch: branchName,
            baseBranch: config.baseBranch,
            title: `vteam: ${task.frontmatter.title}`,
            body: `## Automated by vteam refactorer\n\n${output.summary}\n\n### Files changed\n${output.filesChanged.map((f) => `- ${f}`).join("\n")}`,
            labels: agent.mrLabels,
            cwd,
          });
          console.log(`MR created: ${mrUrl}`);
        } catch (mrErr) {
          console.error("MR creation failed:", mrErr instanceof Error ? mrErr.message : mrErr);
          console.log("Branch was pushed. Create the MR manually.");
        }
      }

      console.log("Moving task to done...");
      moveTask(todoDir, doneDir, task.filename, {
        status: "done",
        completed: new Date().toISOString(),
        branch: branchName,
        "mr-url": mrUrl,
      });

      const overviewLock = await acquireLock(resolve(locksDir, "overview"), "refactorer");
      try {
        updateOverviewEntryStatus(overviewPath, task.frontmatter.title, "done", {
          branch: branchName,
          mrUrl,
        });
      } finally {
        overviewLock.release();
      }

      console.log("\nTask completed successfully.");
    } else {
      console.log(`Task not completed: ${output.status}`);
      if (output.blockerReason) {
        console.log(`Reason: ${output.blockerReason}`);
      }

      const currentRetries = task.frontmatter["retry-count"] ?? 0;
      updateTaskFrontmatter(task.path, {
        "retry-count": currentRetries + 1,
      });
      console.log(`Retry count: ${currentRetries + 1}/${config.tasks.maxRetries}`);
    }

    runState.status = "completed";
    runState.completedAt = new Date().toISOString();
    writeRunState(cwd, runState);
  } catch (err) {
    console.error("Refactorer failed:", err instanceof Error ? err.message : err);
    const runState: RunState = {
      runId,
      agent: "refactorer",
      status: "failed",
      startedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
    writeRunState(cwd, runState);
    process.exit(1);
  } finally {
    if (worktreePath) {
      console.log("Cleaning up worktree...");
      removeWorktree(cwd, worktreePath);
    }
    agentLock?.release();
  }
}
