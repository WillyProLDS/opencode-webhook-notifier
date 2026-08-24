import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeBackoff, withRetry } from "../src/util/retry.js";

describe("computeBackoff", () => {
  it("doubles per attempt without jitter", () => {
    expect(computeBackoff(1, 100, 10_000, false, () => 0)).toBe(100);
    expect(computeBackoff(2, 100, 10_000, false, () => 0)).toBe(200);
    expect(computeBackoff(3, 100, 10_000, false, () => 0)).toBe(400);
  });

  it("caps at maxDelayMs", () => {
    expect(computeBackoff(20, 100, 5_000, false, () => 0)).toBe(5_000);
  });

  it("with jitter, returns value in [floor(exp/2), exp]", () => {
    const v = computeBackoff(3, 100, 10_000, true, () => 0.5);
    expect(v).toBeGreaterThanOrEqual(200);
    expect(v).toBeLessThanOrEqual(400);
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure up to maxAttempts", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail-1"))
      .mockRejectedValueOnce(new Error("fail-2"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 10, jitter: false });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws last error after exhausting attempts", async () => {
    const err = new Error("fatal");
    const fn = vi.fn().mockRejectedValue(err);

    const promise = withRetry(fn, { maxAttempts: 2, initialDelayMs: 5, jitter: false });
    promise.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(5);
    await expect(promise).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects shouldRetry guard", async () => {
    const err = new Error("nope");
    const fn = vi.fn().mockRejectedValue(err);

    const promise = withRetry(fn, {
      maxAttempts: 5,
      initialDelayMs: 5,
      jitter: false,
      shouldRetry: () => false,
    });
    await expect(promise).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects getRetryDelay for dynamic retry intervals", async () => {
    const errorWithDelay = { name: "CustomRateLimit", retryAfterMs: 300 };
    const fn = vi.fn().mockRejectedValueOnce(errorWithDelay).mockResolvedValue("success");

    const promise = withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 10,
      getRetryDelay: (err) => (err as { retryAfterMs?: number }).retryAfterMs,
    });

    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("calls onAttempt with attempt number and error", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("e1")).mockResolvedValue("ok");
    const onAttempt = vi.fn();

    const promise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 5, jitter: false, onAttempt });
    await vi.advanceTimersByTimeAsync(5);
    await promise;

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt.mock.calls[0]?.[0]).toBe(1);
  });
});
