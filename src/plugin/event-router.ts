import type { PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import type { NotifierConfig } from "../config/schema.js";
import type { Logger } from "../log/logger.js";
import type { Notifier } from "./notifier.js";
import { extractAgentNameFromSessionTitle, getSessionInfo, shouldResolveAgentNameForEvent } from "./notifier.js";
import type { PermissionDedupe } from "./permission-dedupe.js";
import type { SessionState } from "./session-state.js";

export interface EventRouterDeps {
  client: PluginInput["client"];
  config: () => NotifierConfig;
  notifier: Notifier;
  sessionState: SessionState;
  permissionDedupe: PermissionDedupe;
  logger: Logger;
  projectName: string | null;
}

const PERMISSION_EVENT_TYPES = new Set<string>(["permission.asked", "permission.updated"]);

export interface EventRouter {
  handle(event: Event): Promise<void>;
}

export function createEventRouter(deps: EventRouterDeps): EventRouter {
  async function dispatch(
    eventType: Parameters<Notifier["notify"]>[0]["eventType"],
    sessionID: string | null,
    preloadedTitle?: string | null,
  ): Promise<void> {
    const config = deps.config();

    let sessionTitle: string | null = preloadedTitle ?? null;
    const needsLookup =
      sessionID && !sessionTitle && (config.showSessionTitle || shouldResolveAgentNameForEvent(config, eventType));
    if (needsLookup) {
      const info = await getSessionInfo(deps.client, sessionID);
      sessionTitle = info.title;
    }

    const agentName = extractAgentNameFromSessionTitle(sessionTitle);

    await deps.notifier.notify(
      {
        eventType,
        projectName: deps.projectName,
        sessionID,
        sessionTitle,
        agentName: agentName.length > 0 ? agentName : null,
      },
      config,
    );
  }

  return {
    async handle(event) {
      const observedType: string = event.type;
      deps.logger.debug("event received", { type: observedType });

      if (PERMISSION_EVENT_TYPES.has(observedType)) {
        const properties = event.properties as { sessionID?: unknown };
        const sessionID = typeof properties?.sessionID === "string" ? properties.sessionID : null;
        if (!deps.permissionDedupe.shouldSuppress(sessionID)) {
          await dispatch("permission", sessionID);
        }
        return;
      }

      if (event.type === "session.idle") {
        const sessionID = event.properties.sessionID;
        const config = deps.config();
        if (sessionID) {
          deps.sessionState.scheduleIdle(sessionID, async () => {
            const info = await getSessionInfo(deps.client, sessionID);
            const eventType = info.isChild ? "subagent_complete" : "complete";
            await dispatch(eventType, sessionID, info.title);
          });
        } else {
          await deps.notifier.notify(
            {
              eventType: "complete",
              projectName: deps.projectName,
              sessionID: null,
            },
            config,
          );
        }
        return;
      }

      if (event.type === "session.status" && event.properties.status.type === "busy") {
        deps.sessionState.markBusy(event.properties.sessionID);
        return;
      }

      if (event.type === "session.error") {
        const sessionID = event.properties.sessionID ?? null;
        deps.sessionState.markError(sessionID);
        const errorName = event.properties.error?.name;
        const eventType = errorName === "MessageAbortedError" ? "user_cancelled" : "error";

        let sessionTitle: string | null = null;
        const config = deps.config();
        if (sessionID && config.showSessionTitle) {
          const info = await getSessionInfo(deps.client, sessionID);
          sessionTitle = info.title;
        }

        await dispatch(eventType, sessionID, sessionTitle);
      }
    },
  };
}
