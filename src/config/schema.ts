import { z } from "zod";

export const agentFrontmatterSchema = z
  .object({
    model: z.string().optional(),
    scanPaths: z.array(z.string()).optional(),
    excludePaths: z.array(z.string()).optional(),
    worktree: z.boolean().optional(),
    taskInput: z.boolean().optional(),
    prInput: z.boolean().optional(),
    prLabels: z.array(z.string()).optional(),
    prTriggerLabel: z.string().optional(),
    autoMR: z.boolean().optional(),
    mrLabels: z.array(z.string()).optional(),
  })
  .refine((agent) => !agent.autoMR || agent.worktree, {
    message: "autoMR requires worktree: true",
  })
  .refine((agent) => !agent.prInput || agent.worktree, {
    message: "prInput requires worktree: true",
  })
  .refine((agent) => !(agent.prInput && agent.taskInput), {
    message: "prInput and taskInput are mutually exclusive",
  });

export const vteamConfigSchema = z.object({
  baseBranch: z.string(),
  platform: z.enum(["github", "gitlab"]),
  worktreeDir: z.string(),
  tasks: z.object({
    maxRetries: z.number().int().nonnegative(),
  }),
});
