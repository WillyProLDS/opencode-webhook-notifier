import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PermissionDetails } from "../src/config/schema.js";
import { createPermissionDedupe, type PermissionDedupe } from "../src/plugin/permission-dedupe.js";

describe("createPermissionDedupe", () => {
  let dedupe: PermissionDedupe;

  beforeEach(() => {
    dedupe = createPermissionDedupe({ windowMs: 1000 });
  });

  afterEach(() => {
    dedupe.reset();
  });

  describe("shouldSuppress with permission IDs and content", () => {
    it("does NOT suppress different permissions in the same session in rapid succession", () => {
      const perm1: PermissionDetails = {
        id: "perm_1",
        permission: "bash",
        patterns: ["node scripts/utils.js"],
      };
      const perm2: PermissionDetails = {
        id: "perm_2",
        permission: "bash",
        patterns: ["for file in ..."],
      };

      expect(dedupe.shouldSuppress("session-1", perm1, 1_000_000)).toBe(false);
      // Fired only 50ms later (e.g. loop or subagent)
      expect(dedupe.shouldSuppress("session-1", perm2, 1_000_050)).toBe(false);
    });

    it("suppresses the SAME permission ID within the window", () => {
      const perm1: PermissionDetails = {
        id: "perm_1",
        permission: "bash",
        patterns: ["node scripts/utils.js"],
      };

      expect(dedupe.shouldSuppress("session-1", perm1, 1_000_000)).toBe(false);
      // Duplicate event from hook + event stream
      expect(dedupe.shouldSuppress("session-1", perm1, 1_000_100)).toBe(true);
    });

    it("deduplicates by signature when permission has no id", () => {
      const permA: PermissionDetails = {
        permission: "bash",
        patterns: ["node test.js"],
      };
      const permB: PermissionDetails = {
        permission: "bash",
        patterns: ["node other.js"],
      };

      expect(dedupe.shouldSuppress("session-1", permA, 1_000_000)).toBe(false);
      // Different command -> not suppressed
      expect(dedupe.shouldSuppress("session-1", permB, 1_000_100)).toBe(false);
      // Same command -> suppressed
      expect(dedupe.shouldSuppress("session-1", permA, 1_000_200)).toBe(true);
    });
  });

  describe("fallback without permission object", () => {
    it("returns false on first call and true on immediate second call", () => {
      expect(dedupe.shouldSuppress("session-1", null, 1_000_000)).toBe(false);
      expect(dedupe.shouldSuppress("session-1", null, 1_000_500)).toBe(true);
      expect(dedupe.shouldSuppress("session-1", null, 1_001_500)).toBe(false);
    });
  });

  describe("prune", () => {
    it("removes entries with timestamp < cutoff", () => {
      const perm1: PermissionDetails = { id: "perm_old" };
      dedupe.shouldSuppress("session-1", perm1, 1_000_000);

      dedupe.prune(1_500_000);

      expect(dedupe.shouldSuppress("session-1", perm1, 1_500_001)).toBe(false);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      const perm1: PermissionDetails = { id: "perm_1" };
      dedupe.shouldSuppress("session-1", perm1, 1_000_000);

      dedupe.reset();

      expect(dedupe.shouldSuppress("session-1", perm1, 1_000_500)).toBe(false);
    });
  });
});
