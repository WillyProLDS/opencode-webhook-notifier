import type { PluginInput } from "@opencode-ai/plugin";
import type { NotifierConfig, TelegramTarget } from "../config/schema.js";
import type { Logger } from "../log/logger.js";
import { postJson } from "./http.js";
import { getPendingPermission, removePendingPermission } from "./pending-permissions.js";
import {
  answerCurrentQuestion,
  findPendingQuestionByPrompt,
  getCurrentQuestionIndex,
  getPendingQuestion,
  type PendingQuestion,
  removePendingQuestionsByRequest,
  togglePendingSelection,
} from "./pending-questions.js";
import { buildQuestionKeyboard } from "./telegram.js";

export interface TelegramReceiverDeps {
  client: PluginInput["client"];
  serverUrl: URL;
  config: () => NotifierConfig;
  logger: Logger;
}

export interface TelegramReceiver {
  start(): void;
  stop(): void;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number | string };
  text?: string;
  reply_to_message?: { message_id: number };
}

interface TelegramCallbackQuery {
  id: string;
  from?: { id: number; username?: string; first_name?: string };
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
  message?: TelegramMessage;
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

async function editQuestionKeyboard(botToken: string, pending: PendingQuestion, logger?: Logger): Promise<void> {
  if (!pending.notificationMessageID) return;
  const url = `https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`;
  try {
    const res = await postJson(url, {
      chat_id: pending.chatID,
      message_id: pending.notificationMessageID,
      reply_markup: buildQuestionKeyboard(pending),
    });
    if (!res.ok) logger?.debug("Failed to update question keyboard", { status: res.status });
  } catch (error) {
    logger?.debug("Error updating question keyboard", { error: String(error) });
  }
}

async function sendQuestionNotice(
  botToken: string,
  chatID: string | number,
  text: string,
  logger?: Logger,
): Promise<void> {
  try {
    const res = await postJson(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatID,
      text,
    });
    if (!res.ok) logger?.debug("Failed to send question status", { status: res.status });
  } catch (error) {
    logger?.debug("Error sending question status", { error: String(error) });
  }
}

