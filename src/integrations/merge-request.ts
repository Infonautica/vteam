import { execSync } from "node:child_process";
import type { Platform } from "../types.js";

interface MROptions {
  platform: Platform;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  labels?: string[];
  cwd: string;
}

export function createMergeRequest(options: MROptions): string {
  if (options.platform === "github") {
    return createGitHubPR(options);
  }
  return createGitLabMR(options);
}

function createGitHubPR(options: MROptions): string {
  const args = [
    "pr",
    "create",
    "--head",
    options.branch,
    "--base",
    options.baseBranch,
    "--title",
    options.title,
    "--body",
    options.body,
  ];

  if (options.labels?.length) {
    args.push("--label", options.labels.join(","));
  }

  const result = execSync(`gh ${args.map(shellEscape).join(" ")}`, {
    cwd: options.cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  return result.trim();
}

function createGitLabMR(options: MROptions): string {
  const args = [
    "mr",
    "create",
    "--source-branch",
    options.branch,
    "--target-branch",
    options.baseBranch,
    "--title",
    options.title,
    "--description",
    options.body,
    "--no-editor",
  ];

  if (options.labels?.length) {
    for (const label of options.labels) {
      args.push("--label", label);
    }
  }

  const result = execSync(`glab ${args.map(shellEscape).join(" ")}`, {
    cwd: options.cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  const urlMatch = result.match(/https?:\/\/\S+/);
  return urlMatch?.[0] ?? result.trim();
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
