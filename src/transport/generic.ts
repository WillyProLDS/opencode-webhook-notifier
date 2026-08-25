import type { EventType, GenericTarget, QuestionDetails, WebhookEventOverrides } from "../config/schema.js";

export interface GenericContext {
  event: EventType;
  timestamp: string;
  turn: number;
  sessionTitle?: string | null;
  agentName?: string | null;
  projectName?: string | null;
  question?: QuestionDetails | null;
}

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

function substitute(value: string, ctx: GenericContext, title: string, message: string): string {
  return value.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    switch (key) {
      case "title":
        return title;
      case "message":
        return message;
      case "event":
        return ctx.event;
      case "timestamp":
        return ctx.timestamp;
      case "turn":
        return String(ctx.turn);
      case "sessionTitle":
        return ctx.sessionTitle ?? "";
      case "agentName":
        return ctx.agentName ?? "";
      case "projectName":
        return ctx.projectName ?? "";
      default:
        return "";
    }
  });
}

function applyTemplate(template: unknown, ctx: GenericContext, title: string, message: string): unknown {
  if (typeof template === "string") return substitute(template, ctx, title, message);
  if (Array.isArray(template)) return template.map((item) => applyTemplate(item, ctx, title, message));
  if (template && typeof template === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template)) {
      out[k] = applyTemplate(v, ctx, title, message);
    }
    return out;
  }
  return template;
}

function defaultBody(title: string, message: string, ctx: GenericContext): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title,
    message,
    event: ctx.event,
    timestamp: ctx.timestamp,
    turn: ctx.turn,
  };
  if (ctx.sessionTitle != null) body.sessionTitle = ctx.sessionTitle;
  if (ctx.agentName != null) body.agentName = ctx.agentName;
  if (ctx.projectName != null) body.projectName = ctx.projectName;
  if (ctx.question != null) body.question = ctx.question;
  return body;
}

export async function sendGeneric(
  target: GenericTarget,
  title: string,
  message: string,
  ctx: GenericContext,
  _overrides?: WebhookEventOverrides,
  timeoutMs?: number,
): Promise<void> {
  const method = target.method ?? "POST";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...target.headers,
  };

  if (target.bearer) headers.Authorization = `Bearer ${target.bearer}`;
  if (target.basicAuth) {
    const credentials = btoa(`${target.basicAuth.username}:${target.basicAuth.password}`);
    headers.Authorization = `Basic ${credentials}`;
  }

  const body =
    target.bodyTemplate !== undefined
      ? applyTemplate(target.bodyTemplate, ctx, title, message)
      : defaultBody(title, message, ctx);

  const signal = timeoutMs && timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const res = await fetch(target.url, {
    method,
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Generic webhook failed: ${res.status} ${res.statusText} ${text}`);
  }
}
