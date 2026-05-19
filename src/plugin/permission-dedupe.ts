const DEFAULT_DEDUPE_WINDOW_MS = 1000;

export interface PermissionDedupe {
  shouldSuppress(sessionID: string | null, now?: number): boolean;
  prune(cutoffMs: number): void;
  reset(): void;
}

export interface PermissionDedupeOptions {
  windowMs?: number;
}

export function createPermissionDedupe(options: PermissionDedupeOptions = {}): PermissionDedupe {
  const windowMs = options.windowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const sessionLastAt = new Map<string, number>();
  let globalLastAt = 0;

  return {
    shouldSuppress(sessionID, now = Date.now()) {
      const sessionAt = sessionID ? sessionLastAt.get(sessionID) : undefined;
      const latestSeen = Math.max(globalLastAt, sessionAt ?? 0);
      const isDuplicate = latestSeen > 0 && now - latestSeen < windowMs;

      if (isDuplicate) return true;

      globalLastAt = now;
      if (sessionID) sessionLastAt.set(sessionID, now);
      return false;
    },
    prune(cutoffMs) {
      for (const [id, ts] of sessionLastAt) {
        if (ts < cutoffMs) sessionLastAt.delete(id);
      }
      if (globalLastAt < cutoffMs) globalLastAt = 0;
    },
    reset() {
      sessionLastAt.clear();
      globalLastAt = 0;
    },
  };
}
