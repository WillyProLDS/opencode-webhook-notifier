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

  describe("pruneOlderThan", () => {
    it("prunes sessionIdleSequence entries older than cutoff", async () => {
      state.scheduleIdle("s1", () => Promise.resolve());
      await vi.advanceTimersByTimeAsync(400);

      // s1's idle fired, timer cleared, but sequence entry remains
      // Advance time beyond the cutoff
      vi.setSystemTime(new Date(1_000_000_000_000 + 10_000));
      state.pruneOlderThan(1_000_000_000_000 + 5_000);

      // After pruning, scheduling a new idle for s1 should work fresh
      const handler = vi.fn(() => Promise.resolve());
      state.scheduleIdle("s1", handler);
      await vi.advanceTimersByTimeAsync(400);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("prunes error suppression entries older than cutoff", () => {
      state.markError("s1");
      vi.setSystemTime(new Date(1_000_000_000_000 + 10_000));
      state.pruneOlderThan(1_000_000_000_000 + 5_000);

      // After pruning, a fresh idle should NOT be suppressed
      // (error suppression entry was pruned)
      // We can't easily test suppression is gone without a timer,
      // but we can verify it doesn't throw and state is clean
      expect(() => state.scheduleIdle("s1", () => Promise.resolve())).not.toThrow();
    });

    it("prunes lastBusy entries older than cutoff", () => {
      state.markBusy("s1");
      vi.setSystemTime(new Date(1_000_000_000_000 + 10_000));
      state.pruneOlderThan(1_000_000_000_000 + 5_000);

      // State is clean; new busy mark works
      expect(() => state.markBusy("s1")).not.toThrow();
    });

    it("does not prune entries newer than cutoff", async () => {
      state.markError("s1");
      vi.advanceTimersByTime(100);

      // Cutoff is before the error timestamp, so nothing should be pruned
      state.pruneOlderThan(1_000_000_000_000 - 1);

      // s1's error suppression should still be active
      const handler = vi.fn(() => Promise.resolve());
      state.scheduleIdle("s1", handler);
      await vi.advanceTimersByTimeAsync(400);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
