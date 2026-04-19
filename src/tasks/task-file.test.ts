import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import matter from "gray-matter";
import {
  parseTaskFile,
  listTaskFiles,
  generateTaskFilename,
  createTaskFile,
  moveTask,
  updateTaskFrontmatter,
  isDuplicateTitle,
  severityPriority,
} from "./task-file.js";
import type { TaskFile, ReviewerFinding } from "../types.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vteam-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeTask(dir: string, filename: string, frontmatter: Record<string, unknown>, body: string): string {
  mkdirSync(dir, { recursive: true });
  const filePath = resolve(dir, filename);
  writeFileSync(filePath, matter.stringify(body, frontmatter), "utf-8");
  return filePath;
}

describe("parseTaskFile", () => {
  it("parses frontmatter and body from a task file", () => {
    const filePath = writeTask(tmp, "task.md", {
      title: "Fix the bug",
      created: "2026-04-19T10:00:00Z",
      status: "backlog",
      severity: "high",
      "found-by": "code-reviewer",
      files: ["src/foo.ts:10"],
    }, "## Description\n\nSome bug description.");

    const task = parseTaskFile(filePath);
    expect(task.filename).toBe("task.md");
    expect(task.frontmatter.title).toBe("Fix the bug");
    expect(task.frontmatter.severity).toBe("high");
    expect(task.frontmatter.files).toEqual(["src/foo.ts:10"]);
    expect(task.body).toContain("Some bug description");
  });
});

describe("listTaskFiles", () => {
  it("returns empty array for non-existent directory", () => {
    expect(listTaskFiles(resolve(tmp, "nope"))).toEqual([]);
  });

  it("lists only .md files, ignoring .gitkeep", () => {
    mkdirSync(resolve(tmp, "tasks"));
    writeTask(resolve(tmp, "tasks"), "a.md", { title: "A", status: "backlog", severity: "low", created: "", "found-by": "", files: [] }, "body a");
    writeTask(resolve(tmp, "tasks"), "b.md", { title: "B", status: "backlog", severity: "high", created: "", "found-by": "", files: [] }, "body b");
    writeFileSync(resolve(tmp, "tasks", ".gitkeep"), "");

    const files = listTaskFiles(resolve(tmp, "tasks"));
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.frontmatter.title).sort()).toEqual(["A", "B"]);
  });
});

describe("generateTaskFilename", () => {
  it("produces YYYY-MM-DD-HH-mm-ss format with slug and jitter", () => {
    const name = generateTaskFilename("Fix Auth Bug");
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-fix-auth-bug-[a-z0-9]{4}\.md$/);
  });

  it("generates unique filenames on consecutive calls", () => {
    const a = generateTaskFilename("Same Title");
    const b = generateTaskFilename("Same Title");
    expect(a).not.toBe(b);
  });
});

describe("createTaskFile", () => {
  it("creates a markdown file with correct frontmatter and body", () => {
    mkdirSync(resolve(tmp, "backlog"), { recursive: true });
    const finding: ReviewerFinding = {
      title: "Missing null check",
      severity: "high",
      description: "Token can be null.",
      suggestedFix: "Add a guard clause.",
      files: ["src/auth.ts:45"],
    };

    const filename = createTaskFile(resolve(tmp, "backlog"), finding, "code-reviewer");
    const filePath = resolve(tmp, "backlog", filename);
    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);
    expect(data.title).toBe("Missing null check");
    expect(data.severity).toBe("high");
    expect(data["found-by"]).toBe("code-reviewer");
    expect(content).toContain("Token can be null.");
    expect(content).toContain("Add a guard clause.");
  });

  it("omits suggested fix section when not provided", () => {
    mkdirSync(resolve(tmp, "backlog"), { recursive: true });
    const finding: ReviewerFinding = {
      title: "Dead code",
      severity: "low",
      description: "Unused function.",
      files: ["src/utils.ts:10"],
    };

    const filename = createTaskFile(resolve(tmp, "backlog"), finding, "code-reviewer");
    const raw = readFileSync(resolve(tmp, "backlog", filename), "utf-8");
    expect(raw).not.toContain("Suggested Fix");
  });
});

