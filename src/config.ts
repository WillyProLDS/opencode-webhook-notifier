import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export type WebhookType = "discord" | "ntfy" | "gotify";

export type EventType =
  | "permission"
  | "complete"
  | "subagent_complete"
  | "error"
  | "question"
  | "user_cancelled"
  | "plan_exit";

export interface WebhookTarget {
  type: WebhookType;
  url: string;
  username?: string;
  avatarUrl?: string;
  topic?: string;
  priority?: number;
  tags?: string[];
  token?: string;
  headers?: Record<string, string>;
  basicAuth?: { username: string; password: string };
}

export interface WebhookEventOverrides {
  message?: string;
  priority?: number;
  tags?: string[];
  color?: number;
  gotifyPriority?: number;
}

export interface WebhookConfig {
  enabled: boolean;
  targets: WebhookTarget[];
  events?: {
    permission?: WebhookEventOverrides;
    complete?: WebhookEventOverrides;
    subagent_complete?: WebhookEventOverrides;
    error?: WebhookEventOverrides;
    question?: WebhookEventOverrides;
    user_cancelled?: WebhookEventOverrides;
    plan_exit?: WebhookEventOverrides;
  };
}

export interface CommandConfig {
  enabled: boolean;
  path: string;
  args?: string[];
  minDuration?: number;
}

export interface EventConfig {
  webhook: boolean;
  command: boolean;
}

export interface MessageContext {
  sessionTitle?: string | null;
  agentName?: string | null;
  projectName?: string | null;
  timestamp?: string | null;
  turn?: number | null;
}

export interface NotifierConfig {
  timeout: number;
  showProjectName: boolean;
  showSessionTitle: boolean;
  suppressWhenFocused: boolean;
  enableOnDesktop: boolean;
  command: CommandConfig;
  events: Record<EventType, EventConfig>;
  messages: Record<EventType, string>;
  webhook: WebhookConfig;
}

const DEFAULT_EVENT_CONFIG: EventConfig = {
  webhook: true,
  command: true,
};

const DEFAULT_CONFIG: NotifierConfig = {
  timeout: 5,
  showProjectName: true,
  showSessionTitle: false,
  suppressWhenFocused: true,
  enableOnDesktop: false,
  command: {
    enabled: false,
    path: "",
    minDuration: 0,
  },
  events: {
    permission: { ...DEFAULT_EVENT_CONFIG },
    complete: { ...DEFAULT_EVENT_CONFIG },
    subagent_complete: { webhook: false, command: true },
    error: { ...DEFAULT_EVENT_CONFIG },
    question: { ...DEFAULT_EVENT_CONFIG },
    user_cancelled: { webhook: false, command: true },
    plan_exit: { ...DEFAULT_EVENT_CONFIG },
  },
  messages: {
    permission: "Session needs permission: {sessionTitle}",
    complete: "Session has finished: {sessionTitle}",
    subagent_complete: "Subagent task completed: {sessionTitle}",
    error: "Session encountered an error: {sessionTitle}",
    question: "Session has a question: {sessionTitle}",
    user_cancelled: "Session was cancelled by user: {sessionTitle}",
    plan_exit: "Plan ready for review: {sessionTitle}",
  },
  webhook: {
    enabled: true,
    targets: [],
  },
};

export function getConfigPath(): string {
  if (process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH) {
    return process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH;
  }
  return join(homedir(), ".config", "opencode", "opencode-webhook-notifier.json");
}

