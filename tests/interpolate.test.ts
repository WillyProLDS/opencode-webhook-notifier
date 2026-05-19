import { describe, expect, it } from "vitest";
import { interpolateMessage } from "../src/config/interpolate.js";

describe("interpolateMessage", () => {
  it("substitutes all placeholders when context is fully populated", () => {
    const result = interpolateMessage("[{timestamp}] {projectName}/{sessionTitle} ({agentName}) turn {turn}", {
      sessionTitle: "Hello world",
      agentName: "explore",
      projectName: "demo",
      timestamp: "12:34:56",
      turn: 7,
    });
    expect(result).toBe("[12:34:56] demo/Hello world (explore) turn 7");
  });

  it("substitutes missing values with empty string and strips trailing punctuation", () => {
    const result = interpolateMessage("Project: {projectName}, session: {sessionTitle}", {
      projectName: "demo",
      sessionTitle: null,
    });
    expect(result).toBe("Project: demo, session");
  });

  it("strips trailing colon", () => {
    expect(interpolateMessage("Session has finished: {sessionTitle}", { sessionTitle: null })).toBe(
      "Session has finished",
    );
  });

  it("strips trailing dash", () => {
    expect(interpolateMessage("Session has finished - {sessionTitle}", { sessionTitle: null })).toBe(
      "Session has finished",
    );
  });

  it("strips trailing pipe", () => {
    expect(interpolateMessage("Session has finished | {sessionTitle}", { sessionTitle: null })).toBe(
      "Session has finished",
    );
  });

  it("collapses double spaces", () => {
    const result = interpolateMessage("hello {agentName} world", { agentName: null });
    expect(result).toBe("hello world");
  });

  it("preserves single spaces", () => {
    expect(interpolateMessage("hello world", {})).toBe("hello world");
  });

  it("substitutes turn even when zero", () => {
    expect(interpolateMessage("turn={turn}", { turn: 0 })).toBe("turn=0");
  });

  it("renders turn as empty when undefined", () => {
    expect(interpolateMessage("turn={turn}", {})).toBe("turn=");
  });

  it("replaces all occurrences of a placeholder", () => {
    expect(interpolateMessage("{agentName} - {agentName} - {agentName}", { agentName: "x" })).toBe("x - x - x");
  });

  it("returns empty-ish string when message is only placeholders", () => {
    expect(interpolateMessage("{sessionTitle}", { sessionTitle: null })).toBe("");
  });

  it("does not strip non-trailing punctuation", () => {
    const result = interpolateMessage("Status: {sessionTitle} - {agentName}", {
      sessionTitle: "live",
      agentName: "explore",
    });
    expect(result).toBe("Status: live - explore");
  });
});
