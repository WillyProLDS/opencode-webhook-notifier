export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  random?: () => number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  getRetryDelay?: (error: unknown, attempt: number) => number | undefined;
  onAttempt?: (attempt: number, error: unknown) => void;
}

export function computeBackoff(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  jitter: boolean,
  random: () => number,
): number {
  const exp = Math.min(maxDelayMs, initialDelayMs * 2 ** (attempt - 1));
  if (!jitter) return exp;
  const minFloor = Math.floor(exp / 2);
  return minFloor + Math.floor(random() * (exp - minFloor + 1));
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const jitter = options.jitter ?? true;
  const random = options.random ?? Math.random;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const getRetryDelay = options.getRetryDelay;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      options.onAttempt?.(attempt, error);
      if (attempt >= maxAttempts) break;
      if (!shouldRetry(error, attempt)) break;
      const customDelay = getRetryDelay?.(error, attempt);
      const delay =
        typeof customDelay === "number" && customDelay >= 0
          ? Math.min(maxDelayMs, customDelay)
          : computeBackoff(attempt, initialDelayMs, maxDelayMs, jitter, random);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
