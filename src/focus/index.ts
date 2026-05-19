import { getLinuxActiveWindowId } from "./linux.js";
import { getMacOSActiveWindowId, getMacOSFrontmostAppName, isMacTerminalAppFocused } from "./macos.js";
import { isTmuxPaneActive, isWezTermPaneActive } from "./multiplexer.js";
import { getWindowsActiveWindowId } from "./windows.js";

export interface FocusDetector {
  isTerminalFocused(): boolean;
  invalidate(): void;
}

export interface FocusDetectorOptions {
  cacheMs?: number;
  now?: () => number;
}

function getActiveWindowId(env: NodeJS.ProcessEnv = process.env): string | null {
  const platform = process.platform;
  if (platform === "darwin") return getMacOSActiveWindowId();
  if (platform === "linux") return getLinuxActiveWindowId(env);
  if (platform === "win32") return getWindowsActiveWindowId();
  return null;
}

function detectTerminalFocused(originalWindowId: string | null, env: NodeJS.ProcessEnv): boolean {
  if (process.platform === "darwin") {
    const frontmost = getMacOSFrontmostAppName();
    if (!isMacTerminalAppFocused(frontmost, env)) return false;
    if (!isWezTermPaneActive(env)) return false;
    if (env.TMUX) return isTmuxPaneActive(env);
    return true;
  }

  if (!originalWindowId) return false;
  const currentId = getActiveWindowId(env);
  if (currentId !== originalWindowId) return false;
  if (!isWezTermPaneActive(env)) return false;
  if (env.TMUX) return isTmuxPaneActive(env);
  return true;
}

export function createFocusDetector(options: FocusDetectorOptions = {}): FocusDetector {
  const cacheMs = options.cacheMs ?? 250;
  const now = options.now ?? Date.now;
  const env = process.env;

  let baselineWindowId: string | null | undefined;
  let cachedFocused: boolean | null = null;
  let cachedAt = 0;

  return {
    isTerminalFocused() {
      if (cachedFocused !== null && now() - cachedAt < cacheMs) {
        return cachedFocused;
      }

      try {
        if (baselineWindowId === undefined) {
          baselineWindowId = getActiveWindowId(env);
        }

        const focused = detectTerminalFocused(baselineWindowId, env);
        cachedFocused = focused;
        cachedAt = now();
        return focused;
      } catch {
        cachedFocused = false;
        cachedAt = now();
        return false;
      }
    },
    invalidate() {
      cachedFocused = null;
      cachedAt = 0;
      baselineWindowId = undefined;
    },
  };
}
