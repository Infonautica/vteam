import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import matter from "gray-matter";
import { buildTaskIndex } from "./task-index.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vteam-idx-test-"));
  for (const sub of ["backlog", "todo", "done"]) {
    mkdirSync(resolve(tmp, sub), { recursive: true });
  }
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeTask(status: string, filename: string, title: string, severity: string): void {
  const dir = resolve(tmp, status);
  const content = matter.stringify("body", {
    title,
    created: "2026-04-19T10:00:00Z",
    status,
    severity,
    "found-by": "test",
    files: ["src/foo.ts"],
  });
  writeFileSync(resolve(dir, filename), content, "utf-8");
}

describe("buildTaskIndex", () => {
  it("returns empty index for empty dirs", () => {
    const index = buildTaskIndex(tmp);
    expect(index.all).toHaveLength(0);
    expect(index.titles).toHaveLength(0);
    expect(index.byStatus.get("backlog")).toEqual([]);
    expect(index.byStatus.get("todo")).toEqual([]);
    expect(index.byStatus.get("done")).toEqual([]);
  });

  it("indexes tasks by status", () => {
    writeTask("backlog", "a.md", "Bug A", "high");
    writeTask("backlog", "b.md", "Bug B", "low");
    writeTask("todo", "c.md", "Bug C", "medium");
    writeTask("done", "d.md", "Bug D", "critical");

    const index = buildTaskIndex(tmp);
    expect(index.all).toHaveLength(4);
    expect(index.byStatus.get("backlog")).toHaveLength(2);
    expect(index.byStatus.get("todo")).toHaveLength(1);
    expect(index.byStatus.get("done")).toHaveLength(1);
  });

  it("collects all titles", () => {
    writeTask("backlog", "a.md", "Alpha", "high");
    writeTask("todo", "b.md", "Beta", "low");

    const index = buildTaskIndex(tmp);
    expect(index.titles.sort()).toEqual(["Alpha", "Beta"]);
  });
});
