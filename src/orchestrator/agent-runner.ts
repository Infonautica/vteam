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

interface StreamEvent {
  type: string;
  subtype?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  content?: string;
  message?: string;
  session_id?: string;
}

function formatEvent(event: StreamEvent): string | null {
  switch (event.type) {
    case "assistant": {
      if (event.subtype === "tool_use" && event.tool_name) {
        const input = event.tool_input ?? {};
        const detail = input.command ?? input.pattern ?? input.file_path ?? input.description ?? "";
        return `  [tool] ${event.tool_name}${detail ? `: ${String(detail).slice(0, 120)}` : ""}`;
      }
      if (event.subtype === "text" && event.content) {
        return `  [text] ${event.content.slice(0, 200)}`;
      }
      return null;
    }
    case "result":
      return null;
    default:
      return null;
  }
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
      let lineBuffer = "";

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
            console.log(JSON.stringify(event, null, 2));
          } catch {
            // Not JSON — print raw
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
        if (lineBuffer.trim()) {
          try {
            const event: StreamEvent = JSON.parse(lineBuffer.trim());
            const formatted = formatEvent(event);
            if (formatted) console.log(formatted);
          } catch {
            // ignore
          }
        }
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
