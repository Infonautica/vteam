export type TaskStatus = "todo" | "done";

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
  prInput?: boolean;
  prLabels?: string[];
  prTriggerLabel?: string;
  autoMR?: boolean;
  mrLabels?: string[];
}

export interface ReviewComment {
  author: string;
  body: string;
  path?: string;
  line?: number;
  createdAt: string;
}

export interface ReviewablePR {
  number: number;
  title: string;
  branch: string;
  url: string;
}

export interface PRReviewContext {
  pr: ReviewablePR;
  comments: ReviewComment[];
  repoSlug: string;
}

export interface VteamConfig {
  baseBranch: string;
  platform: Platform;
  worktreeDir: string;
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

