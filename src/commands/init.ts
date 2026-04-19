import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function templateDir(): string {
  // Works both in src/ (dev via tsx) and dist/ (production)
  // src/commands/init.ts → src/templates/
  // dist/commands/init.js → dist/templates/
  return resolve(__dirname, "..", "templates");
}

function copyTemplate(templateName: string, destPath: string): void {
  const src = resolve(templateDir(), templateName);
  const content = readFileSync(src, "utf-8");
  writeFileSync(destPath, content, "utf-8");
}

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();
  const vteamDir = resolve(cwd, "vteam");

  if (existsSync(vteamDir)) {
    console.error("vteam/ directory already exists. Aborting.");
    process.exit(1);
  }

  console.log("Scaffolding vteam/ directory...");

  const dirs = [
    resolve(vteamDir, "agents", "code-reviewer"),
    resolve(vteamDir, "agents", "refactorer"),
    resolve(vteamDir, "agents", "review-responder"),
    resolve(vteamDir, "tasks", "backlog"),
    resolve(vteamDir, "tasks", "todo"),
    resolve(vteamDir, "tasks", "done"),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }

  copyTemplate("code-reviewer.agent.md", resolve(vteamDir, "agents", "code-reviewer", "AGENT.md"));
  copyTemplate("refactorer.agent.md", resolve(vteamDir, "agents", "refactorer", "AGENT.md"));
  copyTemplate("review-responder.agent.md", resolve(vteamDir, "agents", "review-responder", "AGENT.md"));
  copyTemplate("vteam.config.json", resolve(vteamDir, "vteam.config.json"));

  const gitignorePath = resolve(cwd, ".gitignore");
  const worktreeEntry = ".vteam-worktrees/";
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (!content.includes(worktreeEntry)) {
      appendFileSync(gitignorePath, `\n${worktreeEntry}\n`);
      console.log("  Updated .gitignore with .vteam-worktrees/");
    }
  } else {
    writeFileSync(gitignorePath, `${worktreeEntry}\n`);
    console.log("  Created .gitignore with .vteam-worktrees/");
  }

  // Create .gitkeep files so empty directories are tracked
  for (const sub of ["backlog", "todo", "done"]) {
    writeFileSync(resolve(vteamDir, "tasks", sub, ".gitkeep"), "");
  }

  console.log("  Created vteam/agents/code-reviewer/AGENT.md");
  console.log("  Created vteam/agents/refactorer/AGENT.md");
  console.log("  Created vteam/agents/review-responder/AGENT.md");
  console.log("  Created vteam/vteam.config.json");
  console.log("\nDone. Edit the AGENT.md files and vteam.config.json to customize.");
}
