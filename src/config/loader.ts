import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Logger } from "../log/logger.js";
import { noopLogger } from "../log/logger.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { EventType, NotifierConfig, WebhookEventOverrides } from "./schema.js";
import { eventConfigSchema, rawConfigSchema, webhookEventOverridesSchema, webhookTargetSchema } from "./validator.js";

export function getConfigPath(): string {
  if (process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH) {
    return process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH;
  }
  return join(homedir(), ".config", "opencode", "opencode-webhook-notifier.json");
}

function parseEventConfig(
  userEvent: boolean | { webhook?: boolean; command?: boolean } | undefined,
  defaultConfig: { webhook: boolean; command: boolean },
): { webhook: boolean; command: boolean } {
  if (userEvent === undefined) return defaultConfig;
  const result = eventConfigSchema.safeParse(userEvent);
  if (result.success) return result.data;
  return defaultConfig;
}

function parseCommand(userCommand: Record<string, unknown> | undefined, logger: Logger): NotifierConfig["command"] {
  if (!userCommand) return DEFAULT_CONFIG.command;
  const result = rawConfigSchema.shape.command.safeParse(userCommand);
  if (!result.success) {
    for (const issue of result.error.issues) {
      logger.warn("config validation error in command", {
        path: issue.path.join("."),
        message: issue.message,
      });
    }
    return DEFAULT_CONFIG.command;
  }
  const { enabled, path, args, minDuration } = result.data ?? {};
  const validMinDuration =
    typeof minDuration === "number" && Number.isFinite(minDuration) && minDuration >= 0 ? minDuration : 0;
  return {
    enabled: enabled ?? DEFAULT_CONFIG.command.enabled,
    path: path ?? DEFAULT_CONFIG.command.path,
    args,
    minDuration: validMinDuration,
  };
}

function parseTargets(rawTargets: unknown[], logger: Logger): NotifierConfig["webhook"]["targets"] {
  const valid: NotifierConfig["webhook"]["targets"] = [];
  for (let i = 0; i < rawTargets.length; i++) {
    const target = rawTargets[i];
    const result = webhookTargetSchema.safeParse(target);
    if (result.success) {
      valid.push(result.data);
    } else {
      const pathParts = result.error.issues.map((iss) => iss.path.join(".")).filter(Boolean);
      const messages = result.error.issues.map((iss) => iss.message);
      const typeHint =
        target && typeof target === "object" && "type" in target
          ? String((target as Record<string, unknown>).type)
          : "unknown";
      logger.warn("invalid webhook target rejected", {
        index: i,
        type: typeHint,
        fields: pathParts.length > 0 ? pathParts : undefined,
        reasons: messages,
      });
    }
  }
  return valid;
}

const KNOWN_EVENT_TYPES = [
  "permission",
  "complete",
  "subagent_complete",
  "error",
  "question",
  "user_cancelled",
  "plan_exit",
] as const;

function parseWebhookEvents(raw: Record<string, unknown> | undefined): NotifierConfig["webhook"]["events"] {
  if (!raw) return undefined;
  const result: Partial<Record<EventType, WebhookEventOverrides>> = {};
  for (const key of KNOWN_EVENT_TYPES) {
    const entry = raw[key];
    if (entry === undefined) continue;
    const parsed = webhookEventOverridesSchema.safeParse(entry);
    if (parsed.success && parsed.data !== undefined) {
      result[key] = parsed.data;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function loadConfig(logger?: Logger): NotifierConfig {
  const log = logger ?? noopLogger;
  const configPath = getConfigPath();

  if (!existsSync(configPath)) return DEFAULT_CONFIG;

  let fileContent: string;
  try {
    fileContent = readFileSync(configPath, "utf-8");
  } catch (err) {
    log.warn("failed to read config file, using defaults", { path: configPath, error: String(err) });
    return DEFAULT_CONFIG;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch (err) {
    log.warn("config file contains malformed JSON, using defaults", {
      path: configPath,
      error: String(err),
    });
    return DEFAULT_CONFIG;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    log.warn("config file root is not a JSON object, using defaults", { path: configPath });
    return DEFAULT_CONFIG;
  }

  const rawResult = rawConfigSchema.safeParse(parsed);
  if (!rawResult.success) {
    for (const issue of rawResult.error.issues) {
      log.warn("config validation error", {
        path: issue.path.join("."),
        message: issue.message,
      });
    }
    return DEFAULT_CONFIG;
  }
  const userConfig = rawResult.data;

  const userWebhook = userConfig.webhook ?? {};
  const userEvents = userConfig.events ?? {};
  const userMessages = userConfig.messages ?? {};

  const webhookTargets = parseTargets(userWebhook.targets ?? [], log);

  return {
    timeout: userConfig.timeout ?? DEFAULT_CONFIG.timeout,
    showProjectName: userConfig.showProjectName ?? DEFAULT_CONFIG.showProjectName,
    showSessionTitle: userConfig.showSessionTitle ?? DEFAULT_CONFIG.showSessionTitle,
    suppressWhenFocused: userConfig.suppressWhenFocused ?? DEFAULT_CONFIG.suppressWhenFocused,
    enableOnDesktop: userConfig.enableOnDesktop ?? DEFAULT_CONFIG.enableOnDesktop,
    focusCacheMs: userConfig.focusCacheMs ?? DEFAULT_CONFIG.focusCacheMs,
    command: parseCommand(userConfig.command, log),
    events: {
      permission: parseEventConfig(userEvents.permission, DEFAULT_CONFIG.events.permission),
      complete: parseEventConfig(userEvents.complete, DEFAULT_CONFIG.events.complete),
      subagent_complete: parseEventConfig(userEvents.subagent_complete, DEFAULT_CONFIG.events.subagent_complete),
      error: parseEventConfig(userEvents.error, DEFAULT_CONFIG.events.error),
      question: parseEventConfig(userEvents.question, DEFAULT_CONFIG.events.question),
      user_cancelled: parseEventConfig(userEvents.user_cancelled, DEFAULT_CONFIG.events.user_cancelled),
      plan_exit: parseEventConfig(userEvents.plan_exit, DEFAULT_CONFIG.events.plan_exit),
    },
    messages: {
      permission: userMessages.permission ?? DEFAULT_CONFIG.messages.permission,
      complete: userMessages.complete ?? DEFAULT_CONFIG.messages.complete,
      subagent_complete: userMessages.subagent_complete ?? DEFAULT_CONFIG.messages.subagent_complete,
      error: userMessages.error ?? DEFAULT_CONFIG.messages.error,
      question: userMessages.question ?? DEFAULT_CONFIG.messages.question,
      user_cancelled: userMessages.user_cancelled ?? DEFAULT_CONFIG.messages.user_cancelled,
      plan_exit: userMessages.plan_exit ?? DEFAULT_CONFIG.messages.plan_exit,
    },
    webhook: {
      enabled: userWebhook.enabled ?? DEFAULT_CONFIG.webhook.enabled,
      targets: webhookTargets,
      events: parseWebhookEvents(userWebhook.events) ?? DEFAULT_CONFIG.webhook.events,
    },
  };
}
