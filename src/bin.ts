#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { cleanCommand } from "./commands/clean.js";

const program = new Command();

program
  .name("vteam")
  .description("Virtual development team framework powered by Claude Code")
  .version("0.1.0");

program
  .command("init")
  .description("Scaffold vteam/ directory with default agents and task folders")
  .action(initCommand);

program
  .command("run")
  .description("Run a specific agent")
  .argument("[agent]", "Agent to run (omit to list available agents)")
  .action(runCommand);

program
  .command("status")
  .description("Show task board status")
  .action(statusCommand);

program
  .command("clean")
  .description("Remove orphaned worktrees, break stale locks")
  .action(cleanCommand);

program.parse();
