import { spawn } from "node:child_process";

interface AgentRunOptions {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: object;
  cwd: string;
  model?: string;
}

interface AgentRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runClaudeAgent(
  options: AgentRunOptions,
): Promise<AgentRunResult> {
  const args = [
    "-p",
    options.userPrompt,
    "--append-system-prompt",
    options.systemPrompt,
    "--json-schema",
    JSON.stringify(options.jsonSchema),
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions",
    "--no-session-persistence",
  ];

  if (options.model) {
    args.push("--model", options.model);
  }

  return new Promise<AgentRunResult>((resolve, reject) => {
    const proc = spawn("claude", args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    proc.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

export const REVIEWER_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          severity: { enum: ["critical", "high", "medium", "low"] },
          description: { type: "string" },
          suggestedFix: { type: "string" },
          files: { type: "array", items: { type: "string" } },
        },
        required: ["title", "severity", "description", "files"],
      },
    },
    summary: { type: "string" },
    areasScanned: { type: "array", items: { type: "string" } },
  },
  required: ["findings", "summary", "areasScanned"],
};

export const REFACTORER_SCHEMA = {
  type: "object",
  properties: {
    status: { enum: ["completed", "partial", "blocked", "failed"] },
    summary: { type: "string" },
    filesChanged: { type: "array", items: { type: "string" } },
    blockerReason: { type: "string" },
  },
  required: ["status", "summary", "filesChanged"],
};
