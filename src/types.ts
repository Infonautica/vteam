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
  "pr-url"?: string;
}

export interface TaskFile {
  id: string;
  filename: string;
  path: string;
  frontmatter: TaskFrontmatter;
  body: string;
}

export interface OnFinishConfig {
  onFinishMdPath: string;
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface MemoryConfig {
  memoryMdPath: string;
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface AgentConfig {
  name: string;
  agentMdPath: string;
  model?: string;
  cron?: string;
  scanPaths?: string[];
  excludePaths?: string[];
  worktree?: boolean;
  readOnly?: boolean;
  output?: "task";
  input?: "task" | "pr";
  prFilterLabels?: string[];
  prTriggerLabel?: string;
  autoPR?: boolean;
  prCreateLabels?: string[];
  allowedTools?: string[];
  disallowedTools?: string[];
  onFinish?: OnFinishConfig;
  memory?: MemoryConfig;
}

export interface RunOutcome {
  agent: string;
  status: "completed" | "failed";
  startedAt: string;
  completedAt: string;
  error?: string;
  task?: { title: string; severity: Severity; files: string[] };
  branch?: string;
  prUrl?: string;
  reviewedPR?: { number: number; title: string; url: string };
  tasksCreated?: string[];
  commitMessage?: CommitMessage;
  content?: AgentContent;
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

export interface FilesystemTaskManagerConfig {
  provider: "filesystem";
}

export type TaskManagerConfig = FilesystemTaskManagerConfig;

export interface VteamConfig {
  baseBranch: string;
  platform: Platform;
  worktreeDir: string;
  tasks: {
    maxRetries: number;
  };
  taskManager: TaskManagerConfig;
}

export interface CommitMessage {
  subject: string;
  body: string;
}

export interface TaskContentBody {
  title: string;
  severity: Severity;
  description: string;
  suggestedFix?: string;
  files: string[];
}

export interface TaskContent {
  type: "task";
  body: TaskContentBody;
}

export interface GenericContent {
  type: "generic";
  body: string;
}

export type AgentContent = TaskContent | GenericContent;

export interface AgentOutput {
  status: "completed" | "partial" | "blocked" | "failed";
  summary: string;
  content?: AgentContent;
  filesChanged?: string[];
  commitMessage?: CommitMessage;
  blockerReason?: string;
  memoryUpdate?: string;
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
  claudeOutput?: AgentOutput;
  tasksCreated?: string[];
  commitSha?: string;
  commitMessage?: CommitMessage;
}

