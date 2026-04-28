import { resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import {
  listTaskFiles,
  createTaskFile,
  moveTask,
  updateTaskFrontmatter,
} from "./task-file.js";
import type { TaskManager, TaskIndex } from "./task-manager.js";
import type { TaskFile, TaskFrontmatter, TaskContentBody, TaskStatus } from "../types.js";

const STATUSES: TaskStatus[] = ["todo", "done"];

export class FilesystemTaskManager implements TaskManager {
  constructor(private readonly tasksDir: string) {}

  async list(status?: TaskStatus): Promise<TaskFile[]> {
    if (status) {
      return listTaskFiles(resolve(this.tasksDir, status));
    }
    const all: TaskFile[] = [];
    for (const s of STATUSES) {
      all.push(...listTaskFiles(resolve(this.tasksDir, s)));
    }
    return all;
  }

  async getIndex(): Promise<TaskIndex> {
    const all: TaskFile[] = [];
    const byStatus = new Map<TaskStatus, TaskFile[]>();

    for (const status of STATUSES) {
      const files = listTaskFiles(resolve(this.tasksDir, status));
      byStatus.set(status, files);
      all.push(...files);
    }

    const titles = all.map((t) => t.frontmatter.title);
    return { all, byStatus, titles };
  }

  async create(body: TaskContentBody, foundBy: string): Promise<string> {
    const todoDir = resolve(this.tasksDir, "todo");
    mkdirSync(todoDir, { recursive: true });
    return createTaskFile(todoDir, body, foundBy);
  }

  async move(
    id: string,
    newStatus: TaskStatus,
    metadata?: Partial<TaskFrontmatter>,
  ): Promise<void> {
    for (const s of STATUSES) {
      const dir = resolve(this.tasksDir, s);
      if (existsSync(resolve(dir, id))) {
        const toDir = resolve(this.tasksDir, newStatus);
        mkdirSync(toDir, { recursive: true });
        moveTask(dir, toDir, id, metadata);
        return;
      }
    }
    throw new Error(`Task not found: ${id}`);
  }

  async update(id: string, updates: Partial<TaskFrontmatter>): Promise<void> {
    for (const s of STATUSES) {
      const filePath = resolve(this.tasksDir, s, id);
      if (existsSync(filePath)) {
        updateTaskFrontmatter(filePath, updates);
        return;
      }
    }
    throw new Error(`Task not found: ${id}`);
  }
}
