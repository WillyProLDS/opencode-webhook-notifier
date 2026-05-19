import type { EventType, MessageContext, NotifierConfig } from "./schema.js";

export function isEventWebhookEnabled(config: NotifierConfig, event: EventType): boolean {
  return config.events[event]?.webhook ?? false;
}

export function isEventCommandEnabled(config: NotifierConfig, event: EventType): boolean {
  return config.events[event]?.command ?? false;
}

export function getMessage(config: NotifierConfig, event: EventType): string {
  return config.messages[event];
}

export function interpolateMessage(message: string, context: MessageContext): string {
  let result = message;

  result = result.replaceAll("{sessionTitle}", context.sessionTitle ?? "");
  result = result.replaceAll("{agentName}", context.agentName ?? "");
  result = result.replaceAll("{projectName}", context.projectName ?? "");
  result = result.replaceAll("{timestamp}", context.timestamp ?? "");
  result = result.replaceAll("{turn}", context.turn != null ? String(context.turn) : "");

  result = result.replace(/\s*[:\-|]\s*$/, "").trim();
  result = result.replace(/\s{2,}/g, " ");

  return result;
}