describe("moveTask", () => {
  it("moves a task file between directories", () => {
    const from = resolve(tmp, "todo");
    const to = resolve(tmp, "done");
    mkdirSync(from, { recursive: true });
    mkdirSync(to, { recursive: true });

    writeTask(from, "task.md", {
      title: "Fix it",
      status: "todo",
      severity: "medium",
      created: "",
      "found-by": "",
      files: [],
    }, "body");

    moveTask(from, to, "task.md");
    expect(existsSync(resolve(from, "task.md"))).toBe(false);
    expect(existsSync(resolve(to, "task.md"))).toBe(true);
  });

  it("merges extra frontmatter when moving", () => {
    const from = resolve(tmp, "todo");
    const to = resolve(tmp, "done");
    mkdirSync(from, { recursive: true });
    mkdirSync(to, { recursive: true });

    writeTask(from, "task.md", {
      title: "Fix it",
      status: "todo",
      severity: "medium",
      created: "",
      "found-by": "",
      files: [],
    }, "body");

    moveTask(from, to, "task.md", {
      status: "done",
      completed: "2026-04-19T12:00:00Z",
      branch: "vteam/fix-it",
    });

    const raw = readFileSync(resolve(to, "task.md"), "utf-8");
    const { data } = matter(raw);
    expect(data.status).toBe("done");
    expect(data.completed).toBe("2026-04-19T12:00:00Z");
    expect(data.branch).toBe("vteam/fix-it");
    expect(existsSync(resolve(from, "task.md"))).toBe(false);
  });

  it("does not include undefined values in frontmatter", () => {
    const from = resolve(tmp, "todo");
    const to = resolve(tmp, "done");
    mkdirSync(from, { recursive: true });
    mkdirSync(to, { recursive: true });

    writeTask(from, "task.md", {
      title: "Fix it",
      status: "todo",
      severity: "medium",
      created: "",
      "found-by": "",
      files: [],
    }, "body");

    moveTask(from, to, "task.md", {
      status: "done",
      branch: "vteam/fix-it",
    });

    const raw = readFileSync(resolve(to, "task.md"), "utf-8");
    expect(raw).not.toContain("undefined");
  });
});

describe("updateTaskFrontmatter", () => {
  it("updates specific frontmatter fields in place", () => {
    const filePath = writeTask(tmp, "task.md", {
      title: "Fix it",
      status: "todo",
      severity: "medium",
      created: "",
      "found-by": "",
      files: [],
      "retry-count": 0,
    }, "body");

    updateTaskFrontmatter(filePath, { "retry-count": 1 });

    const { data } = matter(readFileSync(filePath, "utf-8"));
    expect(data["retry-count"]).toBe(1);
    expect(data.title).toBe("Fix it");
  });
});

describe("isDuplicateTitle", () => {
  const existing: TaskFile[] = [
    {
      filename: "a.md",
      path: "/a.md",
      frontmatter: {
        title: "Missing null check in auth",
        created: "",
        status: "backlog",
        severity: "high",
        "found-by": "code-reviewer",
        files: [],
      },
      body: "",
    },
  ];

  it("detects exact duplicate", () => {
    expect(isDuplicateTitle("Missing null check in auth", existing)).toBe(true);
  });

  it("detects case-insensitive duplicate", () => {
    expect(isDuplicateTitle("MISSING NULL CHECK IN AUTH", existing)).toBe(true);
  });

  it("normalizes punctuation differences", () => {
    expect(isDuplicateTitle("Missing null-check in auth", existing)).toBe(true);
  });

  it("returns false for different title", () => {
    expect(isDuplicateTitle("Unused imports in service", existing)).toBe(false);
  });
});

describe("severityPriority", () => {
  it("orders critical < high < medium < low", () => {
    expect(severityPriority("critical")).toBeLessThan(severityPriority("high"));
    expect(severityPriority("high")).toBeLessThan(severityPriority("medium"));
    expect(severityPriority("medium")).toBeLessThan(severityPriority("low"));
  });
});
