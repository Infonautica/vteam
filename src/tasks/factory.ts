import { resolve } from "node:path";
import { FilesystemTaskManager } from "./filesystem-manager.js";
import type { TaskManager } from "./task-manager.js";
import type { TaskManagerConfig } from "../types.js";

export function createTaskManager(
  config: TaskManagerConfig,
  cwd: string,
): TaskManager {
  switch (config.provider) {
    case "filesystem":
      return new FilesystemTaskManager(resolve(cwd, "vteam", "tasks"));
  }
}
