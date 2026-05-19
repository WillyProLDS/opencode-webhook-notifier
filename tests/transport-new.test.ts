import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebhookSender, type WebhookSender } from "../src/transport/send.js";

const FLUSH = 1100;
const baseContext = {
  event: "complete" as const,
  timestamp: "12:34:56",
  turn: 1,
  sessionTitle: null,
  agentName: null,
  projectName: "demo",
};

function mockFetchOk() {
  return vi.fn().mockResolvedValue(new Response("", { status: 200, statusText: "OK" }));
}

describe("Telegram transport", () => {
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
  });

  it("posts to bot endpoint with chat_id and combined text", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender.send([{ type: "telegram", botToken: "TOKEN:123", chatId: "@channel" }], "OpenCode", "Hello", "complete", {
      context: baseContext,
    });
    await vi.advanceTimersByTimeAsync(FLUSH);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botTOKEN:123/sendMessage");
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe("@channel");
    expect(body.text).toContain("OpenCode");
    expect(body.text).toContain("Hello");
    expect(body.parse_mode).toBeUndefined();
  });

  it("escapes MarkdownV2 special chars when parseMode=MarkdownV2", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender.send(
      [{ type: "telegram", botToken: "T", chatId: 123, parseMode: "MarkdownV2" }],
      "Title.with.dots!",
      "Body_with_underscores",
      "complete",
      { context: baseContext },
    );
    await vi.advanceTimersByTimeAsync(FLUSH);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.parse_mode).toBe("MarkdownV2");
    expect(body.text).toContain("\\.");
    expect(body.text).toContain("\\!");
    expect(body.text).toContain("\\_");
  });

  it("escapes HTML when parseMode=HTML", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender.send([{ type: "telegram", botToken: "T", chatId: 1, parseMode: "HTML" }], "A & B", "<script>", "complete", {
      context: baseContext,
    });
    await vi.advanceTimersByTimeAsync(FLUSH);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text).toContain("&amp;");
    expect(body.text).toContain("&lt;script&gt;");
    expect(body.text).toContain("<b>");
  });

  it("truncates text exceeding 4096 chars", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const longMessage = "x".repeat(5000);
    sender.send([{ type: "telegram", botToken: "T", chatId: 1 }], "Title", longMessage, "complete", {
      context: baseContext,
    });
    await vi.advanceTimersByTimeAsync(FLUSH);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text.length).toBe(4096);
    expect(body.text.endsWith("…")).toBe(true);
  });

  it("includes message_thread_id and disable_link_preview when configured", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender.send(
      [
        {
          type: "telegram",
          botToken: "T",
          chatId: 1,
          messageThreadId: 99,
          disableLinkPreview: true,
        },
      ],
      "T",
      "M",
      "complete",
      { context: baseContext },
    );
    await vi.advanceTimersByTimeAsync(FLUSH);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.message_thread_id).toBe(99);
    expect(body.link_preview_options).toEqual({ is_disabled: true });
  });

  it("disable_notification when priority override is 0", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender.send([{ type: "telegram", botToken: "T", chatId: 1 }], "T", "M", "complete", {
      context: baseContext,
      overrides: { priority: 0 },
    });
    await vi.advanceTimersByTimeAsync(FLUSH);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.disable_notification).toBe(true);
  });
});

describe("Generic transport", () => {
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
  });

  it("posts default JSON shape when no bodyTemplate", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender.send([{ type: "generic", url: "https://example.com/hook" }], "Title", "Body", "complete", {
      context: baseContext,
    });
    await vi.advanceTimersByTimeAsync(FLUSH);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      title: "Title",
      message: "Body",
      event: "complete",
      timestamp: "12:34:56",
      turn: 1,
      projectName: "demo",
    });
  });

  it("substitutes {{placeholders}} in bodyTemplate", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender.send(
      [
        {
          type: "generic",
          url: "https://example.com/hook",
          bodyTemplate: {
            text: "[{{event}}] {{title}}: {{message}}",
            meta: { project: "{{projectName}}", turn: "{{turn}}" },
          },
        },
      ],
      "Done",
      "All good",
      "complete",
      { context: { ...baseContext, turn: 42 } },
    );
    await vi.advanceTimersByTimeAsync(FLUSH);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.text).toBe("[complete] Done: All good");
    expect(body.meta.project).toBe("demo");
    expect(body.meta.turn).toBe("42");
  });

  it("sends Authorization Bearer header when bearer is set", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender.send([{ type: "generic", url: "https://example.com/hook", bearer: "secret123" }], "T", "M", "complete", {
      context: baseContext,
    });
    await vi.advanceTimersByTimeAsync(FLUSH);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer secret123");
  });

  it("sends Authorization Basic header when basicAuth is set", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender.send(
      [
        {
          type: "generic",
          url: "https://example.com/hook",
          basicAuth: { username: "u", password: "p" },
        },
      ],
      "T",
      "M",
      "complete",
      { context: baseContext },
    );
    await vi.advanceTimersByTimeAsync(FLUSH);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Basic ${btoa("u:p")}`);
  });

  it("custom headers passthrough", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender.send(
      [{ type: "generic", url: "https://example.com/hook", headers: { "X-Source": "kiro" } }],
      "T",
      "M",
      "complete",
      { context: baseContext },
    );
    await vi.advanceTimersByTimeAsync(FLUSH);

    expect(fetchMock.mock.calls[0][1].headers["X-Source"]).toBe("kiro");
  });

  it("supports method=PUT", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    sender.send([{ type: "generic", url: "https://example.com/hook", method: "PUT" }], "T", "M", "complete", {
      context: baseContext,
    });
    await vi.advanceTimersByTimeAsync(FLUSH);

    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
  });
});
