import { readFileSync } from "node:fs";
import { readOverview } from "../memory/overview.js";
import type { AgentConfig, TaskFile } from "../types.js";

interface PromptParts {
  systemPrompt: string;
  userPrompt: string;
}

export function buildPrompt(
  agent: AgentConfig,
  overviewPath: string,
  task?: TaskFile,
): PromptParts {
  const agentMd = readFileSync(agent.agentMdPath, "utf-8");
  const overview = readOverview(overviewPath);

  const systemPrompt = agentMd;

  const sections: string[] = [];

  sections.push(
    `## Team Memory\n\nThe following is the current overview of all known tasks.\n\n${overview}`,
  );

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

  const userPrompt = sections.join("\n\n");
  return { systemPrompt, userPrompt };
}
