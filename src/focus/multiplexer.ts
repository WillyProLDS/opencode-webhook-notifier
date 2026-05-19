import { execFileWithTimeout } from "./exec.js";

export function isTmuxPaneFocused(tmuxPane: string | null | undefined, probeResult: string | null): boolean {
  if (!tmuxPane) return false;
  if (!probeResult) return false;
  const [sessionAttached, windowActive, paneActive] = probeResult.split(" ");
  return sessionAttached === "1" && windowActive === "1" && paneActive === "1";
}

export function isTmuxPaneActive(env: NodeJS.ProcessEnv = process.env): boolean {
  const tmuxPane = env.TMUX_PANE ?? null;
  const result = execFileWithTimeout("tmux", [
    "display-message",
    "-t",
    tmuxPane ?? "",
    "-p",
    "#{session_attached} #{window_active} #{pane_active}",
  ]);
  return isTmuxPaneFocused(tmuxPane, result);
}

export function parseWezTermFocusedPaneId(output: string): string | null {
  try {
    const data = JSON.parse(output) as Array<{ focused_pane_id?: unknown }>;
    if (!Array.isArray(data)) return null;
    for (const client of data) {
      if (typeof client?.focused_pane_id === "number") {
        return String(client.focused_pane_id);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function isWezTermPaneActive(env: NodeJS.ProcessEnv = process.env): boolean {
  const weztermPane = env.WEZTERM_PANE ?? null;
  if (!weztermPane) return true;
  const output = execFileWithTimeout("wezterm", ["cli", "list-clients", "--format", "json"], 1000);
  if (!output) return false;
  const focusedPaneId = parseWezTermFocusedPaneId(output);
  if (!focusedPaneId) return false;
  return focusedPaneId === weztermPane;
}
