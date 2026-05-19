import { describe, expect, it } from "vitest";
import { isMacTerminalAppFocused } from "../src/focus/macos.js";
import { isTmuxPaneFocused, parseWezTermFocusedPaneId } from "../src/focus/multiplexer.js";
import { extractAgentNameFromSessionTitle } from "../src/plugin/notifier.js";

describe("parseWezTermFocusedPaneId", () => {
  it("returns the focused_pane_id from the first client", () => {
    const json = JSON.stringify([{ focused_pane_id: 42 }]);
    expect(parseWezTermFocusedPaneId(json)).toBe("42");
  });

  it("scans clients until it finds a numeric focused_pane_id", () => {
    const json = JSON.stringify([{ other: "x" }, { focused_pane_id: 7 }]);
    expect(parseWezTermFocusedPaneId(json)).toBe("7");
  });

  it("returns null when JSON is not an array", () => {
    expect(parseWezTermFocusedPaneId(JSON.stringify({ focused_pane_id: 1 }))).toBeNull();
  });

  it("returns null when no client has a numeric focused_pane_id", () => {
    expect(parseWezTermFocusedPaneId(JSON.stringify([{ focused_pane_id: "x" }, {}]))).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseWezTermFocusedPaneId("not json")).toBeNull();
  });
});

describe("isTmuxPaneFocused", () => {
  it("returns true only when all three flags are 1", () => {
    expect(isTmuxPaneFocused("%0", "1 1 1")).toBe(true);
  });

  it("returns false when session is not attached", () => {
    expect(isTmuxPaneFocused("%0", "0 1 1")).toBe(false);
  });

  it("returns false when window is not active", () => {
    expect(isTmuxPaneFocused("%0", "1 0 1")).toBe(false);
  });

  it("returns false when pane is not active", () => {
    expect(isTmuxPaneFocused("%0", "1 1 0")).toBe(false);
  });

  it("returns false when tmuxPane is null", () => {
    expect(isTmuxPaneFocused(null, "1 1 1")).toBe(false);
  });

  it("returns false when probeResult is null", () => {
    expect(isTmuxPaneFocused("%0", null)).toBe(false);
  });

  it("returns false when tmuxPane is empty string", () => {
    expect(isTmuxPaneFocused("", "1 1 1")).toBe(false);
  });
});

describe("isMacTerminalAppFocused", () => {
  it("returns false for null frontmost", () => {
    expect(isMacTerminalAppFocused(null, {} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("returns false for empty frontmost", () => {
    expect(isMacTerminalAppFocused("", {} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("matches Apple Terminal under TERM_PROGRAM=Apple_Terminal", () => {
    expect(isMacTerminalAppFocused("Terminal", { TERM_PROGRAM: "Apple_Terminal" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("matches iTerm2 under TERM_PROGRAM=iTerm.app", () => {
    expect(isMacTerminalAppFocused("iTerm2", { TERM_PROGRAM: "iTerm.app" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("matches VS Code under TERM_PROGRAM=vscode", () => {
    expect(isMacTerminalAppFocused("Code", { TERM_PROGRAM: "vscode" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isMacTerminalAppFocused("Visual Studio Code", { TERM_PROGRAM: "vscode" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("matches Warp under TERM_PROGRAM=WarpTerminal", () => {
    expect(isMacTerminalAppFocused("Warp", { TERM_PROGRAM: "WarpTerminal" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("falls back to known terminal set when TERM_PROGRAM is missing", () => {
    expect(isMacTerminalAppFocused("Ghostty", {} as NodeJS.ProcessEnv)).toBe(true);
    expect(isMacTerminalAppFocused("Safari", {} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("under TMUX with TERM_PROGRAM=tmux, accepts any known terminal", () => {
    const env = { TMUX: "/tmp/tmux", TERM_PROGRAM: "tmux" } as NodeJS.ProcessEnv;
    expect(isMacTerminalAppFocused("Alacritty", env)).toBe(true);
    expect(isMacTerminalAppFocused("Safari", env)).toBe(false);
  });

  it("normalizes .app suffix and case", () => {
    expect(isMacTerminalAppFocused("Ghostty.app", {} as NodeJS.ProcessEnv)).toBe(true);
    expect(isMacTerminalAppFocused("GHOSTTY", {} as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe("extractAgentNameFromSessionTitle", () => {
  it("returns empty string for non-string input", () => {
    expect(extractAgentNameFromSessionTitle(undefined)).toBe("");
    expect(extractAgentNameFromSessionTitle(null)).toBe("");
    expect(extractAgentNameFromSessionTitle(123)).toBe("");
  });

  it("returns empty string for empty title", () => {
    expect(extractAgentNameFromSessionTitle("")).toBe("");
  });

  it("extracts agent name from `(@agent subagent)` suffix", () => {
    expect(extractAgentNameFromSessionTitle("Some task (@explore subagent)")).toBe("explore");
  });

  it("handles multiple spaces between @name and subagent", () => {
    expect(extractAgentNameFromSessionTitle("Task (@oracle  subagent)")).toBe("oracle");
  });

  it("returns empty string when no subagent suffix present", () => {
    expect(extractAgentNameFromSessionTitle("Plain title")).toBe("");
  });

  it("returns empty string when @ is missing", () => {
    expect(extractAgentNameFromSessionTitle("Task (explore subagent)")).toBe("");
  });
});
