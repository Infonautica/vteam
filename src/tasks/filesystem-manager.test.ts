import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "../frontmatter.js";
import { FilesystemTaskManager } from "./filesystem-manager.js";
import type { TaskContentBody } from "../types.js";

let tmp: string;
let manager: FilesystemTaskManager;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vteam-fm-test-"));
  for (const sub of ["todo", "done"]) {
    mkdirSync(resolve(tmp, sub), { recursive: true });
  }
  manager = new FilesystemTaskManager(tmp);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeTask(
  status: string,
  filename: string,
  title: string,
  severity: string,
  extra: Record<string, unknown> = {},
): void {
  const dir = resolve(tmp, status);
  const content = stringify("body", {
    title,
    created: "2026-04-19T10:00:00Z",
    status,
    severity,
    "found-by": "test",
    files: ["src/foo.ts"],
    ...extra,
  });
  writeFileSync(resolve(dir, filename), content, "utf-8");
}

describe("list", () => {
  it("returns all tasks when no status filter", async () => {
    writeTask("todo", "a.md", "Task A", "high");
    writeTask("done", "b.md", "Task B", "low");

    const all = await manager.list();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.frontmatter.title).sort()).toEqual(["Task A", "Task B"]);
  });

  it("filters by status", async () => {
    writeTask("todo", "a.md", "Task A", "high");
    writeTask("todo", "b.md", "Task B", "medium");
    writeTask("done", "c.md", "Task C", "low");

    const todo = await manager.list("todo");
    expect(todo).toHaveLength(2);
    expect(todo.every((t) => t.frontmatter.status === "todo")).toBe(true);

    const done = await manager.list("done");
    expect(done).toHaveLength(1);
    expect(done[0].frontmatter.title).toBe("Task C");
  });

  it("returns empty array when no tasks exist", async () => {
    expect(await manager.list()).toEqual([]);
    expect(await manager.list("todo")).toEqual([]);
  });

  it("returns empty array when status directory does not exist", async () => {
    rmSync(resolve(tmp, "todo"), { recursive: true });
    rmSync(resolve(tmp, "done"), { recursive: true });

    expect(await manager.list()).toEqual([]);
    expect(await manager.list("todo")).toEqual([]);
  });

  it("sets id equal to filename on returned tasks", async () => {
    writeTask("todo", "my-task.md", "My Task", "high");

    const tasks = await manager.list("todo");
    expect(tasks[0].id).toBe("my-task.md");
    expect(tasks[0].filename).toBe("my-task.md");
  });
});

describe("getIndex", () => {
  it("returns empty index for empty directories", async () => {
    const index = await manager.getIndex();
    expect(index.all).toHaveLength(0);
    expect(index.titles).toHaveLength(0);
    expect(index.byStatus.get("todo")).toEqual([]);
    expect(index.byStatus.get("done")).toEqual([]);
  });

  it("groups tasks by status", async () => {
    writeTask("todo", "a.md", "Alpha", "high");
    writeTask("todo", "b.md", "Beta", "medium");
    writeTask("done", "c.md", "Gamma", "low");

    const index = await manager.getIndex();
    expect(index.all).toHaveLength(3);
    expect(index.byStatus.get("todo")).toHaveLength(2);
    expect(index.byStatus.get("done")).toHaveLength(1);
  });

  it("collects all titles", async () => {
    writeTask("todo", "a.md", "Alpha", "high");
    writeTask("done", "b.md", "Beta", "low");

    const index = await manager.getIndex();
    expect(index.titles.sort()).toEqual(["Alpha", "Beta"]);
  });
});

