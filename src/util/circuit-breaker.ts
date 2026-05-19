export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreaker {
  allow(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
  state(): CircuitState;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

export function createCircuitBreaker(options: CircuitBreakerOptions = {}): CircuitBreaker {
  const failureThreshold = options.failureThreshold ?? 5;
  const cooldownMs = options.cooldownMs ?? 60_000;
  const now = options.now ?? Date.now;

  let state: CircuitState = "closed";
  let consecutiveFailures = 0;
  let openedAt = 0;

  function evaluateState(): CircuitState {
    if (state === "open" && now() - openedAt >= cooldownMs) {
      state = "half-open";
    }
    return state;
  }

  return {
    allow() {
      return evaluateState() !== "open";
    },
    recordSuccess() {
      consecutiveFailures = 0;
      state = "closed";
    },
    recordFailure() {
      consecutiveFailures += 1;
      if (state === "half-open" || consecutiveFailures >= failureThreshold) {
        state = "open";
        openedAt = now();
      }
    },
    state() {
      return evaluateState();
    },
  };
}
