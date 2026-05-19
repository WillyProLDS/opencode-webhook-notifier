import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncer } from "../src/util/debounce.js";

describe("createDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("invokes fn after default delay", async () => {
    const debouncer = createDebouncer(100);
    const fn = vi.fn();

    debouncer.schedule("k", fn);
    await vi.advanceTimersByTimeAsync(99);
    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("collapses repeated schedules under same key", async () => {
    const debouncer = createDebouncer(100);
    const fn = vi.fn();

    debouncer.schedule("k", fn);
    await vi.advanceTimersByTimeAsync(50);
    debouncer.schedule("k", fn);
    await vi.advanceTimersByTimeAsync(50);
    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("treats different keys independently", async () => {
    const debouncer = createDebouncer(100);
    const a = vi.fn();
    const b = vi.fn();

    debouncer.schedule("a", a);
    debouncer.schedule("b", b);
    await vi.advanceTimersByTimeAsync(100);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("cancel removes pending fn", async () => {
    const debouncer = createDebouncer(100);
    const fn = vi.fn();

    debouncer.schedule("k", fn);
    debouncer.cancel("k");
    await vi.advanceTimersByTimeAsync(200);

    expect(fn).not.toHaveBeenCalled();
  });

  it("cancelAll cancels every key", async () => {
    const debouncer = createDebouncer(100);
    const a = vi.fn();
    const b = vi.fn();

    debouncer.schedule("a", a);
    debouncer.schedule("b", b);
    debouncer.cancelAll();
    await vi.advanceTimersByTimeAsync(200);

    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("schedule with custom delay overrides default", async () => {
    const debouncer = createDebouncer(1000);
    const fn = vi.fn();

    debouncer.schedule("k", fn, 50);
    await vi.advanceTimersByTimeAsync(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
