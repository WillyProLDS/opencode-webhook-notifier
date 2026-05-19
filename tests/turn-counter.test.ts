import { describe, expect, it } from "vitest";
import { createTurnCounter } from "../src/plugin/turn-counter.js";

describe("createTurnCounter", () => {
  it("starts at 1 by default", () => {
    const c = createTurnCounter();
    expect(c.next()).toBe(1);
    expect(c.next()).toBe(2);
  });

  it("respects custom start", () => {
    const c = createTurnCounter(99);
    expect(c.next()).toBe(100);
    expect(c.next()).toBe(101);
  });

  it("does not persist between instances (in-memory only)", () => {
    const a = createTurnCounter();
    a.next();
    a.next();
    a.next();

    const b = createTurnCounter();
    expect(b.next()).toBe(1);
  });
});
