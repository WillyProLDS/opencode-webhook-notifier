export interface KeyedDebouncer {
  schedule(key: string, fn: () => void, delayMs?: number): void;
  cancel(key: string): void;
  cancelAll(): void;
}

export function createDebouncer(defaultDelayMs = 1000): KeyedDebouncer {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    schedule(key, fn, delayMs = defaultDelayMs) {
      const existing = timers.get(key);
      if (existing !== undefined) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          fn();
        }, delayMs),
      );
    },
    cancel(key) {
      const t = timers.get(key);
      if (t !== undefined) {
        clearTimeout(t);
        timers.delete(key);
      }
    },
    cancelAll() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
