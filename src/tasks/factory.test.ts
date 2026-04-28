import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createTaskManager } from "./factory.js";
import { FilesystemTaskManager } from "./filesystem-manager.js";

describe("createTaskManager", () => {
  it("returns FilesystemTaskManager for filesystem provider", () => {
    const tmp = mkdtempSync(join(tmpdir(), "vteam-factory-test-"));
    mkdirSync(resolve(tmp, "vteam", "tasks", "todo"), { recursive: true });
    mkdirSync(resolve(tmp, "vteam", "tasks", "done"), { recursive: true });

    const manager = createTaskManager({ provider: "filesystem" }, tmp);
    expect(manager).toBeInstanceOf(FilesystemTaskManager);

    rmSync(tmp, { recursive: true, force: true });
  });
});
