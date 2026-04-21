import { mkdirSync, createWriteStream } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { Cron } from "croner";
import { resolveAgentConfig, listAgentNames } from "../config/agent.js";
import type { AgentConfig } from "../types.js";

export async function loopStartCommand(): Promise<void> {
  const cwd = process.cwd();
  const agents = findCronAgents(cwd);

  if (agents.length === 0) {
    console.log("No agents with cron patterns found.");
    return;
  }

  const logsDir = resolve(cwd, "vteam", ".logs");
  mkdirSync(logsDir, { recursive: true });

  const jobs: Cron[] = [];
  const running = new Map<string, ChildProcess>();

  console.log(`Starting loop with ${agents.length} agent(s):\n`);

  for (const agent of agents) {
    if (!agent.cron) continue;

    const job = new Cron(agent.cron, () => {
      if (running.has(agent.name)) {
        console.log(`[${ts()}] ${agent.name} skipped (still running)`);
        return;
      }
      spawnAgentRun(cwd, agent, logsDir, running);
    });

    jobs.push(job);

    const next = job.nextRun();
    console.log(
      `  ${agent.name}  ${agent.cron}  next: ${next?.toISOString() ?? "—"}`,
    );
  }

  console.log("\nLoop running. Press Ctrl+C to stop.");

  const shutdown = () => {
    console.log("\nStopping...");
    for (const job of jobs) job.stop();
    for (const [name, child] of running) {
      child.kill("SIGTERM");
      console.log(`  killed ${name}`);
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export async function loopStatusCommand(): Promise<void> {
  const cwd = process.cwd();
  const agents = findCronAgents(cwd);

  if (agents.length === 0) {
    console.log("No agents with cron patterns found.");
    return;
  }

  console.log(`${agents.length} agent(s) with cron schedules:\n`);

  for (const agent of agents) {
    if (!agent.cron) continue;
    const job = new Cron(agent.cron);
    const next = job.nextRun();
    job.stop();
    console.log(
      `  ${agent.name}  ${agent.cron}  next: ${next?.toISOString() ?? "—"}`,
    );
  }
}

function spawnAgentRun(
  cwd: string,
  agent: AgentConfig,
  logsDir: string,
  running: Map<string, ChildProcess>,
): void {
  const now = new Date();
  const timestamp = ts();
  const agentLogsDir = resolve(logsDir, agent.name);
  mkdirSync(agentLogsDir, { recursive: true });

  const logFile = resolve(agentLogsDir, formatLogFilename(now));
  const logStream = createWriteStream(logFile);

  const { command, args } = buildChildArgs(
    process.execPath,
    process.execArgv,
    process.argv[1],
    agent.name,
  );
  const child = spawn(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });

  running.set(agent.name, child);
  console.log(`[${timestamp}] ${agent.name} started → ${logFile}`);

  child.stdout?.pipe(logStream, { end: false });
  child.stderr?.pipe(logStream, { end: false });

  child.on("close", (code) => {
    running.delete(agent.name);
    logStream.end();
    console.log(`[${ts()}] ${agent.name} finished (exit ${code})`);
  });
}

export function formatLogFilename(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-") + ".log";
}

export function buildChildArgs(
  execPath: string,
  execArgv: string[],
  scriptPath: string,
  agentName: string,
): { command: string; args: string[] } {
  return {
    command: execPath,
    args: [...execArgv, scriptPath, "run", agentName],
  };
}

export function findCronAgents(cwd: string): AgentConfig[] {
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

function ts(): string {
  return new Date().toISOString();
}
