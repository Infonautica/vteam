export type TaskStatus = "backlog" | "todo" | "done";

export type Severity = "critical" | "high" | "medium" | "low";

export type Platform = "github" | "gitlab";

export interface TaskFrontmatter {
  title: string;
  created: string;
  status: TaskStatus;
  severity: Severity;
  "found-by": string;
  files: string[];
  "retry-count"?: number;
  completed?: string;
  branch?: string;
  "mr-url"?: string;
}

export interface TaskFile {
  filename: string;
  path: string;
  frontmatter: TaskFrontmatter;
  body: string;
}

export interface AgentConfig {
  name: string;
  agentMdPath: string;
  model?: string;
  scanPaths?: string[];
  excludePaths?: string[];
  worktree?: boolean;
  taskInput?: boolean;
  autoMR?: boolean;
  mrLabels?: string[];
}

export interface VteamConfig {
  baseBranch: string;
  platform: Platform;
  worktreeDir: string;
  agents: Record<string, Omit<AgentConfig, "name" | "agentMdPath">>;
  tasks: {
    maxRetries: number;
  };
}

export interface ReviewerFinding {
  title: string;
  severity: Severity;
  description: string;
  suggestedFix?: string;
  files: string[];
}

export interface ReviewerOutput {
  findings: ReviewerFinding[];
  summary: string;
  areasScanned: string[];
}

export interface RefactorerOutput {
  status: "completed" | "partial" | "blocked" | "failed";
  summary: string;
  filesChanged: string[];
  blockerReason?: string;
}

export interface RunState {
  runId: string;
  agent: string;
  status:
    | "started"
    | "claude_running"
    | "processing"
    | "completed"
    | "failed";
  startedAt: string;
  completedAt?: string;
  worktreePath?: string;
  branchName?: string;
  taskFile?: string;
  error?: string;
}

export interface OverviewEntry {
  status: TaskStatus;
  date: string;
  severity: Severity;
  title: string;
  files: string;
  taskPath: string;
  branch?: string;
  mrUrl?: string;
}
