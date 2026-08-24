import type { PluginInput } from "@opencode-ai/plugin";
import type { NotifierConfig, TelegramTarget } from "../config/schema.js";
import type { Logger } from "../log/logger.js";
import { postJson } from "./http.js";
import { getPendingPermission, removePendingPermission } from "./pending-permissions.js";

export interface TelegramReceiverDeps {
  client: PluginInput["client"];
  config: () => NotifierConfig;
  logger: Logger;
}

export interface TelegramReceiver {
  start(): void;
  stop(): void;
}

interface TelegramCallbackQuery {
  id: string;
  from?: { id: number; username?: string; first_name?: string };
  message?: {
    message_id: number;
    chat: { id: number | string };
    text?: string;
  };
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
}

interface GetUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
}

async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text: string,
  logger?: Logger,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
  try {
    const res = await postJson(url, {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    });
    if (!res.ok) {
      logger?.debug("Failed to answer callback query", { status: res.status });
    }
  } catch (err) {
    logger?.debug("Error answering callback query", { error: String(err) });
  }
}

async function removeMessageKeyboard(
  botToken: string,
  chatId: string | number,
  messageId: number,
  statusNotice?: string,
  logger?: Logger,
): Promise<void> {
  if (statusNotice) {
    const editUrl = `https://api.telegram.org/bot${botToken}/editMessageText`;
    try {
      // First try to get the existing message text or update with status notice
      const res = await postJson(editUrl, {
        chat_id: chatId,
        message_id: messageId,
        text: statusNotice,
        reply_markup: { inline_keyboard: [] },
      });
      if (res.ok) return;
    } catch (err) {
      logger?.debug("Failed to edit message text, falling back to editMessageReplyMarkup", { error: String(err) });
    }
  }

  const url = `https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`;
  try {
    await postJson(url, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
  } catch (err) {
    logger?.debug("Failed to remove message keyboard", { error: String(err) });
  }
}

export function createTelegramReceiver(deps: TelegramReceiverDeps): TelegramReceiver {
  let stopped = false;
  let abortController: AbortController | null = null;

  async function handleCallbackQuery(
    botToken: string,
    targetChatId: string | number,
    query: TelegramCallbackQuery,
  ): Promise<void> {
    if (!query.data) return;

    // Verify chat ID match for security
    const queryChatId = query.message?.chat?.id;
    if (queryChatId !== undefined && String(queryChatId) !== String(targetChatId)) {
      deps.logger.warn("Received telegram callback from unauthorized chat", {
        queryChatId: String(queryChatId),
        targetChatId: String(targetChatId),
      });
      await answerCallbackQuery(botToken, query.id, "❌ 未授權的對話", deps.logger);
      return;
    }

    const match = query.data.match(/^p:(once|always|reject):(.+)$/);
    if (!match?.[1] || !match[2]) return;

    const action = match[1] as "once" | "always" | "reject";
    const key = match[2];

    const pending = getPendingPermission(key);
    if (!pending) {
      await answerCallbackQuery(botToken, query.id, "⚠️ 此權限請求已過期或已在終端機處理", deps.logger);
      if (query.message?.message_id && query.message?.chat?.id) {
        await removeMessageKeyboard(
          botToken,
          query.message.chat.id,
          query.message.message_id,
          query.message.text ? `${query.message.text}\n\n⚠️ （此權限請求已過期或已處理）` : undefined,
          deps.logger,
        );
      }
      return;
    }

    try {
      // Call OpenCode REST API to resolve permission
      await deps.client.postSessionIdPermissionsPermissionId({
        path: {
          id: pending.sessionID,
          permissionID: pending.permissionID,
        },
        body: {
          response: action,
        },
      });

      removePendingPermission(key);

      const actionText =
        action === "once"
          ? "✅ 已允許本次執行 (Allow Once)"
          : action === "always"
            ? "🛡️ 已設定永久允許 (Allow Always)"
            : "❌ 已拒絕執行 (Reject)";

      await answerCallbackQuery(botToken, query.id, actionText, deps.logger);

      if (query.message?.message_id && query.message?.chat?.id) {
        const originalText = query.message.text ?? "";
        const updatedText = `${originalText}\n\n👉 審核結果：${actionText}`;
        await removeMessageKeyboard(
          botToken,
          query.message.chat.id,
          query.message.message_id,
          updatedText,
          deps.logger,
        );
      }

      deps.logger.info("Permission resolved via Telegram button", {
        action,
        sessionID: pending.sessionID,
        permissionID: pending.permissionID,
      });
    } catch (error) {
      deps.logger.warn("Failed to resolve permission via OpenCode client", {
        error: String(error),
        sessionID: pending.sessionID,
        permissionID: pending.permissionID,
      });
      await answerCallbackQuery(botToken, query.id, "⚠️ 操作失敗或權限已在終端機處理", deps.logger);
    }
  }

  async function pollBot(target: TelegramTarget): Promise<void> {
    const botToken = target.botToken;
    let offset = 0;

    while (!stopped) {
      try {
        abortController = new AbortController();
        const url = `https://api.telegram.org/bot${botToken}/getUpdates`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offset: offset > 0 ? offset : undefined,
            timeout: 20,
            allowed_updates: ["callback_query"],
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          let delayMs = 5000;
          if (res.status === 429) {
            const retryHeader = res.headers?.get?.("Retry-After");
            if (retryHeader) {
              const sec = Number.parseInt(retryHeader, 10);
              if (Number.isFinite(sec) && sec > 0) delayMs = sec * 1000;
            } else {
              try {
                const body = (await res.json()) as { parameters?: { retry_after?: number } };
                if (typeof body?.parameters?.retry_after === "number") {
                  delayMs = body.parameters.retry_after * 1000;
                }
              } catch {}
            }
            deps.logger.warn("Telegram getUpdates rate limited (429), backing off", {
              status: res.status,
              delayMs,
            });
          } else if (res.status === 401 || res.status === 404) {
            deps.logger.error("Telegram botToken unauthorized or invalid", { status: res.status });
            delayMs = 60_000;
          } else if (res.status === 409) {
            deps.logger.debug("Telegram getUpdates conflict (409), another session is polling", {
              status: res.status,
            });
            delayMs = 30_000;
          } else {
            deps.logger.warn("Telegram getUpdates returned non-ok", { status: res.status });
          }

          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        const data = (await res.json()) as GetUpdatesResponse;
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = Math.max(offset, update.update_id + 1);
            if (update.callback_query) {
              await handleCallbackQuery(botToken, target.chatId, update.callback_query);
            }
          }
          if (data.result.length === 0) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err: unknown) {
        if (stopped) break;
        const errName = err instanceof Error ? err.name : "";
        if (errName !== "AbortError") {
          deps.logger.debug("Telegram polling error, will retry in 5s", { error: String(err) });
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }
  }

  return {
    start() {
      if (stopped) return;
      const config = deps.config();
      if (!config.webhook.enabled) return;

      const telegramTargets = config.webhook.targets.filter(
        (t): t is TelegramTarget => t.type === "telegram" && typeof t.botToken === "string" && t.botToken.length > 0,
      );

      const seenTokens = new Set<string>();
      for (const target of telegramTargets) {
        if (seenTokens.has(target.botToken)) continue;
        seenTokens.add(target.botToken);
        // Start long polling loop in background
        pollBot(target).catch((err) => {
          deps.logger.debug("Telegram poller stopped with error", { error: String(err) });
        });
      }
    },
    stop() {
      stopped = true;
      if (abortController) {
        try {
          abortController.abort();
        } catch {}
      }
    },
  };
}
