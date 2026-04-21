import {
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { acquireLock, type FileLock } from "../memory/lock.js";
import { buildPrompt, buildOnFinishPrompt } from "../orchestrator/prompt-builder.js";
import { runClaudeAgent } from "../orchestrator/agent-runner.js";
import { buildTaskIndex } from "../memory/task-index.js";
import {
  severityPriority,
  moveTask,
  updateTaskFrontmatter,
} from "../tasks/task-file.js";
import {
  createWorktree,
  checkoutWorktree,
  removeWorktree,
  pushBranch,
  getCommitSha,
} from "../worktree/manager.js";
import { createMergeRequest } from "../integrations/merge-request.js";
import {
  findReviewablePR,
  getReviewComments,
  getRepoSlug,
  postPRComment,
  removePRLabel,
} from "../integrations/pull-request.js";
import { loadConfig } from "../config/load.js";
import { resolveAgentConfig, listAgentNames } from "../config/agent.js";
import type {
  AgentConfig,
  VteamConfig,
  RunState,
  TaskFile,
  PRReviewContext,
  RunOutcome,
} from "../types.js";

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

function listAgents(cwd: string): void {
  const agentNames = listAgentNames(cwd);

  if (agentNames.length === 0) {
    console.log("No agents found. Run 'vteam init' first.");
    return;
  }

  console.log("Available agents:\n");
  for (const name of agentNames) {
    try {
      const agent = resolveAgentConfig(name, cwd);
      const flags = [
        agent.worktree ? "worktree" : null,
        agent.input ? `input: ${agent.input}` : null,
        agent.autoPR ? "autoPR" : null,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(`  ${name}${flags ? `  (${flags})` : ""}`);
    } catch {
      console.log(`  ${name}  (invalid frontmatter)`);
    }
  }
}

export async function runCommand(agentName?: string): Promise<void> {
  const cwd = process.cwd();

  if (!agentName) {
    listAgents(cwd);
    return;
  }

  const config = loadConfig(cwd);
  const agent = resolveAgentConfig(agentName, cwd);
  await runAgent(cwd, config, agent);
}

async function runAgent(
  cwd: string,
  config: VteamConfig,
  agent: AgentConfig,
): Promise<void> {
  const runId = generateRunId(agent.name);
  const tasksDir = resolve(cwd, "vteam", "tasks");
  const locksDir = resolve(cwd, "vteam", ".locks");
  mkdirSync(locksDir, { recursive: true });

  const startedAt = new Date().toISOString();
  let agentLock: FileLock | undefined;
  let worktreePath: string | undefined;
  let branchName: string | undefined;
  let task: TaskFile | undefined;
  let reviewContext: PRReviewContext | undefined;
  let prUrl: string | undefined;
  let runOutcome: RunOutcome | undefined;

  try {
    console.log("Acquiring lock...");
    agentLock = await acquireLock(
      resolve(locksDir, agent.name),
      agent.name,
    );

    if (agent.input === "task") {
      const taskIndex = buildTaskIndex(tasksDir);
      const todoTasks = taskIndex.byStatus.get("todo") ?? [];
      const eligible = todoTasks
        .filter(
          (t) =>
            (t.frontmatter["retry-count"] ?? 0) <
            config.tasks.maxRetries,
        )
        .sort(
          (a, b) =>
            severityPriority(a.frontmatter.severity) -
            severityPriority(b.frontmatter.severity),
        );

      if (eligible.length === 0) {
        console.log("No tasks in todo/. Nothing to do.");
        return;
      }
      task = eligible[0];
      console.log(
        `Picked task: ${task.frontmatter.title} (${task.frontmatter.severity})`,
      );
    }

    if (agent.input === "pr") {
      const searchLabels = [
        ...(agent.prFilterLabels ?? []),
        ...(agent.prTriggerLabel ? [agent.prTriggerLabel] : []),
      ];
      const pr = findReviewablePR(config.platform, searchLabels, cwd);
      if (!pr) {
        console.log("No PRs need review response. Nothing to do.");
        return;
      }
      const comments = getReviewComments(config.platform, pr.number, cwd);
      if (comments.length === 0) {
        console.log(`PR #${pr.number} has no actionable comments. Skipping.`);
        return;
      }
      const repoSlug = getRepoSlug(config.platform, cwd);
      reviewContext = { pr, comments, repoSlug };
      console.log(
        `Responding to PR #${pr.number}: ${pr.title} (${comments.length} comments)`,
      );
    }

    const runState: RunState = {
      runId,
      agent: agent.name,
      status: "started",
      startedAt,
      ...(task ? { taskFile: task.filename } : {}),
    };
    writeRunState(cwd, runState);

    let agentCwd = cwd;
    if (agent.worktree) {
      if (reviewContext) {
        console.log(`Checking out PR branch: ${reviewContext.pr.branch}...`);
        const wt = checkoutWorktree(
          cwd,
          reviewContext.pr.branch,
          config.worktreeDir,
        );
        worktreePath = wt.path;
        branchName = wt.branch;
      } else {
        console.log("Creating worktree...");
        const slug = task
          ? task.filename.replace(/\.md$/, "")
          : `${agent.name}-${runId}`;
        const wt = createWorktree(
          cwd,
          slug,
          config.baseBranch,
          config.worktreeDir,
        );
        worktreePath = wt.path;
        branchName = wt.branch;
      }
      agentCwd = worktreePath;
      runState.worktreePath = worktreePath;
      runState.branchName = branchName;
      writeRunState(cwd, runState);
      console.log(`Worktree: ${worktreePath} (branch: ${branchName})`);
    }

    console.log("Building prompt...");
    const { systemPrompt, userPrompt } = buildPrompt(
      agent,
      tasksDir,
      task,
      reviewContext,
    );

    console.log(`Running ${agent.name} agent...`);
    runState.status = "claude_running";
    writeRunState(cwd, runState);

    const result = await runClaudeAgent({
      systemPrompt,
      userPrompt,
      cwd: agentCwd,
      model: agent.model,
      allowedTools: agent.allowedTools,
      disallowedTools: agent.disallowedTools,
    });

    if (result.exitCode !== 0) {
      throw new Error(`Claude exited with code ${result.exitCode}`);
    }

    if (agent.worktree && worktreePath && branchName) {
      const hasCommit = hasNewCommit(worktreePath, config.baseBranch);

      if (hasCommit) {
        console.log(`\n${agent.name} made changes. Pushing...`);
        pushBranch(worktreePath, branchName);

        if (reviewContext) {
          try {
            const sha = getCommitSha(worktreePath);
            postPRComment(
              config.platform,
              reviewContext.pr.number,
              `Addressed review feedback in \`${sha.slice(0, 7)}\`.`,
              cwd,
            );
            console.log(`Comment posted on PR #${reviewContext.pr.number}.`);
          } catch (commentErr) {
            console.error(
              "Failed to post PR comment:",
              commentErr instanceof Error ? commentErr.message : commentErr,
            );
          }

          if (agent.prTriggerLabel) {
            removePRLabel(
              config.platform,
              reviewContext.pr.number,
              agent.prTriggerLabel,
              cwd,
            );
            console.log(`Removed label "${agent.prTriggerLabel}" from PR #${reviewContext.pr.number}.`);
          }
        }

        if (agent.autoPR) {
          console.log("Creating pull request...");
          try {
            const commitSubject = getCommitSubject(worktreePath);
            const commitBody = getCommitBody(worktreePath);
            const prBody = commitBody || `Automated by vteam (${agent.name}).${task ? `\n\nTask: ${task.frontmatter.title}` : ""}`;
            const summary = task?.frontmatter.title || commitSubject.replace(/^vteam:\s*/i, "") || "";
            const prTitle = summary
              ? `vteam: ${agent.name}: ${summary}`
              : `vteam: ${agent.name}`;
            prUrl = createMergeRequest({
              platform: config.platform,
              branch: branchName,
              baseBranch: config.baseBranch,
              title: prTitle,
              body: prBody,
              labels: agent.prCreateLabels,
              cwd,
            });
            console.log(`PR created: ${prUrl}`);
          } catch (mrErr) {
            console.error(
              "PR creation failed:",
              mrErr instanceof Error ? mrErr.message : mrErr,
            );
            console.log("Branch was pushed. Create the PR manually.");
          }
        }

        if (task) {
          const todoDir = resolve(tasksDir, "todo");
          const doneDir = resolve(tasksDir, "done");
          moveTask(todoDir, doneDir, task.filename, {
            status: "done",
            completed: new Date().toISOString(),
            branch: branchName,
            ...(prUrl ? { "pr-url": prUrl } : {}),
          });
          console.log("Task completed.");
        }
      } else {
        console.log(`\n${agent.name} did not commit any changes.`);
        if (task) {
          const currentRetries = task.frontmatter["retry-count"] ?? 0;
          updateTaskFrontmatter(task.path, {
            "retry-count": currentRetries + 1,
          });
          console.log(
            `Retry count: ${currentRetries + 1}/${config.tasks.maxRetries}`,
          );
        }
      }
    }

    console.log(`\n${agent.name} finished.`);
    const completedAt = new Date().toISOString();
    runState.status = "completed";
    runState.completedAt = completedAt;
    writeRunState(cwd, runState);

    runOutcome = {
      agent: agent.name,
      status: "completed",
      startedAt,
      completedAt,
      task: task ? { title: task.frontmatter.title, severity: task.frontmatter.severity, files: task.frontmatter.files } : undefined,
      branch: branchName,
      prUrl,
      reviewedPR: reviewContext ? { number: reviewContext.pr.number, title: reviewContext.pr.title, url: reviewContext.pr.url } : undefined,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`${agent.name} failed:`, errorMsg);
    const failedAt = new Date().toISOString();
    writeRunState(cwd, {
      runId,
      agent: agent.name,
      status: "failed",
      startedAt,
      error: errorMsg,
    });

    runOutcome = {
      agent: agent.name,
      status: "failed",
      startedAt,
      completedAt: failedAt,
      error: errorMsg,
      task: task ? { title: task.frontmatter.title, severity: task.frontmatter.severity, files: task.frontmatter.files } : undefined,
      branch: branchName,
      reviewedPR: reviewContext ? { number: reviewContext.pr.number, title: reviewContext.pr.title, url: reviewContext.pr.url } : undefined,
    };
  } finally {
    if (runOutcome) {
      await runOnFinishHook(agent, runOutcome, cwd);
    }
    if (worktreePath) {
      console.log("Cleaning up worktree...");
      removeWorktree(cwd, worktreePath);
    }
    agentLock?.release();
    if (runOutcome?.status === "failed") {
      process.exit(1);
    }
  }
}

async function runOnFinishHook(
  agent: AgentConfig,
  outcome: RunOutcome,
  cwd: string,
): Promise<void> {
  if (!agent.onFinish) return;

  console.log(`\nRunning on-finish hook for ${agent.name}...`);
  const { systemPrompt, userPrompt } = buildOnFinishPrompt(
    agent.onFinish,
    outcome,
  );

  try {
    await runClaudeAgent({
      systemPrompt,
      userPrompt,
      cwd,
      model: agent.onFinish.model,
      allowedTools: agent.onFinish.allowedTools,
      disallowedTools: agent.onFinish.disallowedTools,
    });
    console.log("On-finish hook completed.");
  } catch (hookErr) {
    console.error(
      "On-finish hook failed:",
      hookErr instanceof Error ? hookErr.message : hookErr,
    );
  }
}

function hasNewCommit(worktreePath: string, baseBranch: string): boolean {
  try {
    const log = execSync(`git log ${baseBranch}..HEAD --oneline`, {
      cwd: worktreePath,
      encoding: "utf-8",
    });
    return log.trim().length > 0;
  } catch {
    return false;
  }
}

function getCommitSubject(worktreePath: string): string {
  try {
    return execSync("git log -1 --format=%s", {
      cwd: worktreePath,
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
}

function getCommitBody(worktreePath: string): string {
  try {
    return execSync("git log -1 --format=%b", {
      cwd: worktreePath,
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
}
