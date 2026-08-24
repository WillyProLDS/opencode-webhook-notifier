import type { PluginInput } from "@opencode-ai/plugin";
import { runCommand } from "../command/runner.js";
import { getMessage, interpolateMessage, isEventCommandEnabled, isEventWebhookEnabled } from "../config/interpolate.js";
import type { EventType, NotifierConfig, PermissionDetails } from "../config/schema.js";
import type { FocusDetector } from "../focus/index.js";
import type { Logger } from "../log/logger.js";
import type { WebhookSender } from "../transport/send.js";
import type { TurnCounter } from "./turn-counter.js";

export interface NotifyContext {
  eventType: EventType;
  projectName: string | null;
  sessionID?: string | null;
  sessionTitle?: string | null;
  agentName?: string | null;
  elapsedSeconds?: number | null;
  permission?: PermissionDetails | null;
}

export interface Notifier {
  notify(ctx: NotifyContext, configOverride?: NotifierConfig): Promise<void>;
}

export interface NotifierDeps {
  config: () => NotifierConfig;
  focus: FocusDetector;
  turnCounter: TurnCounter;
  webhookSender: WebhookSender;
  logger: Logger;
  now?: () => Date;
}

function getNotificationTitle(config: NotifierConfig, projectName: string | null): string {
  if (config.showProjectName && projectName) return `OpenCode (${projectName})`;
  return "OpenCode";
}

function formatTimestamp(now: Date): string {
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function createNotifier(deps: NotifierDeps): Notifier {
  const now = deps.now ?? (() => new Date());

  return {
    async notify(ctx, configOverride) {
      const config = configOverride ?? deps.config();
      if (config.suppressWhenFocused && deps.focus.isTerminalFocused()) return;

      const timestamp = formatTimestamp(now());
      const turn = deps.turnCounter.next();

      const rawMessage = getMessage(config, ctx.eventType);
      const messageContext = {
        sessionTitle: config.showSessionTitle ? (ctx.sessionTitle ?? null) : null,
        agentName: ctx.agentName ?? null,
        projectName: ctx.projectName,
        timestamp,
        turn,
      };
      const message = interpolateMessage(rawMessage, messageContext);

      if (config.webhook.enabled && config.webhook.targets.length > 0 && isEventWebhookEnabled(config, ctx.eventType)) {
        const title = getNotificationTitle(config, ctx.projectName);
        const eventOverrides = config.webhook.events?.[ctx.eventType];
        const finalMessage = eventOverrides?.message
          ? interpolateMessage(eventOverrides.message, messageContext)
          : message;

        deps.webhookSender.send(config.webhook.targets, title, finalMessage, ctx.eventType, {
          overrides: eventOverrides,
          context: {
            event: ctx.eventType,
            timestamp,
            turn,
            sessionTitle: ctx.sessionTitle ?? null,
            agentName: ctx.agentName ?? null,
            projectName: ctx.projectName,
          },
          sessionID: ctx.sessionID ?? null,
          permission: ctx.permission ?? null,
        });
      }

      const minDuration = config.command.minDuration;
      const shouldSkipCommand =
        !isEventCommandEnabled(config, ctx.eventType) ||
        (typeof minDuration === "number" &&
          Number.isFinite(minDuration) &&
          minDuration > 0 &&
          typeof ctx.elapsedSeconds === "number" &&
          Number.isFinite(ctx.elapsedSeconds) &&
          ctx.elapsedSeconds < minDuration);

      if (!shouldSkipCommand) {
        runCommand(config, {
          event: ctx.eventType,
          message,
          sessionTitle: ctx.sessionTitle ?? null,
          agentName: ctx.agentName ?? null,
          projectName: ctx.projectName,
          timestamp,
          turn,
        });
      }
    },
  };
}

export interface SessionInfo {
  isChild: boolean;
  title: string | null;
}

export async function getSessionInfo(client: PluginInput["client"], sessionID: string): Promise<SessionInfo> {
  try {
    const response = await client.session.get({ path: { id: sessionID } });
    const title = typeof response.data?.title === "string" ? response.data.title : null;
    return {
      isChild: !!response.data?.parentID,
      title,
    };
  } catch {
    return { isChild: false, title: null };
  }
}

export async function getElapsedSinceLastPrompt(
  client: PluginInput["client"],
  sessionID: string,
  nowMs: number = Date.now(),
): Promise<number | null> {
  try {
    const response = await client.session.messages({ path: { id: sessionID } });
    const messages = response.data ?? [];

    let lastUserMessageTime: number | null = null;
    for (const msg of messages) {
      const info = msg.info;
      if (info.role === "user" && typeof info.time?.created === "number") {
        if (lastUserMessageTime === null || info.time.created > lastUserMessageTime) {
          lastUserMessageTime = info.time.created;
        }
      }
    }

    if (lastUserMessageTime !== null) return (nowMs - lastUserMessageTime) / 1000;
  } catch {}

  return null;
}

const AGENT_NAME_PATTERN = /\s*\(@([^\s)]+)\s+subagent\)\s*$/;

export function extractAgentNameFromSessionTitle(sessionTitle: unknown): string {
  if (typeof sessionTitle !== "string" || sessionTitle.length === 0) return "";
  const match = sessionTitle.match(AGENT_NAME_PATTERN);
  return match ? (match[1] ?? "") : "";
}

export function shouldResolveAgentNameForEvent(config: NotifierConfig, eventType: EventType): boolean {
  if (getMessage(config, eventType).includes("{agentName}")) return true;

  if (!config.command.enabled || !isEventCommandEnabled(config, eventType)) return false;
  if (config.command.path.includes("{agentName}")) return true;
  return (config.command.args ?? []).some((arg) => arg.includes("{agentName}"));
}
