import { describe, expect, it } from "vitest";
import { createCircuitBreaker } from "../src/util/circuit-breaker.js";

describe("createCircuitBreaker", () => {
  it("starts in closed state and allows", () => {
    const cb = createCircuitBreaker();
    expect(cb.state()).toBe("closed");
    expect(cb.allow()).toBe(true);
  });

  it("opens after failureThreshold consecutive failures", () => {
    const now = 1000;
    const cb = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 100, now: () => now });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state()).toBe("closed");
    cb.recordFailure();
    expect(cb.state()).toBe("open");
    expect(cb.allow()).toBe(false);
  });

  it("transitions to half-open after cooldown", () => {
    let now = 1000;
    const cb = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 50, now: () => now });
    cb.recordFailure();
    expect(cb.state()).toBe("open");

    now = 1100;
    expect(cb.allow()).toBe(true);
    expect(cb.state()).toBe("half-open");
  });

  it("recordSuccess closes from half-open", () => {
    let now = 1000;
    const cb = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 50, now: () => now });
    cb.recordFailure();
    now = 1100;
    cb.allow();
    cb.recordSuccess();
    expect(cb.state()).toBe("closed");
  });

  it("recordFailure in half-open re-opens immediately", () => {
    let now = 1000;
    const cb = createCircuitBreaker({ failureThreshold: 5, cooldownMs: 50, now: () => now });
    for (let i = 0; i < 5; i += 1) cb.recordFailure();
    expect(cb.state()).toBe("open");

    now = 1100;
    cb.allow();
    expect(cb.state()).toBe("half-open");
    cb.recordFailure();
    expect(cb.state()).toBe("open");
  });

  it("recordSuccess resets counter without going through half-open", () => {
    const now = 1000;
    const cb = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 100, now: () => now });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state()).toBe("closed");
  });
});
