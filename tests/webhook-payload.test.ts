import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebhookTarget } from "../src/config/schema.js";
import { createWebhookSender, type WebhookSender } from "../src/transport/send.js";

const FLUSH = 1100;

function mockFetchOk() {
  return vi.fn().mockResolvedValue(new Response("", { status: 200, statusText: "OK" }));
}

function mockFetchFail(status = 500, body = "boom") {
  return vi.fn().mockResolvedValue(new Response(body, { status, statusText: "Server Error" }));
}

describe("WebhookSender", () => {
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

  describe("Discord", () => {
    it("posts JSON with content + embeds payload", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const target: WebhookTarget = { type: "discord", url: "https://discord.example/hook" };

      sender.send([target], "OpenCode (demo)", "Session has finished", "complete");
      await vi.advanceTimersByTimeAsync(FLUSH);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://discord.example/hook");
      expect(init.method).toBe("POST");
      expect(init.headers["Content-Type"]).toBe("application/json");
      const body = JSON.parse(init.body as string);
      expect(body.content).toBe("**OpenCode (demo)**\nSession has finished");
      expect(body.embeds).toHaveLength(1);
      expect(body.embeds[0]).toMatchObject({
        title: "OpenCode (demo)",
        description: "Session has finished",
        color: 0x5865f2,
        footer: { text: "OpenCode Webhook Notifier" },
      });
    });

    it("applies username and avatar overrides", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send(
        [
          {
            type: "discord",
            url: "https://discord.example/hook",
            username: "Bot",
            avatarUrl: "https://example.com/a.png",
          },
        ],
        "T",
        "M",
        "complete",
      );
      await vi.advanceTimersByTimeAsync(FLUSH);

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
      expect(body.username).toBe("Bot");
      expect(body.avatar_url).toBe("https://example.com/a.png");
    });

    it("applies event-level color override", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send([{ type: "discord", url: "https://x" }], "T", "M", "error", { overrides: { color: 0xff0000 } });
      await vi.advanceTimersByTimeAsync(FLUSH);

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
      expect(body.embeds[0].color).toBe(0xff0000);
    });
  });

  describe("ntfy", () => {
    it("sends body as text and applies Title header", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send([{ type: "ntfy", url: "https://ntfy.sh/topic" }], "Title here", "Body here", "complete");
      await vi.advanceTimersByTimeAsync(FLUSH);

      const [, init] = fetchMock.mock.calls[0]!;
      expect(init.method).toBe("POST");
      expect(init.body).toBe("Body here");
      expect(init.headers.Title).toBe("Title here");
      expect(init.headers.Priority).toBeUndefined();
      expect(init.headers.Tags).toBeUndefined();
    });

    it("sends Priority header when set on target", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send([{ type: "ntfy", url: "https://ntfy.sh/topic", priority: 4 }], "T", "M", "permission");
      await vi.advanceTimersByTimeAsync(FLUSH);

      expect(fetchMock.mock.calls[0]![1].headers.Priority).toBe("4");
    });

    it("sends Tags header when set", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send([{ type: "ntfy", url: "https://ntfy.sh/topic", tags: ["urgent", "x"] }], "T", "M", "error");
      await vi.advanceTimersByTimeAsync(FLUSH);

      expect(fetchMock.mock.calls[0]![1].headers.Tags).toBe("urgent,x");
    });

    it("event override priority/tags wins over target defaults", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send([{ type: "ntfy", url: "https://ntfy.sh/topic", priority: 1, tags: ["a"] }], "T", "M", "error", {
        overrides: { priority: 5, tags: ["urgent"] },
      });
      await vi.advanceTimersByTimeAsync(FLUSH);

      const headers = fetchMock.mock.calls[0]![1].headers;
      expect(headers.Priority).toBe("5");
      expect(headers.Tags).toBe("urgent");
    });

    it("applies basicAuth as Authorization header", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send(
        [
          {
            type: "ntfy",
            url: "https://ntfy.sh/topic",
            basicAuth: { username: "user", password: "pass" },
          },
        ],
        "T",
        "M",
        "complete",
      );
      await vi.advanceTimersByTimeAsync(FLUSH);

      expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe(`Basic ${btoa("user:pass")}`);
    });
  });

  describe("Gotify", () => {
    it("appends token as query param when not already present", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send([{ type: "gotify", url: "https://gotify.example/message", token: "abc 123" }], "T", "M", "complete");
      await vi.advanceTimersByTimeAsync(FLUSH);

      expect(fetchMock.mock.calls[0]![0]).toBe("https://gotify.example/message?token=abc%20123");
    });

    it("does not double-append token already in URL", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send(
        [{ type: "gotify", url: "https://gotify.example/message?token=existing", token: "abc" }],
        "T",
        "M",
        "complete",
      );
      await vi.advanceTimersByTimeAsync(FLUSH);

      expect(fetchMock.mock.calls[0]![0]).toBe("https://gotify.example/message?token=existing");
    });

    it("uses default priority 5 and per-event gotifyPriority override", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send([{ type: "gotify", url: "https://gotify.example/message" }], "T", "M", "complete");
      await vi.advanceTimersByTimeAsync(FLUSH);
      const body1 = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
      expect(body1.priority).toBe(5);

      sender.send([{ type: "gotify", url: "https://gotify.example/message" }], "T", "M", "error", {
        overrides: { gotifyPriority: 8 },
      });
      await vi.advanceTimersByTimeAsync(FLUSH);
      const body2 = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
      expect(body2.priority).toBe(8);
    });
  });

  describe("debounce + fan-out", () => {
    it("debounces multiple sends of the same event within 1s into one fetch per target", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const target: WebhookTarget = { type: "discord", url: "https://discord.example/hook" };

      sender.send([target], "T1", "M1", "complete");
      await vi.advanceTimersByTimeAsync(500);
      sender.send([target], "T2", "M2", "complete");
      await vi.advanceTimersByTimeAsync(500);
      sender.send([target], "T3", "M3", "complete");
      await vi.advanceTimersByTimeAsync(FLUSH);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
      expect(body.embeds[0].title).toBe("T3");
    });

    it("fans out to all targets in parallel", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send(
        [
          { type: "discord", url: "https://discord.example/hook" },
          { type: "ntfy", url: "https://ntfy.sh/topic" },
          { type: "gotify", url: "https://gotify.example/message", token: "t" },
        ],
        "T",
        "M",
        "complete",
      );
      await vi.advanceTimersByTimeAsync(FLUSH);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      const urls = fetchMock.mock.calls.map((c) => c[0]!).sort();
      expect(urls).toEqual([
        "https://discord.example/hook",
        "https://gotify.example/message?token=t",
        "https://ntfy.sh/topic",
      ]);
    });

    it("returns immediately on empty targets array", async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      sender.send([], "T", "M", "complete");
      await vi.advanceTimersByTimeAsync(FLUSH);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("logs but does not throw when a target fails", async () => {
      globalThis.fetch = mockFetchFail() as unknown as typeof globalThis.fetch;

      const errorLines: string[] = [];
      const sinkSender = createWebhookSender({
        logger: {
          debug: () => undefined,
          info: () => undefined,
          warn: () => undefined,
          error: (msg) => {
            errorLines.push(msg);
          },
        },
      });

      sinkSender.send([{ type: "discord", url: "https://discord.example/hook" }], "T", "M", "complete");
      await vi.advanceTimersByTimeAsync(FLUSH);
      await vi.runAllTimersAsync();

      expect(errorLines.length).toBeGreaterThan(0);
      sinkSender.dispose();
    });
  });
});
