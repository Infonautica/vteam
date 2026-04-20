import { resolve } from "node:path";
import { listTaskFiles } from "../tasks/task-file.js";
import type { TaskFile, TaskStatus } from "../types.js";

export interface TaskIndex {
  all: TaskFile[];
  byStatus: Map<TaskStatus, TaskFile[]>;
  titles: string[];
}

export function buildTaskIndex(tasksDir: string): TaskIndex {
  const statuses: TaskStatus[] = ["todo", "done"];
  const all: TaskFile[] = [];
  const byStatus = new Map<TaskStatus, TaskFile[]>();

  for (const status of statuses) {
    const dir = resolve(tasksDir, status);
    const files = listTaskFiles(dir);
    byStatus.set(status, files);
    all.push(...files);
  }

  const titles = all.map((t) => t.frontmatter.title);

  return { all, byStatus, titles };
}
