import { execWithTimeout } from "./exec.js";

const MAC_TERMINAL_APP_NAMES = new Set<string>([
  "terminal",
  "iterm2",
  "ghostty",
  "wezterm",
  "alacritty",
  "kitty",
  "hyper",
  "warp",
  "tabby",
  "cursor",
  "visual studio code",
  "code",
  "code insiders",
  "zed",
  "rio",
]);

function normalizeMacAppName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.app$/i, "")
    .replace(/\s+/g, " ");
}

function getExpectedMacTerminalAppNames(env: NodeJS.ProcessEnv): Set<string> {
  const expected = new Set<string>();
  const termProgram = typeof env.TERM_PROGRAM === "string" ? normalizeMacAppName(env.TERM_PROGRAM) : "";

  if (env.TMUX && (termProgram === "tmux" || termProgram === "screen" || termProgram.length === 0)) {
    return new Set(MAC_TERMINAL_APP_NAMES);
  }

  if (termProgram === "apple_terminal") {
    expected.add("terminal");
  } else if (termProgram === "iterm" || termProgram === "iterm2") {
    expected.add("iterm2");
  } else if (termProgram === "vscode") {
    expected.add("visual studio code");
    expected.add("code");
    expected.add("code insiders");
  } else if (termProgram === "warpterminal") {
    expected.add("warp");
  } else if (termProgram.length > 0) {
    expected.add(termProgram);
  }

  if (expected.size > 0) return expected;
  return new Set(MAC_TERMINAL_APP_NAMES);
}

export function isMacTerminalAppFocused(
  frontmostAppName: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!frontmostAppName) return false;
  const normalizedFrontmost = normalizeMacAppName(frontmostAppName);
  if (!normalizedFrontmost) return false;
  const expectedApps = getExpectedMacTerminalAppNames(env);
  return expectedApps.has(normalizedFrontmost);
}

export function getMacOSActiveWindowId(): string | null {
  return execWithTimeout(
    `osascript -e 'tell application "System Events" to return id of window 1 of (first application process whose frontmost is true)'`,
  );
}

export function getMacOSFrontmostAppName(): string | null {
  return execWithTimeout(
    `osascript -e 'tell application "System Events" to return name of first application process whose frontmost is true'`,
  );
}
