import type { PluginInput } from "@opencode-ai/plugin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotifierConfig, PermissionDetails, TelegramTarget } from "../src/config/schema.js";
import { formatPermissionSummary } from "../src/plugin/permission-helper.js";
import { clearPendingPermissions, registerPendingPermission } from "../src/transport/pending-permissions.js";
import {
  clearPendingQuestions,
  getPendingQuestion,
  registerPendingQuestion,
} from "../src/transport/pending-questions.js";
import { formatPermissionTelegramText, sendTelegram } from "../src/transport/telegram.js";
import { createTelegramReceiver } from "../src/transport/telegram-receiver.js";

function mockFetchOk(data: unknown = { ok: true, result: [] }) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(data), {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("Permission Helper", () => {
  it("formats permission summary and rule for bash command", () => {
    const perm: PermissionDetails = {
      id: "p_1",
      permission: "bash",
      patterns: ["node scripts/deploy.js workflows/foo"],
      always: ["node scripts/deploy.js*"],
    };

    const summary = formatPermissionSummary(perm);
    expect(summary.type).toBe("bash");
    expect(summary.target).toBe("node scripts/deploy.js workflows/foo");
    expect(summary.rule).toContain('"node scripts/deploy.js*": "allow"');
  });

  it("formats permission summary from metadata when patterns omitted", () => {
    const perm: PermissionDetails = {
      id: "p_2",
      permission: "edit",
      metadata: { file: "src/config.ts" },
    };

    const summary = formatPermissionSummary(perm);
    expect(summary.type).toBe("edit");
    expect(summary.target).toBe("src/config.ts");
    expect(summary.rule).toContain('"edit": "allow"');
  });
});

describe("Telegram Permission Formatting & Inline Buttons", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    clearPendingPermissions();
    clearPendingQuestions();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearPendingPermissions();
    clearPendingQuestions();
    vi.restoreAllMocks();
  });

  it("formats permission message in MarkdownV2", () => {
    const perm: PermissionDetails = {
      id: "perm_1",
      permission: "bash",
      patterns: ["rtk git status"],
      always: ["rtk git status*"],
    };

    const text = formatPermissionTelegramText("OpenCode (ist-n8n)", "Session needs permission", perm, "MarkdownV2");
    expect(text).toContain("權限需求通知");
    expect(text).toContain("rtk git status");
    expect(text).toContain("Allow Always Rule");
  });

  it("sends inline keyboard buttons when permission has id and sessionID", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const target: TelegramTarget = {
      type: "telegram",
      botToken: "TEST_TOKEN",
      chatId: 12345,
    };

    const perm: PermissionDetails = {
      id: "perm_123",
      permission: "bash",
      patterns: ["node deploy.js"],
      always: ["node deploy.js*"],
    };

    await sendTelegram(target, "OpenCode", "Session needs permission", undefined, undefined, {
      sessionID: "ses_abc",
      permission: perm,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.chat_id).toBe(12345);
    expect(body.reply_markup).toBeDefined();
    expect(body.reply_markup.inline_keyboard).toHaveLength(2);
    expect(body.reply_markup.inline_keyboard[0][0].text).toContain("Allow Once");
    expect(body.reply_markup.inline_keyboard[0][1].text).toContain("Allow Always");
    expect(body.reply_markup.inline_keyboard[1][0].text).toContain("Reject");
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toMatch(/^p:once:k_/);
  });

  it("sends question options and custom input as inline buttons", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await sendTelegram(
      { type: "telegram", botToken: "TEST_TOKEN", chatId: 12345 },
      "OpenCode",
      "Questions:\n1. Target: Where should this deploy?",
      undefined,
      undefined,
      {
        sessionID: "ses_abc",
        question: {
          id: "req_1",
          sessionID: "ses_abc",
          questions: [
            {
              header: "Target",
              question: "Where should this deploy?",
              options: [{ label: "Staging", description: "Use staging" }],
            },
          ],
        },
      },
    );

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    const buttons = body.reply_markup.inline_keyboard.flat();
    expect(buttons.map((button: { text: string }) => button.text)).toEqual([
      "Staging",
      "Custom answer",
      "Reject request",
    ]);
    expect(buttons[0].callback_data).toMatch(/^q:o:q_/);
  });
});

