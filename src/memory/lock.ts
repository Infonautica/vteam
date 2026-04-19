import { mkdirSync, rmdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const STALE_MS = 30 * 60 * 1000; // 30 minutes

interface LockInfo {
  pid: number;
  timestamp: number;
  agent: string;
}

export interface FileLock {
  path: string;
  release: () => void;
}

function isLockStale(lockDir: string): boolean {
  try {
    const infoPath = resolve(lockDir, "info.json");
    if (!existsSync(infoPath)) {
      const stat = statSync(lockDir);
      return Date.now() - stat.mtimeMs > STALE_MS;
    }
    const info: LockInfo = JSON.parse(readFileSync(infoPath, "utf-8"));
    return Date.now() - info.timestamp > STALE_MS;
  } catch {
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function acquireLock(
  resourcePath: string,
  agent: string,
  timeoutMs = 30_000,
): Promise<FileLock> {
  const lockDir = resourcePath + ".lock";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      mkdirSync(lockDir);
      writeFileSync(
        resolve(lockDir, "info.json"),
        JSON.stringify({
          pid: process.pid,
          timestamp: Date.now(),
          agent,
        } satisfies LockInfo),
      );

      return {
        path: lockDir,
        release: () => {
          try {
            rmdirSync(lockDir, { recursive: true });
          } catch {
            // Already released
          }
        },
      };
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EEXIST") {
        if (isLockStale(lockDir)) {
          rmdirSync(lockDir, { recursive: true });
          continue;
        }
        await sleep(500 + Math.random() * 500);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Timeout acquiring lock on ${resourcePath}`);
}

export function breakLock(resourcePath: string): boolean {
  const lockDir = resourcePath + ".lock";
  if (existsSync(lockDir)) {
    rmdirSync(lockDir, { recursive: true });
    return true;
  }
  return false;
}
