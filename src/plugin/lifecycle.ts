export interface Lifecycle {
  register(disposer: () => void): void;
  dispose(): void;
}

export function createLifecycle(): Lifecycle {
  const disposers: Array<() => void> = [];
  let disposed = false;

  return {
    register(disposer) {
      if (disposed) {
        try {
          disposer();
        } catch {}
        return;
      }
      disposers.push(disposer);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      while (disposers.length > 0) {
        const d = disposers.pop();
        if (!d) continue;
        try {
          d();
        } catch {}
      }
    },
  };
}
