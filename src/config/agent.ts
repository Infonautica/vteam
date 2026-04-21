import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "../frontmatter.js";
import { agentFrontmatterSchema } from "./schema.js";
import type { AgentConfig } from "../types.js";

export function resolveAgentConfig(
  name: string,
  cwd: string,
): AgentConfig {
  const agentDir = resolve(cwd, "vteam", "agents", name);
  const agentMdPath = resolve(agentDir, "AGENT.md");

  if (!existsSync(agentMdPath)) {
    throw new Error(`Agent "${name}" not found at ${agentMdPath}`);
  }

  const raw = readFileSync(agentMdPath, "utf-8");
  const { data } = parse(raw);
  const result = agentFrontmatterSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid frontmatter in ${name}/AGENT.md:\n${issues}`);
  }

  return {
    name,
    agentMdPath,
    ...result.data,
  };
}

export function listAgentNames(cwd: string): string[] {
  const agentsDir = resolve(cwd, "vteam", "agents");
  if (!existsSync(agentsDir)) return [];

  return readdirSync(agentsDir, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        existsSync(resolve(agentsDir, e.name, "AGENT.md")),
    )
    .map((e) => e.name);
}
