import type { TelegramTarget, WebhookEventOverrides } from "../config/schema.js";
import { postJson } from "./http.js";

const TELEGRAM_MAX_TEXT = 4096;
const MARKDOWN_V2_ESCAPE = /([_*[\]()~`>#+\-=|{}.!\\])/g;

function escapeMarkdownV2(text: string): string {
  return text.replace(MARKDOWN_V2_ESCAPE, "\\$1");
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

interface TelegramPayload {
  chat_id: string | number;
  text: string;
  parse_mode?: string;
  disable_notification?: boolean;
  link_preview_options?: { is_disabled: boolean };
  message_thread_id?: number;
}

export async function sendTelegram(
  target: TelegramTarget,
  title: string,
  message: string,
  overrides?: WebhookEventOverrides,
  timeoutMs?: number,
): Promise<void> {
  const url = `https://api.telegram.org/bot${target.botToken}/sendMessage`;

  const payload: TelegramPayload = {
    chat_id: target.chatId,
    text: buildText(title, message, target.parseMode),
  };

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
    const text = await res.text().catch(() => "");
    throw new Error(`Telegram webhook failed: ${res.status} ${res.statusText} ${text}`);
  }
}
