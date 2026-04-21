import { readFileSync } from "node:fs";
import { parse } from "../frontmatter.js";
import { buildTaskIndex } from "../memory/task-index.js";
import type { AgentConfig, TaskFile, PRReviewContext, OnFinishConfig, RunOutcome } from "../types.js";

interface PromptParts {
  systemPrompt: string;
  userPrompt: string;
}

export function buildPrompt(
  agent: AgentConfig,
  tasksDir: string,
  task?: TaskFile,
  review?: PRReviewContext,
): PromptParts {
  const raw = readFileSync(agent.agentMdPath, "utf-8");
  const { content } = parse(raw);

  const systemPrompt = content.trim();

  const sections: string[] = [];

  const index = buildTaskIndex(tasksDir);
  if (index.all.length > 0) {
    const lines = index.all.map((t) => {
      const files = t.frontmatter.files.join(", ");
      return `- [${t.frontmatter.status}] ${t.frontmatter.severity} | ${t.frontmatter.title} | ${files}`;
    });
    sections.push(
      `## Existing Tasks\n\nDo not report issues that already appear in this list.\n\n${lines.join("\n")}`,
    );
  }

  if (agent.scanPaths?.length || agent.excludePaths?.length) {
    const scopeParts: string[] = [];
    if (agent.scanPaths?.length) {
      scopeParts.push(`Focus on these paths: ${agent.scanPaths.join(", ")}`);
    }
    if (agent.excludePaths?.length) {
      scopeParts.push(`Skip these paths: ${agent.excludePaths.join(", ")}`);
    }
    sections.push(`## Scope\n\n${scopeParts.join("\n")}`);
  }

  if (task) {
    sections.push(
      `## Your Task\n\nTitle: ${task.frontmatter.title}\nSeverity: ${task.frontmatter.severity}\nFiles: ${task.frontmatter.files.join(", ")}\n\n${task.body}`,
    );
  }

  if (review) {
    sections.push(buildReviewSection(review));
  }

  const userPrompt = sections.join("\n\n");
  return { systemPrompt, userPrompt };
}

export function buildOnFinishPrompt(
  onFinish: OnFinishConfig,
  outcome: RunOutcome,
): PromptParts {
  const raw = readFileSync(onFinish.onFinishMdPath, "utf-8");
  const { content } = parse(raw);
  const systemPrompt = content.trim();

  const sections: string[] = [];

  const outcomeLines = [
    `- Agent: ${outcome.agent}`,
    `- Status: ${outcome.status}`,
    `- Started: ${outcome.startedAt}`,
    `- Completed: ${outcome.completedAt}`,
  ];
  sections.push(`## Run Outcome\n\n${outcomeLines.join("\n")}`);

  if (outcome.task) {
    sections.push(
      `## Task\n\n- Title: ${outcome.task.title}\n- Severity: ${outcome.task.severity}\n- Files: ${outcome.task.files.join(", ")}`,
    );
  }

  if (outcome.branch || outcome.prUrl) {
    const lines: string[] = [];
    if (outcome.branch) lines.push(`- Branch: ${outcome.branch}`);
    if (outcome.prUrl) lines.push(`- PR URL: ${outcome.prUrl}`);
    sections.push(`## Branch & PR\n\n${lines.join("\n")}`);
  }

  if (outcome.reviewedPR) {
    sections.push(
      `## Reviewed PR\n\n- Number: #${outcome.reviewedPR.number}\n- Title: ${outcome.reviewedPR.title}\n- URL: ${outcome.reviewedPR.url}`,
    );
  }

  if (outcome.error) {
    sections.push(`## Error\n\n${outcome.error}`);
  }

  return { systemPrompt, userPrompt: sections.join("\n\n") };
}

function buildReviewSection(review: PRReviewContext): string {
  const lines: string[] = [
    `## Pull Request`,
    "",
    `Number: #${review.pr.number}`,
    `Repository: ${review.repoSlug}`,
    `Title: ${review.pr.title}`,
    `URL: ${review.pr.url}`,
    `Branch: ${review.pr.branch}`,
    "",
    `## Review Comments`,
    "",
    "Address each of the following review comments:",
    "",
  ];

  for (const comment of review.comments) {
    if (comment.path) {
      lines.push(
        `### ${comment.author} on \`${comment.path}${comment.line ? `:${comment.line}` : ""}\``,
      );
    } else {
      lines.push(`### ${comment.author}`);
    }
    lines.push("");
    lines.push(comment.body);
    lines.push("");
  }

  return lines.join("\n");
}
