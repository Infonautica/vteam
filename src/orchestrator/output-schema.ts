import { z } from "zod";
import type { AgentOutput } from "../types.js";

const severitySchema = z.enum(["critical", "high", "medium", "low"]);

const taskContentBodySchema = z.object({
  title: z.string().min(1),
  severity: severitySchema,
  description: z.string().min(1),
  suggestedFix: z.string().optional(),
  files: z.array(z.string()).min(1),
});

const taskContentSchema = z.object({
  type: z.literal("task"),
  body: taskContentBodySchema,
});

const genericContentSchema = z.object({
  type: z.literal("generic"),
  body: z.string(),
});

const agentContentSchema = z.discriminatedUnion("type", [
  taskContentSchema,
  genericContentSchema,
]);

const commitMessageSchema = z.object({
  subject: z.string().min(1),
  body: z.string(),
});

export const agentOutputSchema = z.object({
  status: z.enum(["completed", "partial", "blocked", "failed"]),
  summary: z.string(),
  content: agentContentSchema.optional(),
  filesChanged: z.array(z.string()).optional(),
  commitMessage: commitMessageSchema.optional(),
  blockerReason: z.string().optional(),
  memoryUpdate: z.string().optional(),
});

function stripMarkdownFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*)```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

function extractJson(text: string): string {
  const stripped = stripMarkdownFences(text);
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) return match[0];
  return stripped;
}

export function parseAgentOutput(resultText: string): AgentOutput {
  const json = JSON.parse(extractJson(resultText));
  return agentOutputSchema.parse(json);
}
