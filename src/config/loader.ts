import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { CommandConfig, EventConfig, NotifierConfig, WebhookTarget } from "./schema.js";

export function getConfigPath(): string {
  if (process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH) {
    return process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH;
  }
  return join(homedir(), ".config", "opencode", "opencode-webhook-notifier.json");
}

function parseEventConfig(
  userEvent: boolean | { webhook?: boolean; command?: boolean } | undefined,
  defaultConfig: EventConfig,
): EventConfig {
  if (userEvent === undefined) {
    return defaultConfig;
  }

  if (typeof userEvent === "boolean") {
    return {
      webhook: userEvent,
      command: userEvent,
    };
  }

  return {
    webhook: userEvent.webhook ?? defaultConfig.webhook,
    command: userEvent.command ?? defaultConfig.command,
  };
}

function isValidTarget(value: unknown): value is WebhookTarget {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.type !== "string") return false;

  switch (obj.type) {
    case "discord":
    case "ntfy":
    case "gotify":
    case "generic":
      return typeof obj.url === "string" && obj.url.length > 0;
    case "telegram":
      return (
        typeof obj.botToken === "string" &&
        obj.botToken.length > 0 &&
        (typeof obj.chatId === "string" || typeof obj.chatId === "number")
      );
    default:
      return false;
  }
}

function parseCommand(userCommand: Record<string, unknown> | undefined): CommandConfig {
  const value = userCommand ?? {};
  const argsValue = value.args;
  const args = Array.isArray(argsValue) ? argsValue.filter((arg): arg is string => typeof arg === "string") : undefined;

  const minDurationValue = value.minDuration;
  const minDuration =
    typeof minDurationValue === "number" && Number.isFinite(minDurationValue) && minDurationValue > 0
      ? minDurationValue
      : 0;

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_CONFIG.command.enabled,
    path: typeof value.path === "string" ? value.path : DEFAULT_CONFIG.command.path,
    args,
    minDuration,
  };
}

export function loadConfig(): NotifierConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  let userConfig: Record<string, unknown>;
  try {
    const fileContent = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(fileContent);
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_CONFIG;
    }
    userConfig = parsed as Record<string, unknown>;
  } catch {
    return DEFAULT_CONFIG;
  }

  const userWebhook = (userConfig.webhook as Record<string, unknown> | undefined) ?? {};
  const userTargets = Array.isArray(userWebhook.targets) ? (userWebhook.targets as unknown[]) : [];
  const webhookTargets = userTargets.filter(isValidTarget);

  const userEvents = (userConfig.events as Record<string, unknown> | undefined) ?? {};
  const userMessages = (userConfig.messages as Record<string, unknown> | undefined) ?? {};

  const focusCacheMs =
    typeof userConfig.focusCacheMs === "number" && userConfig.focusCacheMs >= 0
      ? userConfig.focusCacheMs
      : DEFAULT_CONFIG.focusCacheMs;

  return {
    timeout:
      typeof userConfig.timeout === "number" && userConfig.timeout > 0 ? userConfig.timeout : DEFAULT_CONFIG.timeout,
    showProjectName:
      typeof userConfig.showProjectName === "boolean" ? userConfig.showProjectName : DEFAULT_CONFIG.showProjectName,
    showSessionTitle:
      typeof userConfig.showSessionTitle === "boolean" ? userConfig.showSessionTitle : DEFAULT_CONFIG.showSessionTitle,
    suppressWhenFocused:
      typeof userConfig.suppressWhenFocused === "boolean"
        ? userConfig.suppressWhenFocused
        : DEFAULT_CONFIG.suppressWhenFocused,
    enableOnDesktop:
      typeof userConfig.enableOnDesktop === "boolean" ? userConfig.enableOnDesktop : DEFAULT_CONFIG.enableOnDesktop,
    focusCacheMs,
    command: parseCommand(userConfig.command as Record<string, unknown> | undefined),
    events: {
      permission: parseEventConfig(userEvents.permission as never, DEFAULT_CONFIG.events.permission),
      complete: parseEventConfig(userEvents.complete as never, DEFAULT_CONFIG.events.complete),
      subagent_complete: parseEventConfig(
        userEvents.subagent_complete as never,
        DEFAULT_CONFIG.events.subagent_complete,
      ),
      error: parseEventConfig(userEvents.error as never, DEFAULT_CONFIG.events.error),
      question: parseEventConfig(userEvents.question as never, DEFAULT_CONFIG.events.question),
      user_cancelled: parseEventConfig(userEvents.user_cancelled as never, DEFAULT_CONFIG.events.user_cancelled),
      plan_exit: parseEventConfig(userEvents.plan_exit as never, DEFAULT_CONFIG.events.plan_exit),
    },
    messages: {
      permission:
        typeof userMessages.permission === "string" ? userMessages.permission : DEFAULT_CONFIG.messages.permission,
      complete: typeof userMessages.complete === "string" ? userMessages.complete : DEFAULT_CONFIG.messages.complete,
      subagent_complete:
        typeof userMessages.subagent_complete === "string"
          ? userMessages.subagent_complete
          : DEFAULT_CONFIG.messages.subagent_complete,
      error: typeof userMessages.error === "string" ? userMessages.error : DEFAULT_CONFIG.messages.error,
      question: typeof userMessages.question === "string" ? userMessages.question : DEFAULT_CONFIG.messages.question,
      user_cancelled:
        typeof userMessages.user_cancelled === "string"
          ? userMessages.user_cancelled
          : DEFAULT_CONFIG.messages.user_cancelled,
      plan_exit:
        typeof userMessages.plan_exit === "string" ? userMessages.plan_exit : DEFAULT_CONFIG.messages.plan_exit,
    },
    webhook: {
      enabled: typeof userWebhook.enabled === "boolean" ? userWebhook.enabled : DEFAULT_CONFIG.webhook.enabled,
      targets: webhookTargets,
      events: (userWebhook.events as NotifierConfig["webhook"]["events"]) ?? DEFAULT_CONFIG.webhook.events,
    },
  };
}
