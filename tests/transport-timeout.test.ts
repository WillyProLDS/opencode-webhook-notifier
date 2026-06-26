import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebhookSender, type WebhookSender } from "../src/transport/send.js";

const FLUSH = 1100;

function mockFetchOk() {
  return vi.fn().mockResolvedValue(new Response("", { status: 200, statusText: "OK" }));
}

describe("WebhookSender HTTP timeout", () => {
  let originalFetch: typeof globalThis.fetch;
  let sender: WebhookSender;

  beforeEach(() => {
    vi.useFakeTimers();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    sender.dispose();
    vi.restoreAllMocks();
  });

  it("passes AbortSignal with configured timeoutMs to fetch", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender = createWebhookSender({ timeoutMs: 5000 });
    sender.send([{ type: "discord", url: "https://discord.example/hook" }], "T", "M", "complete");
    await vi.advanceTimersByTimeAsync(FLUSH);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const signal = init.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
  });

  it("does not set signal when timeoutMs is undefined", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender = createWebhookSender();
    sender.send([{ type: "discord", url: "https://discord.example/hook" }], "T", "M", "complete");
    await vi.advanceTimersByTimeAsync(FLUSH);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeUndefined();
  });

  it("does not set signal when timeoutMs is 0", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender = createWebhookSender({ timeoutMs: 0 });
    sender.send([{ type: "discord", url: "https://discord.example/hook" }], "T", "M", "complete");
    await vi.advanceTimersByTimeAsync(FLUSH);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeUndefined();
  });

  it("passes AbortSignal to ntfy fetch (non-postJson path)", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender = createWebhookSender({ timeoutMs: 3000 });
    sender.send([{ type: "ntfy", url: "https://ntfy.sh/topic" }], "T", "M", "complete");
    await vi.advanceTimersByTimeAsync(FLUSH);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("passes AbortSignal to generic fetch", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender = createWebhookSender({ timeoutMs: 3000 });
    sender.send([{ type: "generic", url: "https://example.com/hook" }], "T", "M", "complete", {
      context: {
        event: "complete",
        timestamp: "12:00",
        turn: 1,
        sessionTitle: null,
        agentName: null,
        projectName: "p",
      },
    });
    await vi.advanceTimersByTimeAsync(FLUSH);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("WebhookSender session-scoped debounce", () => {
  let originalFetch: typeof globalThis.fetch;
  let sender: WebhookSender;

  beforeEach(() => {
    vi.useFakeTimers();
    originalFetch = globalThis.fetch;
    sender = createWebhookSender();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    sender.dispose();
    vi.restoreAllMocks();
  });

  it("debounces same-session same-event into one fetch", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const target = { type: "discord" as const, url: "https://discord.example/hook" };
    sender.send([target], "T1", "M1", "complete", { sessionID: "session-A" });
    await vi.advanceTimersByTimeAsync(500);
    sender.send([target], "T2", "M2", "complete", { sessionID: "session-A" });
    await vi.advanceTimersByTimeAsync(FLUSH);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT coalesce different sessions with same event type", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const target = { type: "discord" as const, url: "https://discord.example/hook" };
    sender.send([target], "T1", "M1", "complete", { sessionID: "session-A" });
    await vi.advanceTimersByTimeAsync(500);
    sender.send([target], "T2", "M2", "complete", { sessionID: "session-B" });
    await vi.advanceTimersByTimeAsync(FLUSH);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to global key when sessionID is null (coalesces across null sessions)", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const target = { type: "discord" as const, url: "https://discord.example/hook" };
    sender.send([target], "T1", "M1", "complete", { sessionID: null });
    await vi.advanceTimersByTimeAsync(500);
    sender.send([target], "T2", "M2", "complete", { sessionID: null });
    await vi.advanceTimersByTimeAsync(FLUSH);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
