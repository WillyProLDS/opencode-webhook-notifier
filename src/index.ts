import { basename } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import type { Permission } from "@opencode-ai/sdk";
import { createConfigService } from "./config/service.js";
import { createFocusDetector } from "./focus/index.js";
import { createLogger } from "./log/logger.js";
import { createEventRouter } from "./plugin/event-router.js";
import { createLifecycle } from "./plugin/lifecycle.js";
import { createNotifier } from "./plugin/notifier.js";
import { createPermissionDedupe } from "./plugin/permission-dedupe.js";
import { createSessionState } from "./plugin/session-state.js";
import { createTurnCounter } from "./plugin/turn-counter.js";
import { createWebhookSender } from "./transport/send.js";

const MEMORY_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export const WebhookNotifierPlugin: Plugin = async ({ client, directory }) => {
  const logger = createLogger();
  const lifecycle = createLifecycle();
  const configService = createConfigService({ logger });

  const clientEnv = process.env.OPENCODE_CLIENT;
  if (clientEnv && clientEnv !== "cli") {
    const initialConfig = configService.get();
    if (!initialConfig.enableOnDesktop) {
      lifecycle.dispose();
      return {};
    }
  }

  const initialConfig = configService.get();
  const focus = createFocusDetector({ cacheMs: initialConfig.focusCacheMs });
  const turnCounter = createTurnCounter();
  const webhookSender = createWebhookSender({ logger, timeoutMs: initialConfig.timeout * 1000 });
  const permissionDedupe = createPermissionDedupe();
  const sessionState = createSessionState({
    onIdleError: (error) => logger.warn("idle handler failed", { error: String(error) }),
  });

  lifecycle.register(() => webhookSender.dispose());
  lifecycle.register(() => sessionState.dispose());

  const notifier = createNotifier({
    config: () => configService.get(),
    focus,
    turnCounter,
    webhookSender,
    logger,
  });

  const projectName = directory ? basename(directory) : null;

  const router = createEventRouter({
    client,
    config: () => configService.get(),
    notifier,
    sessionState,
    permissionDedupe,
    logger,
    projectName,
  });

  const cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - MEMORY_CLEANUP_INTERVAL_MS;
    sessionState.pruneOlderThan(cutoff);
    permissionDedupe.prune(cutoff);
  }, MEMORY_CLEANUP_INTERVAL_MS);
  cleanupInterval.unref?.();
  lifecycle.register(() => clearInterval(cleanupInterval));

  return {
    event: async ({ event }) => {
      try {
        await router.handle(event);
      } catch (error) {
        logger.error("event router failed", { error: String(error) });
      }
    },
    "permission.ask": async (_input: Permission) => {
      if (!permissionDedupe.shouldSuppress(null)) {
        await notifier.notify({
          eventType: "permission",
          projectName,
        });
      }
    },
    "tool.execute.before": async (input) => {
      if (input.tool === "question") {
        await notifier.notify({
          eventType: "question",
          projectName,
          sessionID: input.sessionID ?? null,
        });
      }
      if (input.tool === "plan_exit") {
        await notifier.notify({
          eventType: "plan_exit",
          projectName,
          sessionID: input.sessionID ?? null,
        });
      }
    },
  };
};

export default WebhookNotifierPlugin;
