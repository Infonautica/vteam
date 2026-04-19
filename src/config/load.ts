import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vteamConfigSchema } from "./schema.js";
import type { VteamConfig } from "../types.js";

export function loadConfig(cwd: string): VteamConfig {
  const configPath = resolve(cwd, "vteam", "vteam.config.json");
  if (!existsSync(configPath)) {
    throw new Error("vteam.config.json not found. Run 'vteam init' first.");
  }
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  const result = vteamConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid vteam.config.json:\n${issues}`);
  }
  return result.data;
}
