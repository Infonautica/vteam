import { readFileSync } from "node:fs";
import { readOverview } from "../memory/overview.js";
import type { AgentConfig, TaskFile } from "../types.js";

interface PromptParts {
  systemPrompt: string;
  userPrompt: string;
}

export function buildCodeReviewerPrompt(
  agent: AgentConfig,
  overviewPath: string,
): PromptParts {
  const agentMd = readFileSync(agent.agentMdPath, "utf-8");
  const overview = readOverview(overviewPath);

  const scanScope = agent.scanPaths?.length
    ? `Focus your review on these paths: ${agent.scanPaths.join(", ")}`
    : "Review the entire codebase.";

  const excludeNote = agent.excludePaths?.length
    ? `Skip these paths: ${agent.excludePaths.join(", ")}`
    : "";

  const systemPrompt = agentMd;

  const userPrompt = `## Team Memory

The following is the current overview of all known tasks. DO NOT report findings that match any existing entry.

${overview}

## Your Task

${scanScope}
${excludeNote}

## Instructions

- Review the codebase and identify up to 5 issues.
- For each issue, provide title, severity, description, suggested fix, and affected files with line numbers.
- Return your response as JSON matching the required schema.`;

  return { systemPrompt, userPrompt };
}

export function buildRefactorerPrompt(
  agent: AgentConfig,
  overviewPath: string,
  task: TaskFile,
): PromptParts {
  const agentMd = readFileSync(agent.agentMdPath, "utf-8");
  const overview = readOverview(overviewPath);

  const systemPrompt = agentMd;

  const userPrompt = `## Team Memory

${overview}

## Your Task

Title: ${task.frontmatter.title}
Severity: ${task.frontmatter.severity}
Files: ${task.frontmatter.files.join(", ")}

${task.body}

## Instructions

- Implement the changes described above.
- Make minimal, focused edits. Do not refactor unrelated code.
- Run tests if available.
- Create a single git commit with message: "vteam: ${task.frontmatter.title}"
- Do NOT push. The orchestrator handles pushing.
- Return your response as JSON matching the required schema.`;

  return { systemPrompt, userPrompt };
}
