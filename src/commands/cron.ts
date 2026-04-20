import { existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { resolveAgentConfig, listAgentNames } from "../config/agent.js";
import type { AgentConfig } from "../types.js";

const BLOCK_BEGIN = "# vteam-begin";
const BLOCK_END = "# vteam-end";

export async function cronScheduleCommand(): Promise<void> {
  const cwd = process.cwd();
  const agents = findCronAgents(cwd);

  if (agents.length === 0) {
    console.log("No agents with cron patterns found.");
    return;
  }

  const nodePath = resolveBinaryPath("node");
  const binPath = resolveBinJs(cwd);
  const logsDir = resolve(cwd, "vteam", ".logs");
  mkdirSync(logsDir, { recursive: true });

  const block = buildCronBlock(cwd, agents, nodePath, binPath);
  const current = readCrontab();
  const stripped = stripVteamBlock(current, cwd);
  const updated =
    (stripped.trimEnd() ? stripped.trimEnd() + "\n" : "") + block + "\n";

  writeCrontab(updated);

  console.log(`Scheduled ${agents.length} agent(s):\n`);
  for (const agent of agents) {
    console.log(`  ${agent.name}  ${agent.cron}`);
  }
}

export async function cronClearCommand(): Promise<void> {
  const cwd = process.cwd();
  const current = readCrontab();
  const stripped = stripVteamBlock(current, cwd);

  if (stripped === current) {
    console.log("No vteam cron entries found.");
    return;
  }

  if (stripped.trim()) {
    writeCrontab(stripped);
  } else {
    execSync("crontab -r", { encoding: "utf-8" });
  }
  console.log("Removed vteam cron entries.");
}

export async function cronStatusCommand(): Promise<void> {
  const cwd = process.cwd();
  const current = readCrontab();

  const marker = `${BLOCK_BEGIN} ${cwd}`;
  const endMarker = `${BLOCK_END} ${cwd}`;
  const lines = current.split("\n");
  const entries: string[] = [];
  let inside = false;

  for (const line of lines) {
    if (line === marker) {
      inside = true;
      continue;
    }
    if (line === endMarker) {
      inside = false;
      continue;
    }
    if (inside && line.trim() && !line.startsWith("#")) {
      entries.push(line);
    }
  }

  if (entries.length === 0) {
    console.log("No vteam cron entries scheduled.");
    return;
  }

  console.log(`${entries.length} agent(s) scheduled:\n`);
  for (const line of entries) {
    const agentMatch = line.match(/vteam run (\S+)/);
    const agentName = agentMatch?.[1] ?? "unknown";
    const cronMatch = line.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)/);
    const pattern = cronMatch?.[1] ?? "";
    console.log(`  ${agentName}  ${pattern}`);
  }
}

function findCronAgents(cwd: string): AgentConfig[] {
  const names = listAgentNames(cwd);
  const agents: AgentConfig[] = [];

  for (const name of names) {
    try {
      const agent = resolveAgentConfig(name, cwd);
      if (agent.cron) agents.push(agent);
    } catch {
      // skip agents with invalid frontmatter
    }
  }

  return agents;
}

function resolveBinaryPath(name: string): string {
  try {
    return execSync(`which ${name}`, { encoding: "utf-8" }).trim();
  } catch {
    throw new Error(
      `${name} not found. Ensure Node.js is installed and in PATH.`,
    );
  }
}

function resolveBinJs(cwd: string): string {
  const candidates = [
    resolve(cwd, "dist", "bin.js"),
    resolve(cwd, "node_modules", ".bin", "vteam"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "Cannot find vteam binary. Run 'just build' or install the package first.",
  );
}

export function buildCronBlock(
  cwd: string,
  agents: AgentConfig[],
  nodePath: string,
  binPath: string,
): string {
  const logsDir = resolve(cwd, "vteam", ".logs");
  const lines: string[] = [];

  lines.push(`${BLOCK_BEGIN} ${cwd}`);
  for (const agent of agents) {
    if (!agent.cron) continue;
    const logFile = resolve(logsDir, `${agent.name}.log`);
    lines.push(
      `${agent.cron} { echo "--- $(date -Iseconds) ${agent.name} ---"; cd "${cwd}" && "${nodePath}" "${binPath}" run ${agent.name}; } >> "${logFile}" 2>&1`,
    );
  }
  lines.push(`${BLOCK_END} ${cwd}`);

  return lines.join("\n");
}

export function stripVteamBlock(crontab: string, cwd: string): string {
  const marker = `${BLOCK_BEGIN} ${cwd}`;
  const endMarker = `${BLOCK_END} ${cwd}`;
  const lines = crontab.split("\n");
  const result: string[] = [];
  let inside = false;

  for (const line of lines) {
    if (line === marker) {
      inside = true;
      continue;
    }
    if (line === endMarker) {
      inside = false;
      continue;
    }
    if (!inside) {
      result.push(line);
    }
  }

  return result.join("\n");
}

function readCrontab(): string {
  try {
    return execSync("crontab -l", { encoding: "utf-8" });
  } catch {
    return "";
  }
}

function writeCrontab(content: string): void {
  const cleaned = content.replace(/\n+$/, "") + "\n";
  execSync("crontab -", { input: cleaned, encoding: "utf-8" });
}
