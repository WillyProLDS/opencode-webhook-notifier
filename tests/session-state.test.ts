import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionState, type SessionState } from "../src/plugin/session-state.js";

describe("createSessionState", () => {
  let state: SessionState;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000_000_000));
    state = createSessionState({ idleDelayMs: 350 });
  });

  afterEach(() => {
    state.dispose();
    vi.useRealTimers();
  });

  describe("scheduleIdle", () => {
    it("fires the handler after the idle delay", async () => {
      const handler = vi.fn(() => Promise.resolve());
      state.scheduleIdle("s1", handler);

      await vi.advanceTimersByTimeAsync(350);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("re-scheduling restarts the timer (debounce semantics)", async () => {
      const handler = vi.fn(() => Promise.resolve());
      state.scheduleIdle("s1", handler);
      await vi.advanceTimersByTimeAsync(200);

      state.scheduleIdle("s1", handler);
      await vi.advanceTimersByTimeAsync(200);
      expect(handler).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(150);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("markError", () => {
    it("suppresses a pending idle that fires after the error", async () => {
      const handler = vi.fn(() => Promise.resolve());
      state.scheduleIdle("s1", handler);
      await vi.advanceTimersByTimeAsync(100);
      state.markError("s1");

      await vi.advanceTimersByTimeAsync(500);
      expect(handler).not.toHaveBeenCalled();
    });

    it("ignores null sessionID", () => {
      expect(() => state.markError(null)).not.toThrow();
    });

    it("a fresh idle scheduled after error is suppressed if no busy intervened", async () => {
      state.markError("s1");
      const handler = vi.fn(() => Promise.resolve());
      state.scheduleIdle("s1", handler);

      await vi.advanceTimersByTimeAsync(400);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("markBusy", () => {
    it("clears prior error suppression when busy occurs after error", async () => {
      state.markError("s1");
      vi.advanceTimersByTime(50);
      state.markBusy("s1");

      const handler = vi.fn(() => Promise.resolve());
      state.scheduleIdle("s1", handler);
      await vi.advanceTimersByTimeAsync(400);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("invalidates a pending idle (re-busy after schedule)", async () => {
      const handler = vi.fn(() => Promise.resolve());
      state.scheduleIdle("s1", handler);
      await vi.advanceTimersByTimeAsync(100);
      state.markBusy("s1");

      await vi.advanceTimersByTimeAsync(500);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    it("clears pending timers so handler does not fire", async () => {
      const handler = vi.fn(() => Promise.resolve());
      state.scheduleIdle("s1", handler);
      await vi.advanceTimersByTimeAsync(100);
      state.dispose();

      await vi.advanceTimersByTimeAsync(500);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
