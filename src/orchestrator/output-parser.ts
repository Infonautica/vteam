import type { ReviewerOutput, RefactorerOutput } from "../types.js";

interface ClaudeJsonOutput {
  result: string;
  is_error?: boolean;
  session_id?: string;
  cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
}

export function parseClaudeJsonOutput(raw: string): string {
  const parsed: ClaudeJsonOutput = JSON.parse(raw);
  if (parsed.is_error) {
    throw new Error(`Claude returned an error: ${parsed.result}`);
  }
  return parsed.result;
}

export function parseReviewerOutput(resultText: string): ReviewerOutput {
  const cleaned = extractJson(resultText);
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed.findings)) {
    throw new Error("Reviewer output missing 'findings' array");
  }
  if (typeof parsed.summary !== "string") {
    throw new Error("Reviewer output missing 'summary' string");
  }
  if (!Array.isArray(parsed.areasScanned)) {
    throw new Error("Reviewer output missing 'areasScanned' array");
  }

  for (const f of parsed.findings) {
    if (!f.title || !f.severity || !f.description || !Array.isArray(f.files)) {
      throw new Error(
        `Invalid finding: missing required fields in "${f.title ?? "unknown"}"`,
      );
    }
  }

  return parsed as ReviewerOutput;
}

export function parseRefactorerOutput(resultText: string): RefactorerOutput {
  const cleaned = extractJson(resultText);
  const parsed = JSON.parse(cleaned);

  if (!parsed.status || !parsed.summary || !Array.isArray(parsed.filesChanged)) {
    throw new Error("Refactorer output missing required fields");
  }

  return parsed as RefactorerOutput;
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) return fenceMatch[1];

  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1) {
    return text.slice(braceStart, braceEnd + 1);
  }

  return text;
}
