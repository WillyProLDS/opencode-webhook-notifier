import type { PluginInput } from "@opencode-ai/plugin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotifierConfig, PermissionDetails, TelegramTarget } from "../src/config/schema.js";
import { formatPermissionSummary } from "../src/plugin/permission-helper.js";
import { clearPendingPermissions, registerPendingPermission } from "../src/transport/pending-permissions.js";
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
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearPendingPermissions();
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
});
