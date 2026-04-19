import {
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { resolve, basename } from "node:path";
import matter from "gray-matter";
import slugify from "slugify";
import type {
  TaskFile,
  TaskFrontmatter,
  ReviewerFinding,
  Severity,
} from "../types.js";

export function parseTaskFile(filePath: string): TaskFile {
  const raw = readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  return {
    filename: basename(filePath),
    path: filePath,
    frontmatter: data as TaskFrontmatter,
    body: content.trim(),
  };
}

export function listTaskFiles(dir: string): TaskFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== ".gitkeep")
    .map((f) => parseTaskFile(resolve(dir, f)));
}

export function generateTaskFilename(title: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const slug = slugify(title, { lower: true, strict: true });
  const jitter = Math.random().toString(36).slice(2, 6);
  return `${date}-${time}-${slug}-${jitter}.md`;
}

export function createTaskFile(
  dir: string,
  finding: ReviewerFinding,
  foundBy: string,
): string {
  const filename = generateTaskFilename(finding.title);
  const filePath = resolve(dir, filename);

  const frontmatter: TaskFrontmatter = {
    title: finding.title,
    created: new Date().toISOString(),
    status: "backlog",
    severity: finding.severity,
    "found-by": foundBy,
    files: finding.files,
  };

  const body = [
    `## Description\n\n${finding.description}`,
    finding.suggestedFix
      ? `## Suggested Fix\n\n${finding.suggestedFix}`
      : "",
    `## Affected Files\n\n${finding.files.map((f) => `- \`${f}\``).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const content = matter.stringify(body, frontmatter);
  writeFileSync(filePath, content, "utf-8");
  return filename;
}

export function moveTask(
  fromDir: string,
  toDir: string,
  filename: string,
  extraFrontmatter?: Partial<TaskFrontmatter>,
): void {
  const srcPath = resolve(fromDir, filename);
  const destPath = resolve(toDir, filename);

  if (extraFrontmatter) {
    const task = parseTaskFile(srcPath);
    const merged = { ...task.frontmatter, ...extraFrontmatter };
    const content = matter.stringify(task.body, merged);
    writeFileSync(destPath, content, "utf-8");
    unlinkSync(srcPath);
  } else {
    renameSync(srcPath, destPath);
  }
}

export function updateTaskFrontmatter(
  filePath: string,
  updates: Partial<TaskFrontmatter>,
): void {
  const task = parseTaskFile(filePath);
  const merged = { ...task.frontmatter, ...updates };
  const content = matter.stringify(task.body, merged);
  writeFileSync(filePath, content, "utf-8");
}

export function isDuplicateTitle(
  newTitle: string,
  existingTasks: TaskFile[],
): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedNew = normalize(newTitle);
  return existingTasks.some(
    (t) => normalize(t.frontmatter.title) === normalizedNew,
  );
}

export function severityPriority(severity: Severity): number {
  const map: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return map[severity];
}
