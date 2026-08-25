import type { PermissionDetails, QuestionDetails, TelegramTarget, WebhookEventOverrides } from "../config/schema.js";
import { formatPermissionSummary } from "../plugin/permission-helper.js";
import { postJson } from "./http.js";
import { registerPendingPermission } from "./pending-permissions.js";
import {
  getCurrentQuestionIndex,
  type PendingQuestion,
  registerPendingQuestion,
  removePendingQuestion,
} from "./pending-questions.js";

const TELEGRAM_MAX_TEXT = 4096;
const MARKDOWN_V2_ESCAPE = /([_*[\]()~`>#+\-=|{}.!\\])/g;

export function escapeMarkdownV2(text: string): string {
  return text.replace(MARKDOWN_V2_ESCAPE, "\\$1");
}

export function escapeCodeBlock(text: string): string {
  return text.replace(/([\\`])/g, "\\$1");
}

export function escapeInlineCode(text: string): string {
  return text.replace(/([\\`])/g, "\\$1");
}

export function formatPermissionTelegramText(
  title: string,
  baseMessage: string,
  permission: PermissionDetails,
  parseMode?: TelegramTarget["parseMode"],
): string {
  const summary = formatPermissionSummary(permission);

  if (parseMode === "MarkdownV2") {
    const escTitle = escapeMarkdownV2(title);
    const escType = escapeInlineCode(summary.type);
    const escTarget = escapeInlineCode(summary.target);
    const escRule = escapeCodeBlock(summary.rule);
    const escMsg = escapeMarkdownV2(baseMessage);

    return (
      `*${escTitle}*\n` +
      `🔒 *權限需求通知 \\(Permission Required\\)*\n\n` +
      `📌 *任務*：${escMsg}\n` +
      `🔧 *操作類型 \\(Tool\\)*：\`${escType}\`\n` +
      `🎯 *執行目標 \\(Target\\)*：\n\`${escTarget}\`\n\n` +
      `📋 *若要永久允許 \\(Allow Always Rule\\)*：\n\`\`\`json\n${escRule}\n\`\`\`\n\n` +
      `請點擊下方按鈕進行審核授權：`
    );
  }

  if (parseMode === "HTML") {
    const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c);
    return (
      `<b>${esc(title)}</b>\n` +
      `🔒 <b>權限需求通知 (Permission Required)</b>\n\n` +
      `📌 <b>任務</b>：${esc(baseMessage)}\n` +
      `🔧 <b>操作類型 (Tool)</b>：<code>${esc(summary.type)}</code>\n` +
      `🎯 <b>執行目標 (Target)</b>：\n<code>${esc(summary.target)}</code>\n\n` +
      `📋 <b>若要永久允許 (Allow Always Rule)</b>：\n<pre><code>${esc(summary.rule)}</code></pre>\n\n` +
      `請點擊下方按鈕進行審核授權：`
    );
  }

  return (
    `*${title}*\n` +
    `🔒 權限需求通知 (Permission Required)\n\n` +
    `📌 任務：${baseMessage}\n` +
    `🔧 操作類型 (Tool)：\`${summary.type}\`\n` +
    `🎯 執行目標 (Target)：\n\`${summary.target}\`\n\n` +
    `📋 若要永久允許 (Allow Always Rule)：\n\`\`\`json\n${summary.rule}\n\`\`\`\n\n` +
    `請點擊下方按鈕進行審核授權：`
  );
}

function buildText(title: string, message: string, parseMode?: TelegramTarget["parseMode"]): string {
  let header: string;
  let body: string;

  switch (parseMode) {
    case "MarkdownV2":
      header = `*${escapeMarkdownV2(title)}*`;
      body = escapeMarkdownV2(message);
      break;
    case "HTML":
      header = `<b>${title.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)}</b>`;
      body = message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c);
      break;
    case "Markdown":
      header = `*${title}*`;
      body = message;
      break;
    default:
      header = title;
      body = message;
  }

  let combined = `${header}\n${body}`;
  if (combined.length > TELEGRAM_MAX_TEXT) {
    combined = `${combined.slice(0, TELEGRAM_MAX_TEXT - 1)}…`;
  }
  return combined;
}

export interface TelegramExtra {
  sessionID?: string | null;
  permission?: PermissionDetails | null;
  question?: QuestionDetails | null;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export function buildQuestionKeyboard(pending: PendingQuestion): InlineKeyboardMarkup {
  const questionIndex = getCurrentQuestionIndex(pending);
  if (questionIndex < 0) {
    return {
      inline_keyboard: [
        [{ text: "Retry submit", callback_data: `q:t:${pending.key}` }],
        [{ text: "Reject request", callback_data: `q:r:${pending.key}` }],
      ],
    };
  }

  const question = pending.request.questions[questionIndex];
  if (!question) return { inline_keyboard: [] };
  const rows = question.options.map((option, optionIndex) => {
    const selected = pending.selected.includes(option.label);
    return [
      {
        text: question.multiple && selected ? `[x] ${option.label}` : option.label,
        callback_data: `q:o:${pending.key}:${questionIndex}:${optionIndex}`,
      },
    ];
  });

  if (question.multiple) {
    rows.push([{ text: "Submit this question", callback_data: `q:s:${pending.key}:${questionIndex}` }]);
  }
  if (question.custom !== false) {
    rows.push([{ text: "Custom answer", callback_data: `q:c:${pending.key}:${questionIndex}` }]);
  }
  rows.push([{ text: "Reject request", callback_data: `q:r:${pending.key}` }]);
  return { inline_keyboard: rows };
}

interface TelegramPayload {
  chat_id: string | number;
  text: string;
  parse_mode?: string;
  disable_notification?: boolean;
  link_preview_options?: { is_disabled: boolean };
  message_thread_id?: number;
  reply_markup?: InlineKeyboardMarkup;
}

export interface TelegramErrorParameters {
  retry_after?: number;
  migrate_to_chat_id?: number;
}

export interface TelegramErrorPayload {
  ok?: boolean;
  error_code?: number;
  description?: string;
  parameters?: TelegramErrorParameters;
}

export class TelegramApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly errorCode?: number;
  readonly description?: string;
  readonly retryAfterSeconds?: number;
  readonly isRetryable: boolean;

