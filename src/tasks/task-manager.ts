import type { TaskFile, TaskFrontmatter, TaskContentBody, TaskStatus } from "../types.js";

export interface TaskIndex {
  all: TaskFile[];
  byStatus: Map<TaskStatus, TaskFile[]>;
  titles: string[];
}

export interface TaskManager {
  list(status?: TaskStatus): Promise<TaskFile[]>;
  getIndex(): Promise<TaskIndex>;
  create(body: TaskContentBody, foundBy: string): Promise<string>;
  move(id: string, newStatus: TaskStatus, metadata?: Partial<TaskFrontmatter>): Promise<void>;
  update(id: string, updates: Partial<TaskFrontmatter>): Promise<void>;
}
