import { spawn } from "node:child_process";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

interface AgentRunOptions {
  systemPrompt: string;
  userPrompt: string;
  cwd: string;
  model?: string;
  timeoutMs?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface AgentRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  resultText: string | null;
  costUsd?: number;
  durationMs?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface StreamEvent {
  type: string;
  subtype?: string;
  message?: { content?: ContentBlock[] };
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
}

function formatEvent(event: StreamEvent): string | null {
  if (event.type !== "assistant" || !event.message?.content) return null;

  const lines: string[] = [];
  for (const block of event.message.content) {
    if (block.type === "tool_use" && block.name) {
      const input = block.input ?? {};
      const detail = input.command ?? input.pattern ?? input.file_path ?? input.description ?? "";
      lines.push(`[claude][tool] ${block.name}${detail ? `: ${String(detail).slice(0, 120)}` : ""}`);
    }
    if (block.type === "text" && block.text) {
      lines.push(`[claude][text] ${block.text.slice(0, 200)}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : null;
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
    "stream-json",
    "--verbose",
    "--no-session-persistence",
  ];

  if (options.model) {
    args.push("--model", options.model);
  }

  if (options.allowedTools?.length) {
    args.push("--allowedTools", ...options.allowedTools);
  }

  if (options.disallowedTools?.length) {
    args.push("--disallowedTools", ...options.disallowedTools);
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

      const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
      const deadline = setTimeout(() => {
        console.error(`[vteam] Claude subprocess timed out after ${timeoutMs}ms — sending SIGTERM`);
        proc.kill("SIGTERM");
      }, timeoutMs);

      proc.stdin.write(options.userPrompt);
      proc.stdin.end();

      let stdout = "";
      let stderr = "";
      let lineBuffer = "";
      let resultText: string | null = null;
      let costUsd: number | undefined;
      let durationMs: number | undefined;

      proc.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        lineBuffer += chunk;

        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event: StreamEvent = JSON.parse(trimmed);
            const formatted = formatEvent(event);
            if (formatted) console.log(formatted);

            if (event.type === "result") {
              if (event.result) resultText = event.result;
              costUsd = event.cost_usd;
              durationMs = event.duration_ms;
            }
          } catch {
            console.log(trimmed);
          }
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn claude: ${err.message}`));
      });

      proc.on("close", (code) => {
        clearTimeout(deadline);
        if (lineBuffer.trim()) {
          try {
            const event: StreamEvent = JSON.parse(lineBuffer.trim());
            if (event.type === "result" && event.result) {
              resultText = event.result;
              costUsd = event.cost_usd;
              durationMs = event.duration_ms;
            }
          } catch {
            // ignore
          }
        }

        console.log(`\n[vteam] claude exited with code ${code}`);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
          resultText,
          costUsd,
          durationMs,
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