export function getStatePath(): string {
  const configPath = getConfigPath();
  return join(dirname(configPath), "opencode-webhook-notifier-state.json");
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

export function loadConfig(): NotifierConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const fileContent = readFileSync(configPath, "utf-8");
    const userConfig = JSON.parse(fileContent);

    const userCommand = userConfig.command ?? {};
    const commandArgs = Array.isArray(userCommand.args)
      ? userCommand.args.filter((arg: unknown) => typeof arg === "string")
      : undefined;

    const commandMinDuration =
      typeof userCommand.minDuration === "number" &&
      Number.isFinite(userCommand.minDuration) &&
      userCommand.minDuration > 0
        ? userCommand.minDuration
        : 0;

    const webhookTargets: WebhookTarget[] = Array.isArray(userConfig.webhook?.targets)
      ? userConfig.webhook.targets.filter(
          (t: unknown) => t && typeof t === "object" && "url" in t && "type" in t,
        )
      : [];

    return {
      timeout:
        typeof userConfig.timeout === "number" && userConfig.timeout > 0
          ? userConfig.timeout
          : DEFAULT_CONFIG.timeout,
      showProjectName: userConfig.showProjectName ?? DEFAULT_CONFIG.showProjectName,
      showSessionTitle: userConfig.showSessionTitle ?? DEFAULT_CONFIG.showSessionTitle,
      suppressWhenFocused: userConfig.suppressWhenFocused ?? DEFAULT_CONFIG.suppressWhenFocused,
      enableOnDesktop:
        typeof userConfig.enableOnDesktop === "boolean"
          ? userConfig.enableOnDesktop
          : DEFAULT_CONFIG.enableOnDesktop,
      command: {
        enabled: typeof userCommand.enabled === "boolean" ? userCommand.enabled : DEFAULT_CONFIG.command.enabled,
        path: typeof userCommand.path === "string" ? userCommand.path : DEFAULT_CONFIG.command.path,
        args: commandArgs,
        minDuration: commandMinDuration,
      },
      events: {
        permission: parseEventConfig(userConfig.events?.permission, DEFAULT_CONFIG.events.permission),
        complete: parseEventConfig(userConfig.events?.complete, DEFAULT_CONFIG.events.complete),
        subagent_complete: parseEventConfig(userConfig.events?.subagent_complete, DEFAULT_CONFIG.events.subagent_complete),
        error: parseEventConfig(userConfig.events?.error, DEFAULT_CONFIG.events.error),
        question: parseEventConfig(userConfig.events?.question, DEFAULT_CONFIG.events.question),
        user_cancelled: parseEventConfig(userConfig.events?.user_cancelled, DEFAULT_CONFIG.events.user_cancelled),
        plan_exit: parseEventConfig(userConfig.events?.plan_exit, DEFAULT_CONFIG.events.plan_exit),
      },
      messages: {
        permission: userConfig.messages?.permission ?? DEFAULT_CONFIG.messages.permission,
        complete: userConfig.messages?.complete ?? DEFAULT_CONFIG.messages.complete,
        subagent_complete: userConfig.messages?.subagent_complete ?? DEFAULT_CONFIG.messages.subagent_complete,
        error: userConfig.messages?.error ?? DEFAULT_CONFIG.messages.error,
        question: userConfig.messages?.question ?? DEFAULT_CONFIG.messages.question,
        user_cancelled: userConfig.messages?.user_cancelled ?? DEFAULT_CONFIG.messages.user_cancelled,
        plan_exit: userConfig.messages?.plan_exit ?? DEFAULT_CONFIG.messages.plan_exit,
      },
      webhook: {
        enabled: typeof userConfig.webhook?.enabled === "boolean" ? userConfig.webhook.enabled : DEFAULT_CONFIG.webhook.enabled,
        targets: webhookTargets,
        events: userConfig.webhook?.events ?? DEFAULT_CONFIG.webhook.events,
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

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

  const sessionTitle = context.sessionTitle || "";
  result = result.replaceAll("{sessionTitle}", sessionTitle);

  const agentName = context.agentName || "";
  result = result.replaceAll("{agentName}", agentName);

  const projectName = context.projectName || "";
  result = result.replaceAll("{projectName}", projectName);

  const timestamp = context.timestamp || "";
  result = result.replaceAll("{timestamp}", timestamp);

  const turn = context.turn != null ? String(context.turn) : "";
  result = result.replaceAll("{turn}", turn);

  result = result.replace(/\s*[:\-|]\s*$/, "").trim();
  result = result.replace(/\s{2,}/g, " ");

  return result;
}
