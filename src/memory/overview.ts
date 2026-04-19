import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { OverviewEntry, TaskStatus } from "../types.js";

const HEADER = "# Virtual Team — Task Overview\n\n## Tasks\n";

export function readOverview(overviewPath: string): string {
  if (!existsSync(overviewPath)) return HEADER;
  return readFileSync(overviewPath, "utf-8");
}

export function parseOverviewEntries(content: string): OverviewEntry[] {
  const entries: OverviewEntry[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(
      /^- \*\*\[(\w+)\]\*\* (.+?) \| (\w+) \| (.+?) \| `(.+?)` \|/,
    );
    if (!match) continue;
    entries.push({
      status: match[1] as TaskStatus,
      date: match[2],
      severity: match[3] as OverviewEntry["severity"],
      title: match[4],
      files: match[5],
      taskPath: extractTaskPath(line),
      branch: extractField(line, "branch"),
      mrUrl: extractField(line, "MR"),
    });
  }
  return entries;
}

function extractTaskPath(line: string): string {
  const match = line.match(/\[→ .+?\]\((.+?)\)/);
  return match?.[1] ?? "";
}

function extractField(line: string, label: string): string | undefined {
  const match = line.match(new RegExp(`${label}: \`(.+?)\``));
  return match?.[1];
}

export function formatOverviewEntry(entry: OverviewEntry): string {
  let line = `- **[${entry.status}]** ${entry.date} | ${entry.severity} | ${entry.title} | \`${entry.files}\``;
  if (entry.branch) line += ` | branch: \`${entry.branch}\``;
  if (entry.mrUrl) line += ` | MR: ${entry.mrUrl}`;
  line += ` | [→ ${entry.taskPath}](${entry.taskPath})`;
  return line;
}

export function appendToOverview(
  overviewPath: string,
  entries: OverviewEntry[],
): void {
  let content = readOverview(overviewPath);

  for (const entry of entries) {
    const line = formatOverviewEntry(entry);
    content = content.trimEnd() + "\n" + line;
  }

  writeFileSync(overviewPath, content + "\n", "utf-8");
}

export function updateOverviewEntryStatus(
  overviewPath: string,
  taskTitle: string,
  newStatus: TaskStatus,
  extraFields?: { branch?: string; mrUrl?: string },
): void {
  const content = readOverview(overviewPath);
  const lines = content.split("\n");
  const normalizedTitle = taskTitle.toLowerCase();

  const updatedLines = lines.map((line) => {
    if (!line.toLowerCase().includes(normalizedTitle)) return line;
    const match = line.match(/^\- \*\*\[\w+\]\*\*/);
    if (!match) return line;

    let updated = line.replace(/\*\*\[\w+\]\*\*/, `**[${newStatus}]**`);
    if (extraFields?.branch && !updated.includes("branch:")) {
      updated = updated.replace(
        / \| \[→/,
        ` | branch: \`${extraFields.branch}\` | [→`,
      );
    }
    if (extraFields?.mrUrl && !updated.includes("MR:")) {
      updated = updated.replace(
        / \| \[→/,
        ` | MR: ${extraFields.mrUrl} | [→`,
      );
    }
    return updated;
  });

  writeFileSync(overviewPath, updatedLines.join("\n"), "utf-8");
}
