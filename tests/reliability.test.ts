import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebhookSender } from "../src/transport/send.js";

const FLUSH = 1100;

function mockOk() {
  return new Response("", { status: 200, statusText: "OK" });
}
function mockFail() {
  return new Response("boom", { status: 500, statusText: "Server Error" });
}

describe("WebhookSender reliability", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("retries failing target up to configured maxAttempts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFail())
      .mockResolvedValueOnce(mockFail())
      .mockResolvedValue(mockOk());
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const sender = createWebhookSender({
      defaultRetry: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 },
    });

    sender.send([{ type: "discord", url: "https://discord.example/hook" }], "T", "M", "complete");
    await vi.advanceTimersByTimeAsync(FLUSH);
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(100);
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    sender.dispose();
  });

  it("opens circuit and skips after threshold of consecutive failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFail());
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const sender = createWebhookSender({
      defaultRetry: { maxAttempts: 1, initialDelayMs: 1, maxDelayMs: 5 },
      defaultCircuit: { failureThreshold: 2, cooldownMs: 60_000 },
    });

    const target = { type: "discord" as const, url: "https://discord.example/hook" };

    sender.send([target], "T", "M", "complete");
    await vi.advanceTimersByTimeAsync(FLUSH);
    await vi.runAllTimersAsync();

    sender.send([target], "T", "M", "permission");
    await vi.advanceTimersByTimeAsync(FLUSH);
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();
    sender.send([target], "T", "M", "error");
    await vi.advanceTimersByTimeAsync(FLUSH);
    await vi.runAllTimersAsync();

    expect(fetchMock).not.toHaveBeenCalled();
    sender.dispose();
  });

  it("isolates circuit per target identity", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("bad")) return Promise.resolve(mockFail());
      return Promise.resolve(mockOk());
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const sender = createWebhookSender({
      defaultRetry: { maxAttempts: 1, initialDelayMs: 1, maxDelayMs: 5 },
      defaultCircuit: { failureThreshold: 1, cooldownMs: 60_000 },
    });

    const bad = { type: "discord" as const, url: "https://bad.example/hook" };
    const good = { type: "discord" as const, url: "https://good.example/hook" };

    sender.send([bad], "T", "M", "complete");
    await vi.advanceTimersByTimeAsync(FLUSH);
    await vi.runAllTimersAsync();

    fetchMock.mockClear();
    sender.send([good], "T", "M", "permission");
    await vi.advanceTimersByTimeAsync(FLUSH);
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://good.example/hook");
    sender.dispose();
  });

  it("respects per-target retry override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFail());
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const sender = createWebhookSender({
      defaultRetry: { maxAttempts: 5, initialDelayMs: 1, maxDelayMs: 5 },
      defaultCircuit: { failureThreshold: 100, cooldownMs: 60_000 },
    });

    sender.send(
      [
        {
          type: "discord",
          url: "https://discord.example/hook",
          retry: { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 5 },
        },
      ],
      "T",
      "M",
      "complete",
    );
    await vi.advanceTimersByTimeAsync(FLUSH);
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    sender.dispose();
  });
});
