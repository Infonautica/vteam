import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { buildTaskIndex } from "../memory/task-index.js";
import type { AgentConfig, TaskFile } from "../types.js";

interface PromptParts {
  systemPrompt: string;
  userPrompt: string;
}

export function buildPrompt(
  agent: AgentConfig,
  tasksDir: string,
  task?: TaskFile,
): PromptParts {
  const raw = readFileSync(agent.agentMdPath, "utf-8");
  const { content } = matter(raw);

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

  const userPrompt = sections.join("\n\n");
  return { systemPrompt, userPrompt };
}
