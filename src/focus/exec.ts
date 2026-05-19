import { execFileSync, execSync } from "node:child_process";

export function execWithTimeout(command: string, timeoutMs = 500): string | null {
  try {
    return execSync(command, { timeout: timeoutMs, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function execFileWithTimeout(command: string, args: readonly string[], timeoutMs = 500): string | null {
  try {
    return execFileSync(command, args, {
      timeout: timeoutMs,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