export function createTelegramReceiver(deps: TelegramReceiverDeps): TelegramReceiver {
  let stopped = false;
  let abortController: AbortController | null = null;

  async function submitQuestion(pending: PendingQuestion): Promise<boolean> {
    const answers = pending.answers.filter((answer): answer is string[] => answer !== undefined);
    if (answers.length !== pending.request.questions.length) return false;

    try {
      const url = new URL(`/question/${encodeURIComponent(pending.request.id)}/reply`, deps.serverUrl);
      const res = await postJson(url.toString(), { answers }, {}, undefined, "POST", deps.config().timeout * 1000);
      if (!res.ok) throw new Error(`OpenCode question reply failed: ${res.status}`);

      removePendingQuestionsByRequest(pending.request.id);
      if (pending.notificationMessageID) {
        await removeMessageKeyboard(
          botTokenFor(pending),
          pending.chatID,
          pending.notificationMessageID,
          undefined,
          deps.logger,
        );
      }
      await sendQuestionNotice(botTokenFor(pending), pending.chatID, "Question answers submitted.", deps.logger);
      deps.logger.info("Question answered via Telegram", {
        requestID: pending.request.id,
        sessionID: pending.request.sessionID,
      });
      return true;
    } catch (error) {
      deps.logger.warn("Failed to answer question via OpenCode API", {
        error: String(error),
        requestID: pending.request.id,
        sessionID: pending.request.sessionID,
      });
      await editQuestionKeyboard(botTokenFor(pending), pending, deps.logger);
      return false;
    }
  }

  function botTokenFor(pending: PendingQuestion): string {
    return pending.botToken;
  }

  async function rejectQuestion(pending: PendingQuestion): Promise<boolean> {
    try {
      const url = new URL(`/question/${encodeURIComponent(pending.request.id)}/reject`, deps.serverUrl);
      const res = await postJson(url.toString(), {}, {}, undefined, "POST", deps.config().timeout * 1000);
      if (!res.ok) throw new Error(`OpenCode question reject failed: ${res.status}`);

      removePendingQuestionsByRequest(pending.request.id);
      if (pending.notificationMessageID) {
        await removeMessageKeyboard(
          botTokenFor(pending),
          pending.chatID,
          pending.notificationMessageID,
          undefined,
          deps.logger,
        );
      }
      await sendQuestionNotice(botTokenFor(pending), pending.chatID, "Question request rejected.", deps.logger);
      deps.logger.info("Question rejected via Telegram", {
        requestID: pending.request.id,
        sessionID: pending.request.sessionID,
      });
      return true;
    } catch (error) {
      deps.logger.warn("Failed to reject question via OpenCode API", {
        error: String(error),
        requestID: pending.request.id,
        sessionID: pending.request.sessionID,
      });
      return false;
    }
  }

  async function requestCustomAnswer(
    botToken: string,
    pending: PendingQuestion,
    questionIndex: number,
  ): Promise<boolean> {
    try {
      const question = pending.request.questions[questionIndex];
      if (!question) return false;
      const res = await postJson(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: pending.chatID,
        text: `Reply to this message with your answer for: ${question.question}`,
        reply_markup: { force_reply: true, selective: true },
      });
      if (!res.ok) return false;
      const payload = (await res.json()) as { result?: { message_id?: number } };
      if (typeof payload.result?.message_id !== "number") return false;
      pending.promptMessageID = payload.result.message_id;
      return true;
    } catch (error) {
      deps.logger.debug("Failed to request custom question answer", { error: String(error) });
      return false;
    }
  }

  async function handleQuestionCallback(
    botToken: string,
    targetChatId: string | number,
    query: TelegramCallbackQuery,
  ): Promise<boolean> {
    if (!query.data?.startsWith("q:")) return false;
    const parts = query.data.split(":");
    const action = parts[1];
    const key = parts[2];
    if (!action || !key) return true;

    const pending = getPendingQuestion(key);
    if (!pending) {
      await answerCallbackQuery(botToken, query.id, "This question request has expired or was handled.", deps.logger);
      return true;
    }
    if (pending.botToken !== botToken || String(pending.chatID) !== String(targetChatId)) {
      await answerCallbackQuery(botToken, query.id, "Unauthorized question request.", deps.logger);
      return true;
    }
    if (query.message?.message_id) pending.notificationMessageID = query.message.message_id;

    if (action === "r") {
      const rejected = await rejectQuestion(pending);
      await answerCallbackQuery(
        botToken,
        query.id,
        rejected ? "Question rejected." : "Reject failed; try again.",
        deps.logger,
      );
      return true;
    }
    if (action === "t") {
      const submitted = await submitQuestion(pending);
      await answerCallbackQuery(
        botToken,
        query.id,
        submitted ? "Answers submitted." : "Submit failed; try again.",
        deps.logger,
      );
      return true;
    }

    const questionIndex = Number.parseInt(parts[3] ?? "", 10);
    const currentIndex = getCurrentQuestionIndex(pending);
    const question = pending.request.questions[currentIndex];
    if (!Number.isInteger(questionIndex) || questionIndex !== currentIndex || !question) {
      await answerCallbackQuery(botToken, query.id, "This question is no longer active.", deps.logger);
      return true;
    }

    if (action === "c") {
      if (question.custom === false) {
        await answerCallbackQuery(botToken, query.id, "Custom answers are disabled for this question.", deps.logger);
        return true;
      }
      const prompted = await requestCustomAnswer(botToken, pending, currentIndex);
      await answerCallbackQuery(
        botToken,
        query.id,
        prompted ? "Reply to the new prompt with your answer." : "Could not open text input.",
        deps.logger,
      );
      return true;
    }

    if (action === "o") {
      const optionIndex = Number.parseInt(parts[4] ?? "", 10);
      const option = question.options[optionIndex];
      if (!Number.isInteger(optionIndex) || !option) {
        await answerCallbackQuery(botToken, query.id, "Unknown option.", deps.logger);
        return true;
      }
      if (question.multiple) {
        togglePendingSelection(pending, option.label);
        await editQuestionKeyboard(botToken, pending, deps.logger);
        await answerCallbackQuery(botToken, query.id, "Selection updated.", deps.logger);
        return true;
      }

      const complete = answerCurrentQuestion(pending, [option.label]);
      if (complete) {
        const submitted = await submitQuestion(pending);
        await answerCallbackQuery(
          botToken,
          query.id,
          submitted ? "Answers submitted." : "Submit failed; use Retry submit.",
          deps.logger,
        );
      } else {
        await editQuestionKeyboard(botToken, pending, deps.logger);
        await answerCallbackQuery(botToken, query.id, "Answer saved. Continue with the next question.", deps.logger);
      }
      return true;
    }

    if (action === "s") {
      if (!question.multiple || pending.selected.length === 0) {
        await answerCallbackQuery(botToken, query.id, "Select at least one option.", deps.logger);
        return true;
      }
      const complete = answerCurrentQuestion(pending, [...pending.selected]);
      if (complete) {
        const submitted = await submitQuestion(pending);
        await answerCallbackQuery(
          botToken,
          query.id,
          submitted ? "Answers submitted." : "Submit failed; use Retry submit.",
          deps.logger,
        );
      } else {
        await editQuestionKeyboard(botToken, pending, deps.logger);
        await answerCallbackQuery(botToken, query.id, "Answer saved. Continue with the next question.", deps.logger);
      }
      return true;
    }

    return true;
  }

  async function handleQuestionMessage(
    botToken: string,
    targetChatId: string | number,
    message: TelegramMessage,
  ): Promise<void> {
    if (String(message.chat.id) !== String(targetChatId)) return;
    const replyMessageID = message.reply_to_message?.message_id;
    const answer = message.text?.trim();
    if (!replyMessageID || !answer) return;
    const pending = findPendingQuestionByPrompt(botToken, targetChatId, replyMessageID);
    if (!pending) return;

    const complete = answerCurrentQuestion(pending, [answer]);
    if (complete) {
      const submitted = await submitQuestion(pending);
      if (!submitted) {
        await sendQuestionNotice(
          botToken,
          targetChatId,
          "Submit failed. Use Retry submit on the question.",
          deps.logger,
        );
      }
      return;
    }

    await editQuestionKeyboard(botToken, pending, deps.logger);
    await sendQuestionNotice(botToken, targetChatId, "Answer saved. Continue with the next question.", deps.logger);
  }

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

    if (await handleQuestionCallback(botToken, targetChatId, query)) return;

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

  async function pollBot(botToken: string, targets: TelegramTarget[]): Promise<void> {
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
            allowed_updates: ["callback_query", "message"],
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
              const chatID = update.callback_query.message?.chat.id;
              const target = targets.find((candidate) => String(candidate.chatId) === String(chatID));
              if (target) {
                await handleCallbackQuery(botToken, target.chatId, update.callback_query);
              } else {
                deps.logger.warn("Received telegram callback from unauthorized chat", {
                  queryChatId: String(chatID),
                });
                await answerCallbackQuery(botToken, update.callback_query.id, "Unauthorized chat.", deps.logger);
              }
            }
            if (update.message) {
              const target = targets.find((candidate) => String(candidate.chatId) === String(update.message?.chat.id));
              if (target) await handleQuestionMessage(botToken, target.chatId, update.message);
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

      const targetsByToken = new Map<string, TelegramTarget[]>();
      for (const target of telegramTargets) {
        const targets = targetsByToken.get(target.botToken) ?? [];
        targets.push(target);
        targetsByToken.set(target.botToken, targets);
      }

      for (const [botToken, targets] of targetsByToken) {
        // Start long polling loop in background
        pollBot(botToken, targets).catch((err) => {
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
