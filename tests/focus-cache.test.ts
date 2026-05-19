import { describe, expect, it, vi } from "vitest";
import { createFocusDetector } from "../src/focus/index.js";

describe("createFocusDetector", () => {
  it("caches focus result for the configured window", () => {
    let probe = 0;
    const fakeNow = vi.fn(() => probe);

    const detector = createFocusDetector({ cacheMs: 250, now: fakeNow });

    probe = 1000;
    const a = detector.isTerminalFocused();

    probe = 1100;
    const b = detector.isTerminalFocused();

    probe = 1200;
    const c = detector.isTerminalFocused();

    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("re-evaluates after cacheMs", () => {
    let probe = 0;
    const fakeNow = vi.fn(() => probe);

    const detector = createFocusDetector({ cacheMs: 100, now: fakeNow });

    probe = 0;
    detector.isTerminalFocused();

    probe = 50;
    detector.isTerminalFocused();

    probe = 200;
    detector.isTerminalFocused();

    expect(fakeNow.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("invalidate() forces a fresh probe", () => {
    const probe = 0;
    const fakeNow = vi.fn(() => probe);
    const detector = createFocusDetector({ cacheMs: 60_000, now: fakeNow });

    detector.isTerminalFocused();
    detector.invalidate();
    detector.isTerminalFocused();

    expect(fakeNow.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