describe("Telegram Receiver (Long Polling & Callbacks)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    clearPendingPermissions();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearPendingPermissions();
    vi.restoreAllMocks();
  });

  it("handles allow once callback and calls OpenCode client API", async () => {
    const key = registerPendingPermission("ses_123", "perm_456");

    const clientMock = {
      postSessionIdPermissionsPermissionId: vi.fn().mockResolvedValue({ data: true }),
    };

    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      fetchCount++;
      if (url.includes("/getUpdates")) {
        if (fetchCount === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                ok: true,
                result: [
                  {
                    update_id: 101,
                    callback_query: {
                      id: "cb_1",
                      from: { id: 12345 },
                      message: {
                        message_id: 999,
                        chat: { id: 12345 },
                        text: "Permission required for bash",
                      },
                      data: `p:once:${key}`,
                    },
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        // Return hanging promise for subsequent polls until stopped
        return new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              const err = new Error("AbortError");
              err.name = "AbortError";
              reject(err);
            });
          }
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 }));
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const mockConfig: NotifierConfig = {
      timeout: 5,
      showProjectName: true,
      showSessionTitle: true,
      suppressWhenFocused: false,
      enableOnDesktop: false,
      focusCacheMs: 250,
      command: { enabled: false, path: "" },
      events: {
        permission: { webhook: true, command: true },
        complete: { webhook: true, command: true },
        subagent_complete: { webhook: false, command: true },
        error: { webhook: true, command: true },
        question: { webhook: true, command: true },
        user_cancelled: { webhook: false, command: true },
        plan_exit: { webhook: true, command: true },
      },
      messages: {
        permission: "perm",
        complete: "comp",
        subagent_complete: "sub",
        error: "err",
        question: "q",
        user_cancelled: "canc",
        plan_exit: "plan",
      },
      webhook: {
        enabled: true,
        targets: [
          {
            type: "telegram",
            botToken: "TEST_BOT_TOKEN",
            chatId: 12345,
          },
        ],
      },
    };

    const loggerMock = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const receiver = createTelegramReceiver({
      client: clientMock as unknown as PluginInput["client"],
      config: () => mockConfig,
      logger: loggerMock,
    });

    receiver.start();

    // Allow async tick for polling loop
    await new Promise((r) => setTimeout(r, 50));
    receiver.stop();

    expect(clientMock.postSessionIdPermissionsPermissionId).toHaveBeenCalledWith({
      path: {
        id: "ses_123",
        permissionID: "perm_456",
      },
      body: {
        response: "once",
      },
    });
  });

  it("handles 429 in getUpdates and logs warning with retry info", async () => {
    const clientMock = {
      postSessionIdPermissionsPermissionId: vi.fn(),
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 429,
          description: "Too Many Requests: retry after 1",
          parameters: { retry_after: 1 },
        }),
        { status: 429, statusText: "Too Many Requests", headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const mockConfig: NotifierConfig = {
      timeout: 5,
      showProjectName: true,
      showSessionTitle: true,
      suppressWhenFocused: false,
      enableOnDesktop: false,
      focusCacheMs: 250,
      command: { enabled: false, path: "" },
      events: {
        permission: { webhook: true, command: true },
        complete: { webhook: true, command: true },
        subagent_complete: { webhook: false, command: true },
        error: { webhook: true, command: true },
        question: { webhook: true, command: true },
        user_cancelled: { webhook: false, command: true },
        plan_exit: { webhook: true, command: true },
      },
      messages: {
        permission: "perm",
        complete: "comp",
        subagent_complete: "sub",
        error: "err",
        question: "q",
        user_cancelled: "canc",
        plan_exit: "plan",
      },
      webhook: {
        enabled: true,
        targets: [
          {
            type: "telegram",
            botToken: "TEST_BOT_TOKEN",
            chatId: 12345,
          },
        ],
      },
    };

    const loggerMock = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const receiver = createTelegramReceiver({
      client: clientMock as unknown as PluginInput["client"],
      config: () => mockConfig,
      logger: loggerMock,
    });

    receiver.start();
    await new Promise((r) => setTimeout(r, 20));
    receiver.stop();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Telegram getUpdates rate limited (429), backing off",
      expect.objectContaining({ status: 429 }),
    );
  });

  it("handles 409 conflict in getUpdates and logs debug without warning", async () => {
    const clientMock = {
      postSessionIdPermissionsPermissionId: vi.fn(),
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 409,
          description:
            "Conflict: terminated by other getUpdates request; make sure that only one bot instance is running",
        }),
        { status: 409, statusText: "Conflict", headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const mockConfig: NotifierConfig = {
      timeout: 5,
      showProjectName: true,
      showSessionTitle: true,
      suppressWhenFocused: false,
      enableOnDesktop: false,
      focusCacheMs: 250,
      command: { enabled: false, path: "" },
      events: {
        permission: { webhook: true, command: true },
        complete: { webhook: true, command: true },
        subagent_complete: { webhook: false, command: true },
        error: { webhook: true, command: true },
        question: { webhook: true, command: true },
        user_cancelled: { webhook: false, command: true },
        plan_exit: { webhook: true, command: true },
      },
      messages: {
        permission: "perm",
        complete: "comp",
        subagent_complete: "sub",
        error: "err",
        question: "q",
        user_cancelled: "canc",
        plan_exit: "plan",
      },
      webhook: {
        enabled: true,
        targets: [
          {
            type: "telegram",
            botToken: "TEST_BOT_TOKEN",
            chatId: 12345,
          },
        ],
      },
    };

    const loggerMock = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const receiver = createTelegramReceiver({
      client: clientMock as unknown as PluginInput["client"],
      config: () => mockConfig,
      logger: loggerMock,
    });

    receiver.start();
    await new Promise((r) => setTimeout(r, 20));
    receiver.stop();

    expect(loggerMock.debug).toHaveBeenCalledWith(
      "Telegram getUpdates conflict (409), another session is polling",
      expect.objectContaining({ status: 409 }),
    );
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("collects single and multiple choices before replying to OpenCode", async () => {
    const pending = registerPendingQuestion(
      {
        id: "req_multi",
        sessionID: "ses_123",
        questions: [
          {
            header: "Environment",
            question: "Choose an environment",
            options: [{ label: "Staging", description: "Use staging" }],
          },
          {
            header: "Services",
            question: "Choose services",
            options: [
              { label: "Web", description: "Deploy web" },
              { label: "Worker", description: "Deploy worker" },
            ],
            multiple: true,
          },
        ],
      },
      "TEST_BOT_TOKEN",
      67890,
    );

    let polls = 0;
    const postQuestion = vi
      .fn()
      .mockRejectedValueOnce(new Error("OpenCode transport unavailable"))
      .mockResolvedValueOnce({ data: true });
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/getUpdates")) {
        polls++;
        if (polls === 1) {
          const callback = (id: string, data: string) => ({
            update_id: Number(id.slice(2)),
            callback_query: {
              id,
              data,
              message: { message_id: 500, chat: { id: 67890 }, text: "Questions" },
            },
          });
          return Promise.resolve(
            new Response(
              JSON.stringify({
                ok: true,
                result: [
                  callback("cb1", `q:o:${pending.key}:0:0`),
                  callback("cb2", `q:o:${pending.key}:1:0`),
                  callback("cb3", `q:o:${pending.key}:1:1`),
                  callback("cb4", `q:s:${pending.key}:1`),
                  callback("cb5", `q:t:${pending.key}`),
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("AbortError"), { name: "AbortError" })),
          );
        });
      }
      if (url.startsWith("http://127.0.0.1:4096/question/")) {
        throw new Error("Direct localhost request is not available");
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: { message_id: 701 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const receiver = createTelegramReceiver({
      client: { _client: { post: postQuestion } } as unknown as PluginInput["client"],
      config: () =>
        ({
          timeout: 5,
          webhook: {
            enabled: true,
            targets: [
              { type: "telegram", botToken: "TEST_BOT_TOKEN", chatId: 12345 },
              { type: "telegram", botToken: "TEST_BOT_TOKEN", chatId: 67890 },
            ],
          },
        }) as NotifierConfig,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    receiver.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    receiver.stop();

    expect(postQuestion).toHaveBeenCalledTimes(2);
    expect(postQuestion).toHaveBeenLastCalledWith({
      url: "/question/{requestID}/reply",
      path: { requestID: "req_multi" },
      body: { answers: [["Staging"], ["Web", "Worker"]] },
      throwOnError: true,
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/question/req_multi/reply"))).toBe(false);
  });

  it("accepts custom text only as a reply to the force-reply prompt", async () => {
    const pending = registerPendingQuestion(
      {
        id: "req_custom",
        sessionID: "ses_123",
        questions: [
          {
            header: "Version",
            question: "Which version?",
            options: [],
          },
        ],
      },
      "TEST_BOT_TOKEN",
      12345,
    );

    let polls = 0;
    const postQuestion = vi.fn().mockResolvedValue({ data: true });
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/getUpdates")) {
        polls++;
        if (polls === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                ok: true,
                result: [
                  {
                    update_id: 1,
                    callback_query: {
                      id: "cb1",
                      data: `q:c:${pending.key}:0`,
                      message: { message_id: 500, chat: { id: 12345 }, text: "Questions" },
                    },
                  },
                  {
                    update_id: 2,
                    message: {
                      message_id: 701,
                      chat: { id: 12345 },
                      text: "ignore ordinary text",
                    },
                  },
                  {
                    update_id: 3,
                    message: {
                      message_id: 702,
                      chat: { id: 12345 },
                      text: "ignore wrong reply",
                      reply_to_message: { message_id: 699 },
                    },
                  },
                  {
                    update_id: 4,
                    message: {
                      message_id: 703,
                      chat: { id: 12345 },
                      text: "v2.2.0",
                      reply_to_message: { message_id: 700 },
                    },
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("AbortError"), { name: "AbortError" })),
          );
        });
      }
      if (url.startsWith("http://127.0.0.1:4096/question/")) {
        throw new Error("Direct localhost request is not available");
      }
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const messageID = body.reply_markup?.force_reply ? 700 : 701;
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: { message_id: messageID } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const receiver = createTelegramReceiver({
      client: { _client: { post: postQuestion } } as unknown as PluginInput["client"],
      config: () =>
        ({
          timeout: 5,
          webhook: {
            enabled: true,
            targets: [{ type: "telegram", botToken: "TEST_BOT_TOKEN", chatId: 12345 }],
          },
        }) as NotifierConfig,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    receiver.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    receiver.stop();

    expect(postQuestion).toHaveBeenCalledWith({
      url: "/question/{requestID}/reply",
      path: { requestID: "req_custom" },
      body: { answers: [["v2.2.0"]] },
      throwOnError: true,
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/question/req_custom/reply"))).toBe(false);
  });

  it("rejects a complete question request through OpenCode", async () => {
    const pending = registerPendingQuestion(
      {
        id: "req_reject",
        sessionID: "ses_123",
        questions: [{ header: "Deploy", question: "Proceed?", options: [] }],
      },
      "TEST_BOT_TOKEN",
      12345,
    );

    let polls = 0;
    const postQuestion = vi.fn().mockResolvedValue({ data: true });
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/getUpdates")) {
        polls++;
        if (polls === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                ok: true,
                result: [
                  {
                    update_id: 1,
                    callback_query: {
                      id: "cb1",
                      data: `q:r:${pending.key}`,
                      message: { message_id: 500, chat: { id: 12345 }, text: "Questions" },
                    },
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("AbortError"), { name: "AbortError" })),
          );
        });
      }
      if (url.startsWith("http://127.0.0.1:4096/question/")) {
        throw new Error("Direct localhost request is not available");
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const receiver = createTelegramReceiver({
      client: { _client: { post: postQuestion } } as unknown as PluginInput["client"],
      config: () =>
        ({
          timeout: 5,
          webhook: {
            enabled: true,
            targets: [{ type: "telegram", botToken: "TEST_BOT_TOKEN", chatId: 12345 }],
          },
        }) as NotifierConfig,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    receiver.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    receiver.stop();

    expect(postQuestion).toHaveBeenCalledWith({
      url: "/question/{requestID}/reject",
      path: { requestID: "req_reject" },
      throwOnError: true,
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/question/req_reject/reject"))).toBe(false);
    expect(getPendingQuestion(pending.key)).toBeUndefined();
  });
});
