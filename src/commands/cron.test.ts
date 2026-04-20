import { describe, it, expect } from "vitest";
import { buildCronBlock, stripVteamBlock } from "./cron.js";
import { isValidCronExpression } from "../config/schema.js";
import type { AgentConfig } from "../types.js";

describe("buildCronBlock", () => {
  it("generates correct crontab block", () => {
    const agents: AgentConfig[] = [
      {
        name: "code-reviewer",
        agentMdPath: "/project/vteam/agents/code-reviewer/AGENT.md",
        cron: "0 */6 * * *",
      },
    ];
    const block = buildCronBlock(
      "/project",
      agents,
      "/usr/local/bin/node",
      "/project/dist/bin.js",
    );
    expect(block).toContain("# vteam-begin /project");
    expect(block).toContain("# vteam-end /project");
    expect(block).toContain("$(date -Iseconds) code-reviewer ---");
    expect(block).toContain(
      'cd "/project" && "/usr/local/bin/node" "/project/dist/bin.js" run code-reviewer',
    );
    expect(block).toContain(
      '>> "/project/vteam/.logs/code-reviewer.log" 2>&1',
    );
  });

  it("includes multiple agents", () => {
    const agents: AgentConfig[] = [
      { name: "a", agentMdPath: "", cron: "0 * * * *" },
      { name: "b", agentMdPath: "", cron: "30 2 * * 1" },
    ];
    const block = buildCronBlock("/p", agents, "/usr/local/bin/node", "/p/dist/bin.js");
    expect(block.match(/bin\.js" run/g)?.length).toBe(2);
  });

  it("skips agents without cron", () => {
    const agents: AgentConfig[] = [{ name: "a", agentMdPath: "" }];
    const block = buildCronBlock("/p", agents, "/usr/local/bin/node", "/p/dist/bin.js");
    expect(block).not.toContain("bin.js\" run");
  });
});

describe("stripVteamBlock", () => {
  it("removes vteam block for the given cwd", () => {
    const crontab = [
      "0 1 * * * /some/other/job",
      "# vteam-begin /project",
      "PATH=/usr/bin:/usr/local/bin",
      '0 */6 * * * cd "/project" && npx vteam run code-reviewer >> log 2>&1',
      "# vteam-end /project",
      "30 2 * * * /another/job",
    ].join("\n");

    const result = stripVteamBlock(crontab, "/project");
    expect(result).not.toContain("vteam-begin");
    expect(result).toContain("/some/other/job");
    expect(result).toContain("/another/job");
  });

  it("preserves vteam block for different project", () => {
    const crontab = [
      "# vteam-begin /other-project",
      "0 */6 * * * cd /other-project && npx vteam run foo >> log 2>&1",
      "# vteam-end /other-project",
    ].join("\n");

    const result = stripVteamBlock(crontab, "/project");
    expect(result).toContain("vteam-begin /other-project");
    expect(result).toContain("vteam run foo");
  });

  it("returns unchanged crontab when no block exists", () => {
    const crontab = "0 1 * * * /some/job";
    expect(stripVteamBlock(crontab, "/project")).toBe(crontab);
  });
});

describe("isValidCronExpression", () => {
  it.each([
    "* * * * *",
    "0 */6 * * *",
    "30 2 * * 1",
    "0 0 1 * *",
    "*/15 * * * *",
    "0 9-17 * * 1-5",
    "0 0 1,15 * *",
  ])("accepts valid expression: %s", (expr) => {
    expect(isValidCronExpression(expr)).toBe(true);
  });

  it.each(["", "* * *", "* * * * * *", "invalid", "a b c d e"])(
    "rejects invalid expression: %s",
    (expr) => {
      expect(isValidCronExpression(expr)).toBe(false);
    },
  );
});