describe("create", () => {
  it("creates a task file in the todo directory", async () => {
    const finding: TaskContentBody = {
      title: "Null pointer",
      severity: "high",
      description: "NPE in auth module",
      files: ["src/auth.ts:10"],
    };

    const id = await manager.create(finding, "code-reviewer");
    expect(id).toMatch(/\.md$/);

    const filePath = resolve(tmp, "todo", id);
    expect(existsSync(filePath)).toBe(true);

    const { data } = parse(readFileSync(filePath, "utf-8"));
    expect(data.title).toBe("Null pointer");
    expect(data.severity).toBe("high");
    expect(data["found-by"]).toBe("code-reviewer");
  });

  it("creates todo directory if it does not exist", async () => {
    rmSync(resolve(tmp, "todo"), { recursive: true });

    const finding: TaskContentBody = {
      title: "New task",
      severity: "low",
      description: "Something",
      files: ["src/foo.ts"],
    };

    const id = await manager.create(finding, "test-agent");
    expect(existsSync(resolve(tmp, "todo", id))).toBe(true);
  });

  it("returns id that can be used with other methods", async () => {
    const finding: TaskContentBody = {
      title: "Trackable task",
      severity: "medium",
      description: "Can be moved and updated",
      files: ["src/bar.ts"],
    };

    const id = await manager.create(finding, "test-agent");
    const tasks = await manager.list("todo");
    expect(tasks.some((t) => t.id === id)).toBe(true);
  });
});

describe("move", () => {
  it("moves a task from todo to done", async () => {
    writeTask("todo", "task.md", "Fix it", "medium");

    await manager.move("task.md", "done");

    expect(existsSync(resolve(tmp, "todo", "task.md"))).toBe(false);
    expect(existsSync(resolve(tmp, "done", "task.md"))).toBe(true);
  });

  it("merges metadata when moving", async () => {
    writeTask("todo", "task.md", "Fix it", "medium");

    await manager.move("task.md", "done", {
      status: "done",
      completed: "2026-04-28T12:00:00Z",
      branch: "vteam/fix-it",
    });

    const { data } = parse(readFileSync(resolve(tmp, "done", "task.md"), "utf-8"));
    expect(data.status).toBe("done");
    expect(data.completed).toBe("2026-04-28T12:00:00Z");
    expect(data.branch).toBe("vteam/fix-it");
  });

  it("creates target directory if it does not exist", async () => {
    rmSync(resolve(tmp, "done"), { recursive: true });
    writeTask("todo", "task.md", "Fix it", "medium");

    await manager.move("task.md", "done");
    expect(existsSync(resolve(tmp, "done", "task.md"))).toBe(true);
  });

  it("throws when task id is not found", async () => {
    await expect(manager.move("nonexistent.md", "done")).rejects.toThrow(
      "Task not found: nonexistent.md",
    );
  });

  it("finds task in done directory when moving back to todo", async () => {
    writeTask("done", "task.md", "Reopen it", "high");

    await manager.move("task.md", "todo", { status: "todo" });

    expect(existsSync(resolve(tmp, "done", "task.md"))).toBe(false);
    expect(existsSync(resolve(tmp, "todo", "task.md"))).toBe(true);
    const { data } = parse(readFileSync(resolve(tmp, "todo", "task.md"), "utf-8"));
    expect(data.status).toBe("todo");
  });
});

describe("update", () => {
  it("updates frontmatter of a task in todo", async () => {
    writeTask("todo", "task.md", "Fix it", "medium", { "retry-count": 0 });

    await manager.update("task.md", { "retry-count": 1 });

    const { data } = parse(readFileSync(resolve(tmp, "todo", "task.md"), "utf-8"));
    expect(data["retry-count"]).toBe(1);
    expect(data.title).toBe("Fix it");
  });

  it("updates frontmatter of a task in done", async () => {
    writeTask("done", "task.md", "Old task", "low");

    await manager.update("task.md", { "pr-url": "https://github.com/org/repo/pull/1" });

    const { data } = parse(readFileSync(resolve(tmp, "done", "task.md"), "utf-8"));
    expect(data["pr-url"]).toBe("https://github.com/org/repo/pull/1");
  });

  it("throws when task id is not found", async () => {
    await expect(manager.update("ghost.md", { "retry-count": 5 })).rejects.toThrow(
      "Task not found: ghost.md",
    );
  });
});
