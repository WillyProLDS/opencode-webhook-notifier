import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPermissionDedupe, type PermissionDedupe } from "../src/plugin/permission-dedupe.js";

describe("createPermissionDedupe", () => {
  let dedupe: PermissionDedupe;

  beforeEach(() => {
    dedupe = createPermissionDedupe();
  });

  afterEach(() => {
    dedupe.reset();
  });

  describe("shouldSuppress", () => {
    it("returns false on first call (no prior state)", () => {
      expect(dedupe.shouldSuppress("session-1", 1_000_000)).toBe(false);
    });

    it("suppresses second call within 1000 ms (same session)", () => {
      dedupe.shouldSuppress("session-1", 1_000_000);
      expect(dedupe.shouldSuppress("session-1", 1_000_500)).toBe(true);
    });

    it("does NOT suppress at exactly 1000 ms", () => {
      dedupe.shouldSuppress("session-1", 1_000_000);
      expect(dedupe.shouldSuppress("session-1", 1_001_000)).toBe(false);
    });

    it("does NOT suppress just after 1000 ms", () => {
      dedupe.shouldSuppress("session-1", 1_000_000);
      expect(dedupe.shouldSuppress("session-1", 1_001_001)).toBe(false);
    });

    it("global tracking suppresses across different sessions within window", () => {
      dedupe.shouldSuppress("session-A", 1_000_000);
      expect(dedupe.shouldSuppress("session-B", 1_000_500)).toBe(true);
    });

    it("global tracking releases after 1000 ms across sessions", () => {
      dedupe.shouldSuppress("session-A", 1_000_000);
      expect(dedupe.shouldSuppress("session-B", 1_001_001)).toBe(false);
    });

    it("treats null sessionID as global only", () => {
      dedupe.shouldSuppress(null, 1_000_000);
      expect(dedupe.shouldSuppress(null, 1_000_500)).toBe(true);
      expect(dedupe.shouldSuppress(null, 1_001_001)).toBe(false);
    });

    it("non-suppressed call updates the timestamp baseline", () => {
      dedupe.shouldSuppress("session-1", 1_000_000);
      dedupe.shouldSuppress("session-1", 1_002_000);
      expect(dedupe.shouldSuppress("session-1", 1_002_500)).toBe(true);
    });
  });

  describe("prune", () => {
    it("removes session entries with timestamp < cutoff", () => {
      dedupe.shouldSuppress("session-old", 1_000_000);

      dedupe.prune(1_500_000);

      expect(dedupe.shouldSuppress("session-old", 1_500_001)).toBe(false);
    });

    it("retains session entries with timestamp >= cutoff", () => {
      dedupe.shouldSuppress("session-fresh", 2_000_000);

      dedupe.prune(1_500_000);

      expect(dedupe.shouldSuppress("session-fresh", 2_000_500)).toBe(true);
    });

    it("clears global timestamp if older than cutoff", () => {
      dedupe.shouldSuppress(null, 1_000_000);

      dedupe.prune(1_500_000);

      expect(dedupe.shouldSuppress("session-X", 1_500_001)).toBe(false);
    });
  });

  describe("reset", () => {
    it("clears all session and global state", () => {
      dedupe.shouldSuppress("session-1", 1_000_000);
      dedupe.shouldSuppress(null, 1_000_000);

      dedupe.reset();

      expect(dedupe.shouldSuppress("session-1", 1_000_500)).toBe(false);
      expect(dedupe.shouldSuppress(null, 1_000_500)).toBe(true);
    });
  });

  describe("custom window", () => {
    it("respects custom windowMs option", () => {
      const custom = createPermissionDedupe({ windowMs: 500 });
      custom.shouldSuppress("s", 1_000_000);
      expect(custom.shouldSuppress("s", 1_000_400)).toBe(true);
      expect(custom.shouldSuppress("s", 1_000_600)).toBe(false);
    });
  });
});
