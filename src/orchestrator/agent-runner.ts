import { spawn } from "node:child_process";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

interface AgentRunOptions {
  systemPrompt: string;
  userPrompt: string;
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
  const tmp = mkdtempSync(join(tmpdir(), "vteam-"));
  const systemPromptFile = resolve(tmp, "system-prompt.md");

  writeFileSync(systemPromptFile, options.systemPrompt, "utf-8");

  const args = [
    "-p",
    "--append-system-prompt-file",
    systemPromptFile,
    "--output-format",
    "text",
    "--permission-mode",
    "bypassPermissions",
    "--no-session-persistence",
  ];

  if (options.model) {
    args.push("--model", options.model);
  }

  console.log(`[vteam] System prompt file: ${systemPromptFile}`);
  console.log(`[vteam] cwd: ${options.cwd}`);

  try {
    return await new Promise<AgentRunResult>((resolve, reject) => {
      const proc = spawn("claude", args, {
        cwd: options.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      proc.stdin.write(options.userPrompt);
      proc.stdin.end();

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
        process.stdout.write(data);
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn claude: ${err.message}`));
      });

      proc.on("close", (code) => {
        console.log(`\n[vteam] claude exited with code ${code}`);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      });
    });
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
