import { describe, it, expect } from "vitest";
import { slugify } from "./slugify.js";

describe("slugify", () => {
  it("lowercases input", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("fix auth bug")).toBe("fix-auth-bug");
  });

  it("strips non-alphanumeric characters", () => {
    expect(slugify("fix: the bug!")).toBe("fix-the-bug");
  });

  it("collapses consecutive separators into one hyphen", () => {
    expect(slugify("too   many---spaces")).toBe("too-many-spaces");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--trimmed--")).toBe("trimmed");
  });

  it("handles already-slugified input", () => {
    expect(slugify("already-a-slug")).toBe("already-a-slug");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns empty string for all-special-character input", () => {
    expect(slugify("!@#$%")).toBe("");
  });

  it("preserves numbers", () => {
    expect(slugify("step 1 of 3")).toBe("step-1-of-3");
  });

  it("handles unicode accented characters", () => {
    expect(slugify("café résumé")).toBe("cafe-resume");
  });

  it("handles mixed case with punctuation", () => {
    expect(slugify("Missing Null-Check in Auth")).toBe("missing-null-check-in-auth");
  });

  it("handles input used for task filenames", () => {
    expect(slugify("Fix Auth Bug")).toBe("fix-auth-bug");
  });

  it("handles input used for branch names", () => {
    expect(slugify("2026-04-19-fix-null-check")).toBe("2026-04-19-fix-null-check");
  });
});
