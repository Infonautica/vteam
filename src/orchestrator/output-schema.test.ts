import { describe, it, expect } from "vitest";
import { parseAgentOutput } from "./output-schema.js";

describe("parseAgentOutput", () => {
  describe("valid shapes", () => {
    it("parses minimal output (status + summary only)", () => {
      const output = parseAgentOutput(
        JSON.stringify({ status: "completed", summary: "No issues found." }),
      );
      expect(output.status).toBe("completed");
      expect(output.summary).toBe("No issues found.");
      expect(output.content).toBeUndefined();
      expect(output.filesChanged).toBeUndefined();
      expect(output.commitMessage).toBeUndefined();
      expect(output.memoryUpdate).toBeUndefined();
      expect(output.blockerReason).toBeUndefined();
    });

    it("parses generic content", () => {
      const output = parseAgentOutput(
        JSON.stringify({
          status: "completed",
          summary: "Review complete.",
          content: { type: "generic", body: "Looks good overall." },
        }),
      );
      expect(output.content).toEqual({
        type: "generic",
        body: "Looks good overall.",
      });
    });

    it("parses task content with all fields", () => {
      const output = parseAgentOutput(
        JSON.stringify({
          status: "completed",
          summary: "Found issue.",
          content: {
            type: "task",
            body: {
              title: "Missing null check",
              severity: "high",
              description: "Potential NPE in auth module",
              suggestedFix: "Add null check before accessing user.email",
              files: ["src/auth.ts:45"],
            },
          },
        }),
      );
      expect(output.content?.type).toBe("task");
      const body =
        output.content?.type === "task" ? output.content.body : null;
      expect(body?.title).toBe("Missing null check");
      expect(body?.severity).toBe("high");
      expect(body?.suggestedFix).toBe(
        "Add null check before accessing user.email",
      );
      expect(body?.files).toEqual(["src/auth.ts:45"]);
    });

    it("parses task content without optional suggestedFix", () => {
      const output = parseAgentOutput(
        JSON.stringify({
          status: "completed",
          summary: "Found issue.",
          content: {
            type: "task",
            body: {
              title: "Unused import",
              severity: "low",
              description: "Dead import in utils",
              files: ["src/utils.ts:1"],
            },
          },
        }),
      );
      const body =
        output.content?.type === "task" ? output.content.body : null;
      expect(body?.suggestedFix).toBeUndefined();
    });

    it("parses output with filesChanged and commitMessage", () => {
      const output = parseAgentOutput(
        JSON.stringify({
          status: "completed",
          summary: "Applied fix.",
          filesChanged: ["src/auth.ts", "src/utils.ts"],
          commitMessage: {
            subject: "vteam: fix null check in auth",
            body: "Adds null check to prevent NPE.",
          },
        }),
      );
      expect(output.filesChanged).toEqual(["src/auth.ts", "src/utils.ts"]);
      expect(output.commitMessage).toEqual({
        subject: "vteam: fix null check in auth",
        body: "Adds null check to prevent NPE.",
      });
    });

    it("parses output with memoryUpdate", () => {
      const output = parseAgentOutput(
        JSON.stringify({
          status: "completed",
          summary: "Scanned auth module.",
          memoryUpdate:
            "Scanned src/auth.ts — found 2 issues. Config uses singleton.",
        }),
      );
      expect(output.memoryUpdate).toBe(
        "Scanned src/auth.ts — found 2 issues. Config uses singleton.",
      );
    });

    it("parses blocked status with blockerReason", () => {
      const output = parseAgentOutput(
        JSON.stringify({
          status: "blocked",
          summary: "Cannot proceed.",
          blockerReason: "Tests are failing before any changes.",
        }),
      );
      expect(output.status).toBe("blocked");
      expect(output.blockerReason).toBe(
        "Tests are failing before any changes.",
      );
    });

    it("parses failed status", () => {
      const output = parseAgentOutput(
        JSON.stringify({
          status: "failed",
          summary: "Could not complete the task.",
          blockerReason: "File not found.",
        }),
      );
      expect(output.status).toBe("failed");
      expect(output.blockerReason).toBe("File not found.");
    });

    it("parses partial status with all optional fields", () => {
      const output = parseAgentOutput(
        JSON.stringify({
          status: "partial",
          summary: "Fixed 2 of 3 issues.",
          content: { type: "generic", body: "Partial results." },
          filesChanged: ["src/auth.ts"],
          commitMessage: {
            subject: "vteam: partial fix",
            body: "Fixed 2 of 3.",
          },
          memoryUpdate: "Partially fixed auth module.",
          blockerReason: "Third issue needs manual review.",
        }),
      );
      expect(output.status).toBe("partial");
      expect(output.content).toBeDefined();
      expect(output.filesChanged).toBeDefined();
      expect(output.commitMessage).toBeDefined();
      expect(output.memoryUpdate).toBeDefined();
      expect(output.blockerReason).toBeDefined();
    });

    it("accepts all four severity levels in task content", () => {
      for (const severity of ["critical", "high", "medium", "low"] as const) {
        const output = parseAgentOutput(
          JSON.stringify({
            status: "completed",
            summary: "Found issue.",
            content: {
              type: "task",
              body: {
                title: `Issue (${severity})`,
                severity,
                description: "desc",
                files: ["a.ts"],
              },
            },
          }),
        );
        const body =
          output.content?.type === "task" ? output.content.body : null;
        expect(body?.severity).toBe(severity);
      }
    });
  });

  describe("markdown fence handling", () => {
    it("strips ```json fences", () => {
      const json = JSON.stringify({
        status: "completed",
        summary: "Done.",
      });
      const output = parseAgentOutput("```json\n" + json + "\n```");
      expect(output.status).toBe("completed");
    });

    it("strips plain ``` fences", () => {
      const json = JSON.stringify({
        status: "completed",
        summary: "Done.",
      });
      const output = parseAgentOutput("```\n" + json + "\n```");
      expect(output.status).toBe("completed");
    });

    it("handles triple backticks inside JSON string values", () => {
      const json = JSON.stringify({
        status: "completed",
        summary: "Found issue.",
        content: {
          type: "task",
          body: {
            title: "SQL bug",
            severity: "high",
            description: "Broken query",
            suggestedFix:
              "Use LEFT JOIN:\n\n```sql\nSELECT * FROM foo\n```\n\nApply to all files.",
            files: ["src/repo.ts:42"],
          },
        },
      });
      const output = parseAgentOutput("```json\n" + json + "\n```");
      expect(output.content?.type).toBe("task");
      const body =
        output.content?.type === "task" ? output.content.body : null;
      expect(body?.suggestedFix).toContain("```sql");
      expect(body?.title).toBe("SQL bug");
    });

    it("extracts JSON from text with leading prose", () => {
      const json = JSON.stringify({
        status: "completed",
        summary: "Done.",
      });
      const output = parseAgentOutput(
        "Here is my output:\n\n" + json,
      );
      expect(output.status).toBe("completed");
    });

    it("skips curly braces in prose before the actual JSON", () => {
      const json = JSON.stringify({
        status: "completed",
        summary: "Reviewed MR #9161.",
        content: { type: "generic", body: "One finding posted." },
      });
      const prose =
        "Review posted. The URL `/platform/{handle}/workspaces/{id}` is broken.\n\n";
      const output = parseAgentOutput(prose + json);
      expect(output.status).toBe("completed");
      expect(output.summary).toBe("Reviewed MR #9161.");
    });
  });

  describe("rejection of invalid output", () => {
    it("throws on non-JSON text", () => {
      expect(() => parseAgentOutput("not json at all")).toThrow();
    });

    it("throws on missing summary", () => {
      expect(() =>
        parseAgentOutput(JSON.stringify({ status: "completed" })),
      ).toThrow();
    });

    it("throws on missing status", () => {
      expect(() =>
        parseAgentOutput(JSON.stringify({ summary: "Done." })),
      ).toThrow();
    });

    it("throws on invalid status value", () => {
      expect(() =>
        parseAgentOutput(
          JSON.stringify({ status: "unknown", summary: "X" }),
        ),
      ).toThrow();
    });

    it("throws on invalid severity in task content", () => {
      expect(() =>
        parseAgentOutput(
          JSON.stringify({
            status: "completed",
            summary: "Found issue",
            content: {
              type: "task",
              body: {
                title: "Bug",
                severity: "urgent",
                description: "Bad",
                files: ["a.ts"],
              },
            },
          }),
        ),
      ).toThrow();
    });

    it("throws on task content with empty files array", () => {
      expect(() =>
        parseAgentOutput(
          JSON.stringify({
            status: "completed",
            summary: "Found issue",
            content: {
              type: "task",
              body: {
                title: "Bug",
                severity: "high",
                description: "Bad",
                files: [],
              },
            },
          }),
        ),
      ).toThrow();
    });

    it("throws on unknown content type", () => {
      expect(() =>
        parseAgentOutput(
          JSON.stringify({
            status: "completed",
            summary: "Done",
            content: { type: "unknown", body: "x" },
          }),
        ),
      ).toThrow();
    });

    it("throws on task content with missing title", () => {
      expect(() =>
        parseAgentOutput(
          JSON.stringify({
            status: "completed",
            summary: "Found issue",
            content: {
              type: "task",
              body: {
                severity: "high",
                description: "Bad",
                files: ["a.ts"],
              },
            },
          }),
        ),
      ).toThrow();
    });

    it("throws on commitMessage with empty subject", () => {
      expect(() =>
        parseAgentOutput(
          JSON.stringify({
            status: "completed",
            summary: "Fixed",
            commitMessage: { subject: "", body: "desc" },
          }),
        ),
      ).toThrow();
    });
  });
});
