import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import {
  readOverview,
  parseOverviewEntries,
  formatOverviewEntry,
  appendToOverview,
  updateOverviewEntryStatus,
} from "./overview.js";
import type { OverviewEntry } from "../types.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vteam-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const sampleEntry: OverviewEntry = {
  status: "backlog",
  date: "2026-04-19",
  severity: "high",
  title: "Null check missing",
  files: "src/auth.ts:45",
  taskPath: "backlog/task.md",
};

describe("readOverview", () => {
  it("returns header when file does not exist", () => {
    const content = readOverview(resolve(tmp, "nonexistent.md"));
    expect(content).toContain("# Virtual Team");
    expect(content).toContain("## Tasks");
  });

  it("returns file content when file exists", () => {
    const path = resolve(tmp, "overview.md");
    writeFileSync(path, "custom content", "utf-8");
    expect(readOverview(path)).toBe("custom content");
  });
});

describe("parseOverviewEntries", () => {
  it("parses a well-formed overview line", () => {
    const line = `- **[backlog]** 2026-04-19 | high | Null check missing | \`src/auth.ts:45\` | [→ backlog/task.md](backlog/task.md)`;
    const entries = parseOverviewEntries(line);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("backlog");
    expect(entries[0].severity).toBe("high");
    expect(entries[0].title).toBe("Null check missing");
    expect(entries[0].files).toBe("src/auth.ts:45");
    expect(entries[0].taskPath).toBe("backlog/task.md");
  });

  it("parses branch and MR fields from done entries", () => {
    const line = `- **[done]** 2026-04-19 | medium | Fix bug | \`src/foo.ts\` | branch: \`vteam/fix-bug\` | MR: \`#42\` | [→ done/task.md](done/task.md)`;
    const entries = parseOverviewEntries(line);
    expect(entries[0].branch).toBe("vteam/fix-bug");
    expect(entries[0].mrUrl).toBe("#42");
  });

  it("returns empty array for non-entry lines", () => {
    const content = "# Header\n\nSome text\n";
    expect(parseOverviewEntries(content)).toEqual([]);
  });

  it("parses multiple entries", () => {
    const content = [
      `- **[backlog]** 2026-04-19 | high | Bug A | \`a.ts\` | [→ backlog/a.md](backlog/a.md)`,
      `- **[todo]** 2026-04-19 | low | Bug B | \`b.ts\` | [→ todo/b.md](todo/b.md)`,
    ].join("\n");
    const entries = parseOverviewEntries(content);
    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe("Bug A");
    expect(entries[1].title).toBe("Bug B");
  });
});

describe("formatOverviewEntry", () => {
  it("formats a basic entry", () => {
    const line = formatOverviewEntry(sampleEntry);
    expect(line).toBe(
      `- **[backlog]** 2026-04-19 | high | Null check missing | \`src/auth.ts:45\` | [→ backlog/task.md](backlog/task.md)`,
    );
  });

  it("includes branch and MR when present", () => {
    const entry: OverviewEntry = {
      ...sampleEntry,
      status: "done",
      branch: "vteam/fix-null",
      mrUrl: "https://github.com/org/repo/pull/1",
    };
    const line = formatOverviewEntry(entry);
    expect(line).toContain("branch: `vteam/fix-null`");
    expect(line).toContain("MR: https://github.com/org/repo/pull/1");
  });

  it("round-trips through parse", () => {
    const line = formatOverviewEntry(sampleEntry);
    const parsed = parseOverviewEntries(line);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe(sampleEntry.title);
    expect(parsed[0].severity).toBe(sampleEntry.severity);
  });
});

describe("appendToOverview", () => {
  it("creates file with header when it does not exist", () => {
    const path = resolve(tmp, "overview.md");
    appendToOverview(path, [sampleEntry]);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("# Virtual Team");
    expect(content).toContain("Null check missing");
  });

  it("appends to existing content", () => {
    const path = resolve(tmp, "overview.md");
    writeFileSync(path, "# Virtual Team — Task Overview\n\n## Tasks\n", "utf-8");
    appendToOverview(path, [sampleEntry]);
    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(1);
  });

  it("appends multiple entries", () => {
    const path = resolve(tmp, "overview.md");
    writeFileSync(path, "# Header\n", "utf-8");
    const second: OverviewEntry = { ...sampleEntry, title: "Second bug" };
    appendToOverview(path, [sampleEntry, second]);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("Null check missing");
    expect(content).toContain("Second bug");
  });
});

describe("updateOverviewEntryStatus", () => {
  it("changes status of a matching entry", () => {
    const path = resolve(tmp, "overview.md");
    const content = [
      "# Header",
      "",
      `- **[todo]** 2026-04-19 | high | Null check missing | \`src/auth.ts:45\` | [→ todo/task.md](todo/task.md)`,
      "",
    ].join("\n");
    writeFileSync(path, content, "utf-8");

    updateOverviewEntryStatus(path, "Null check missing", "done", {
      branch: "vteam/fix-null",
    });

    const updated = readFileSync(path, "utf-8");
    expect(updated).toContain("**[done]**");
    expect(updated).toContain("branch: `vteam/fix-null`");
    expect(updated).not.toContain("**[todo]**");
  });

  it("adds MR url when provided", () => {
    const path = resolve(tmp, "overview.md");
    const content = `- **[todo]** 2026-04-19 | high | Fix bug | \`src/foo.ts\` | [→ todo/task.md](todo/task.md)\n`;
    writeFileSync(path, content, "utf-8");

    updateOverviewEntryStatus(path, "Fix bug", "done", {
      branch: "vteam/fix",
      mrUrl: "https://github.com/org/repo/pull/5",
    });

    const updated = readFileSync(path, "utf-8");
    expect(updated).toContain("MR: https://github.com/org/repo/pull/5");
  });

  it("does not modify non-matching entries", () => {
    const path = resolve(tmp, "overview.md");
    const content = [
      `- **[backlog]** 2026-04-19 | high | Bug A | \`a.ts\` | [→ backlog/a.md](backlog/a.md)`,
      `- **[todo]** 2026-04-19 | low | Bug B | \`b.ts\` | [→ todo/b.md](todo/b.md)`,
    ].join("\n");
    writeFileSync(path, content, "utf-8");

    updateOverviewEntryStatus(path, "Bug B", "done");

    const updated = readFileSync(path, "utf-8");
    expect(updated).toContain("**[backlog]**");
    expect(updated).toContain("**[done]**");
    expect(updated).not.toContain("**[todo]**");
  });

  it("handles missing optional fields gracefully", () => {
    const path = resolve(tmp, "overview.md");
    const content = `- **[todo]** 2026-04-19 | high | Fix bug | \`src/foo.ts\` | [→ todo/task.md](todo/task.md)\n`;
    writeFileSync(path, content, "utf-8");

    updateOverviewEntryStatus(path, "Fix bug", "done");

    const updated = readFileSync(path, "utf-8");
    expect(updated).toContain("**[done]**");
    expect(updated).not.toContain("branch:");
    expect(updated).not.toContain("MR:");
  });
});
