import { z } from "zod";
import { Cron } from "croner";

export function isValidCronExpression(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  try {
    const job = new Cron(expr);
    job.stop();
    return true;
  } catch {
    return false;
  }
}

export const agentFrontmatterSchema = z
  .object({
    model: z.string().optional(),
    cron: z
      .string()
      .refine(isValidCronExpression, {
        message:
          "Invalid cron expression (expected 5 fields: minute hour day month weekday)",
      })
      .optional(),
    scanPaths: z.array(z.string()).optional(),
    excludePaths: z.array(z.string()).optional(),
    worktree: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    input: z.enum(["task", "pr"]).optional(),
    prFilterLabels: z.array(z.string()).optional(),
    prTriggerLabel: z.string().optional(),
    autoPR: z.boolean().optional(),
    prCreateLabels: z.array(z.string()).optional(),
    allowedTools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
  })
  .refine((agent) => agent.input !== "pr" || agent.worktree, {
    message: 'input: "pr" requires worktree: true',
  })
  .refine((agent) => !agent.readOnly || agent.worktree, {
    message: "readOnly: true requires worktree: true",
  })
  .refine((agent) => !agent.readOnly || !agent.autoPR, {
    message: "readOnly: true is incompatible with autoPR: true",
  });

export const onFinishFrontmatterSchema = z.object({
  model: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
});

export const memoryFrontmatterSchema = z.object({
  model: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
});

export const vteamConfigSchema = z.object({
  baseBranch: z.string(),
  platform: z.enum(["github", "gitlab"]),
  worktreeDir: z.string(),
  tasks: z.object({
    maxRetries: z.number().int().nonnegative(),
  }),
});
