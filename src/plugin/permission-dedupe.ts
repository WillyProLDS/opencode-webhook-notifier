import type { PermissionDetails } from "../config/schema.js";

const DEFAULT_DEDUPE_WINDOW_MS = 5000;

export interface PermissionDedupe {
  shouldSuppress(sessionID: string | null, permission?: PermissionDetails | null, now?: number): boolean;
  prune(cutoffMs: number): void;
  reset(): void;
}

export interface PermissionDedupeOptions {
  windowMs?: number;
}

function buildPermissionKey(sessionID: string | null, permission?: PermissionDetails | null): string {
  if (permission?.id) {
    return `id:${permission.id}`;
  }

  if (permission) {
    const permType = permission.permission ?? "";
    const patterns = (permission.patterns ?? []).join(",");
    const meta = permission.metadata ? JSON.stringify(permission.metadata) : "";
    return `sig:${sessionID ?? "global"}:${permType}:${patterns}:${meta}`;
  }

  return `ses:${sessionID ?? "global"}`;
}

export function createPermissionDedupe(options: PermissionDedupeOptions = {}): PermissionDedupe {
  const windowMs = options.windowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const seenAt = new Map<string, number>();

  return {
    shouldSuppress(sessionID, permission = null, now = Date.now()) {
      const key = buildPermissionKey(sessionID, permission);
      const lastSeen = seenAt.get(key) ?? 0;
      const isDuplicate = lastSeen > 0 && now - lastSeen < windowMs;

      if (isDuplicate) return true;

      seenAt.set(key, now);
      return false;
    },
    prune(cutoffMs) {
      for (const [key, ts] of seenAt) {
        if (ts < cutoffMs) seenAt.delete(key);
      }
    },
    reset() {
      seenAt.clear();
    },
  };
}