  constructor(options: {
    status: number;
    statusText: string;
    description?: string;
    errorCode?: number;
    retryAfterSeconds?: number;
    rawBody?: string;
  }) {
    const desc = options.description || options.rawBody || "";
    const suffix = desc ? ` ${desc}` : "";
    const retryInfo = options.retryAfterSeconds ? ` (retry after ${options.retryAfterSeconds}s)` : "";
    super(`Telegram webhook failed: ${options.status} ${options.statusText}${suffix}${retryInfo}`);
    this.name = "TelegramApiError";
    this.status = options.status;
    this.statusText = options.statusText;
    this.errorCode = options.errorCode;
    this.description = options.description;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.isRetryable = options.status === 429 || options.status >= 500 || Boolean(options.retryAfterSeconds);
  }
}

export async function parseTelegramError(res: Response): Promise<TelegramApiError> {
  const status = res.status;
  const statusText = res.statusText;
  let rawText = "";
  let errorCode: number | undefined;
  let description: string | undefined;
  let retryAfterSeconds: number | undefined;

  const retryAfterHeader = res.headers?.get?.("Retry-After");
  if (retryAfterHeader) {
    const parsedHeaderSec = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(parsedHeaderSec) && parsedHeaderSec > 0) {
      retryAfterSeconds = parsedHeaderSec;
    }
  }

  try {
    rawText = await res.text();
    const parsed = JSON.parse(rawText) as TelegramErrorPayload;
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.error_code === "number") errorCode = parsed.error_code;
      if (typeof parsed.description === "string") description = parsed.description;
      if (typeof parsed.parameters?.retry_after === "number") {
        retryAfterSeconds = parsed.parameters.retry_after;
      }
    }
  } catch {}

  return new TelegramApiError({
    status,
    statusText,
    errorCode,
    description,
    retryAfterSeconds,
    rawBody: rawText,
  });
}

export async function sendTelegram(
  target: TelegramTarget,
  title: string,
  message: string,
  overrides?: WebhookEventOverrides,
  timeoutMs?: number,
  extra?: TelegramExtra,
): Promise<void> {
  const url = `https://api.telegram.org/bot${target.botToken}/sendMessage`;

  let text: string;
  let replyMarkup: InlineKeyboardMarkup | undefined;
  let pendingQuestion: PendingQuestion | undefined;

  if (extra?.permission) {
    text = formatPermissionTelegramText(title, message, extra.permission, target.parseMode);
    if (text.length > TELEGRAM_MAX_TEXT) {
      text = `${text.slice(0, TELEGRAM_MAX_TEXT - 1)}…`;
    }

    if (extra.permission.id && extra.sessionID) {
      const key = registerPendingPermission(extra.sessionID, extra.permission.id);
      replyMarkup = {
        inline_keyboard: [
          [
            { text: "✅ Allow Once", callback_data: `p:once:${key}` },
            { text: "🛡️ Allow Always", callback_data: `p:always:${key}` },
          ],
          [{ text: "❌ Reject", callback_data: `p:reject:${key}` }],
        ],
      };
    }
  } else if (extra?.question) {
    text = buildText(title, message, target.parseMode);
    pendingQuestion = registerPendingQuestion(extra.question, target.botToken, target.chatId);
    replyMarkup = buildQuestionKeyboard(pendingQuestion);
  } else {
    text = buildText(title, message, target.parseMode);
  }

  const payload: TelegramPayload = {
    chat_id: target.chatId,
    text,
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  if (target.parseMode) payload.parse_mode = target.parseMode;

  // Telegram has no numeric priority scale. An override priority of 0 is mapped
  // to silent delivery (disable_notification: true). Any other value (or unset)
  // delivers normally. This differs from ntfy (1–5) and gotify (0–10), where 0
  // is a valid priority — document accordingly when sharing overrides across targets.
  const priority = overrides?.priority;
  const silent = target.disableNotification ?? (priority === 0 ? true : undefined);
  if (silent !== undefined) payload.disable_notification = silent;

  if (target.disableLinkPreview) payload.link_preview_options = { is_disabled: true };
  if (typeof target.messageThreadId === "number") payload.message_thread_id = target.messageThreadId;

  const res = await postJson(url, payload, target.headers, undefined, "POST", timeoutMs);
  if (!res.ok) {
    const error = await parseTelegramError(res);

    // If parsing entity failed with 400 Bad Request, retry fallback without parse_mode
    if (
      error.status === 400 &&
      error.description?.toLowerCase().includes("can't parse entities") &&
      payload.parse_mode
    ) {
      const fallbackPayload: TelegramPayload = {
        ...payload,
        parse_mode: undefined,
        text: buildText(title, message, undefined),
      };
      const retryRes = await postJson(url, fallbackPayload, target.headers, undefined, "POST", timeoutMs);
      if (retryRes.ok) {
        return;
      }
      if (pendingQuestion) removePendingQuestion(pendingQuestion.key);
      throw await parseTelegramError(retryRes);
    }

    if (pendingQuestion) removePendingQuestion(pendingQuestion.key);
    throw error;
  }
}
