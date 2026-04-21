import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "../frontmatter.js";
import { agentFrontmatterSchema, onFinishFrontmatterSchema } from "./schema.js";
import type { AgentConfig, OnFinishConfig } from "../types.js";

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

  let onFinish: OnFinishConfig | undefined;
  const onFinishPath = resolve(agentDir, "ON_FINISH.md");
  if (existsSync(onFinishPath)) {
    const rawOnFinish = readFileSync(onFinishPath, "utf-8");
    const { data: onFinishData } = parse(rawOnFinish);
    const onFinishResult = onFinishFrontmatterSchema.safeParse(onFinishData);
    if (!onFinishResult.success) {
      const issues = onFinishResult.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid frontmatter in ${name}/ON_FINISH.md:\n${issues}`);
    }
    onFinish = { onFinishMdPath: onFinishPath, ...onFinishResult.data };
  }

  return {
    name,
    agentMdPath,
    ...result.data,
    ...(onFinish ? { onFinish } : {}),
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
