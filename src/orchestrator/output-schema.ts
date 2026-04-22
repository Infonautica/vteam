import { z } from "zod";
import type { ReviewerOutput, CommitterOutput } from "../types.js";

const severitySchema = z.enum(["critical", "high", "medium", "low"]);

const findingSchema = z.object({
  title: z.string().min(1),
  severity: severitySchema,
  description: z.string().min(1),
  suggestedFix: z.string().optional(),
  files: z.array(z.string()).min(1),
});

export const reviewerOutputSchema = z.object({
  findings: z.array(findingSchema),
  summary: z.string(),
  areasScanned: z.array(z.string()),
  memoryUpdate: z.string().optional(),
});

const commitMessageSchema = z.object({
  subject: z.string().min(1),
  body: z.string(),
});

export const committerOutputSchema = z.object({
  status: z.enum(["completed", "partial", "blocked", "failed"]),
  summary: z.string(),
  filesChanged: z.array(z.string()),
  commitMessage: commitMessageSchema,
  blockerReason: z.string().optional(),
  memoryUpdate: z.string().optional(),
});

function stripMarkdownFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

function extractJson(text: string): string {
  const stripped = stripMarkdownFences(text);
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) return match[0];
  return stripped;
}

export function parseReviewerOutput(resultText: string): ReviewerOutput {
  const json = JSON.parse(extractJson(resultText));
  return reviewerOutputSchema.parse(json);
}

export function parseCommitterOutput(resultText: string): CommitterOutput {
  const json = JSON.parse(extractJson(resultText));
  return committerOutputSchema.parse(json);
}
