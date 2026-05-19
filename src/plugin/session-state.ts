export const DEFAULT_IDLE_DELAY_MS = 350;

export type IdleHandler = () => Promise<void>;

export interface SessionState {
  markBusy(sessionID: string): void;
  markError(sessionID: string | null): void;
  scheduleIdle(sessionID: string, handler: IdleHandler): void;
  clearIdle(sessionID: string): void;
  pruneOlderThan(cutoffMs: number): void;
  dispose(): void;
}

export interface SessionStateOptions {
  idleDelayMs?: number;
  onIdleError?: (error: unknown) => void;
}

export function createSessionState(options: SessionStateOptions = {}): SessionState {
  const idleDelayMs = options.idleDelayMs ?? DEFAULT_IDLE_DELAY_MS;
  const onIdleError = options.onIdleError ?? (() => undefined);

  const pendingIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const sessionIdleSequence = new Map<string, number>();
  const sessionErrorSuppressionAt = new Map<string, number>();
  const sessionLastBusyAt = new Map<string, number>();

  function clearPendingIdleTimer(sessionID: string): void {
    const timer = pendingIdleTimers.get(sessionID);
    if (timer === undefined) return;
    clearTimeout(timer);
    pendingIdleTimers.delete(sessionID);
  }

  function bumpSequence(sessionID: string): number {
    const next = (sessionIdleSequence.get(sessionID) ?? 0) + 1;
    sessionIdleSequence.set(sessionID, next);
    return next;
  }

  function hasCurrentSequence(sessionID: string, sequence: number): boolean {
    return sessionIdleSequence.get(sessionID) === sequence;
  }

  function shouldSuppressIdle(sessionID: string): boolean {
    const errorAt = sessionErrorSuppressionAt.get(sessionID);
    if (errorAt === undefined) return false;

    const busyAt = sessionLastBusyAt.get(sessionID);
    if (typeof busyAt === "number" && busyAt > errorAt) {
      sessionErrorSuppressionAt.delete(sessionID);
      return false;
    }

    sessionErrorSuppressionAt.delete(sessionID);
    return true;
  }

  return {
    markBusy(sessionID) {
      sessionLastBusyAt.set(sessionID, Date.now());
      sessionErrorSuppressionAt.delete(sessionID);
      bumpSequence(sessionID);
      clearPendingIdleTimer(sessionID);
    },
    markError(sessionID) {
      if (!sessionID) return;
      sessionErrorSuppressionAt.set(sessionID, Date.now());
      bumpSequence(sessionID);
      clearPendingIdleTimer(sessionID);
    },
    scheduleIdle(sessionID, handler) {
      clearPendingIdleTimer(sessionID);
      const sequence = bumpSequence(sessionID);

      const timer = setTimeout(() => {
        pendingIdleTimers.delete(sessionID);
        if (!hasCurrentSequence(sessionID, sequence)) return;
        if (shouldSuppressIdle(sessionID)) return;
        Promise.resolve()
          .then(() => handler())
          .catch(onIdleError);
      }, idleDelayMs);

      pendingIdleTimers.set(sessionID, timer);
    },
    clearIdle(sessionID) {
      clearPendingIdleTimer(sessionID);
    },
    pruneOlderThan(cutoffMs) {
      for (const [id] of sessionIdleSequence) {
        if (!pendingIdleTimers.has(id)) sessionIdleSequence.delete(id);
      }
      for (const [id, ts] of sessionErrorSuppressionAt) {
        if (ts < cutoffMs) sessionErrorSuppressionAt.delete(id);
      }
      for (const [id, ts] of sessionLastBusyAt) {
        if (ts < cutoffMs) sessionLastBusyAt.delete(id);
      }
    },
    dispose() {
      for (const timer of pendingIdleTimers.values()) clearTimeout(timer);
      pendingIdleTimers.clear();
      sessionIdleSequence.clear();
      sessionErrorSuppressionAt.clear();
      sessionLastBusyAt.clear();
    },
  };
}
