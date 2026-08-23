export type WebhookType = "discord" | "ntfy" | "gotify" | "telegram" | "generic";

export type EventType =
  | "permission"
  | "complete"
  | "subagent_complete"
  | "error"
  | "question"
  | "user_cancelled"
  | "plan_exit";

export interface BaseTargetOptions {
  name?: string;
  retry?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  };
  circuitBreaker?: {
    failureThreshold?: number;
    cooldownMs?: number;
  };
}

export interface DiscordTarget extends BaseTargetOptions {
  type: "discord";
  url: string;
  username?: string;
  avatarUrl?: string;
  headers?: Record<string, string>;
  basicAuth?: { username: string; password: string };
}

export interface NtfyTarget extends BaseTargetOptions {
  type: "ntfy";
  url: string;
  topic?: string;
  priority?: number;
  tags?: string[];
  headers?: Record<string, string>;
  basicAuth?: { username: string; password: string };
}

export interface GotifyTarget extends BaseTargetOptions {
  type: "gotify";
  url: string;
  token?: string;
  priority?: number;
  headers?: Record<string, string>;
  basicAuth?: { username: string; password: string };
}

export interface TelegramTarget extends BaseTargetOptions {
  type: "telegram";
  botToken: string;
  chatId: string | number;
  parseMode?: "MarkdownV2" | "HTML" | "Markdown";
  disableNotification?: boolean;
  disableLinkPreview?: boolean;
  messageThreadId?: number;
  headers?: Record<string, string>;
}

export interface GenericTarget extends BaseTargetOptions {
  type: "generic";
  url: string;
  method?: "POST" | "PUT" | "PATCH";
  bodyTemplate?: unknown;
  headers?: Record<string, string>;
  basicAuth?: { username: string; password: string };
  bearer?: string;
}

export type WebhookTarget = DiscordTarget | NtfyTarget | GotifyTarget | TelegramTarget | GenericTarget;

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
  events?: Partial<Record<EventType, WebhookEventOverrides>>;
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

export interface PermissionDetails {
  id?: string | null;
  permission?: string | null;
  patterns?: string[] | null;
  always?: string[] | null;
  metadata?: Record<string, unknown> | null;
  title?: string | null;
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
  focusCacheMs: number;
  command: CommandConfig;
  events: Record<EventType, EventConfig>;
  messages: Record<EventType, string>;
  webhook: WebhookConfig;
}
