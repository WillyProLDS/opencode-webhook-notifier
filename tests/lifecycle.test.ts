import { describe, expect, it, vi } from "vitest";
import { createLifecycle } from "../src/plugin/lifecycle.js";

describe("createLifecycle", () => {
  it("calls disposers in reverse-registration order on dispose", () => {
    const lc = createLifecycle();
    const order: string[] = [];

    lc.register(() => order.push("a"));
    lc.register(() => order.push("b"));
    lc.register(() => order.push("c"));

    lc.dispose();
    expect(order).toEqual(["c", "b", "a"]);
  });

  it("dispose is idempotent", () => {
    const lc = createLifecycle();
    const fn = vi.fn();
    lc.register(fn);

    lc.dispose();
    lc.dispose();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("registering after dispose immediately runs the disposer", () => {
    const lc = createLifecycle();
    lc.dispose();

    const fn = vi.fn();
    lc.register(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("swallows errors from disposers", () => {
    const lc = createLifecycle();
    lc.register(() => {
      throw new Error("boom");
    });

    expect(() => lc.dispose()).not.toThrow();
  });
});
