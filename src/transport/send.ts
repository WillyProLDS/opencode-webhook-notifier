import type { EventType, WebhookEventOverrides, WebhookTarget } from "../config/schema.js";
import type { Logger } from "../log/logger.js";
import { type CircuitBreaker, createCircuitBreaker } from "../util/circuit-breaker.js";
import { createDebouncer, type KeyedDebouncer } from "../util/debounce.js";
import { withRetry } from "../util/retry.js";
import { sendDiscord } from "./discord.js";
import { type GenericContext, sendGeneric } from "./generic.js";
import { sendGotify } from "./gotify.js";
import { sendNtfy } from "./ntfy.js";
import { sendTelegram } from "./telegram.js";

export interface WebhookSendOptions {
  overrides?: WebhookEventOverrides;
  context?: GenericContext;
  sessionID?: string | null;
}

export interface WebhookSender {
  send(
    targets: WebhookTarget[],
    title: string,
    message: string,
    eventType: EventType,
    options?: WebhookSendOptions,
  ): void;
  dispose(): void;
}

export interface WebhookSenderOptions {
  logger?: Logger;
  debouncer?: KeyedDebouncer;
  debounceMs?: number;
  defaultRetry?: { maxAttempts?: number; initialDelayMs?: number; maxDelayMs?: number };
  defaultCircuit?: { failureThreshold?: number; cooldownMs?: number };
  /** Per-request HTTP timeout in milliseconds. 0 or undefined disables. */
  timeoutMs?: number;
}

/** Hash a token to a short non-reversible suffix for use as an identity key. */
function hashSuffix(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) - h + value.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function targetIdentity(target: WebhookTarget): string {
  switch (target.type) {
    case "telegram":
      // Include botToken hash so distinct bots targeting the same chatId
      // get isolated circuit breakers and retry state.
      return `telegram:${target.chatId}:${hashSuffix(target.botToken)}`;
    default:
      return `${target.type}:${target.url}`;
  }
}

async function dispatch(
  target: WebhookTarget,
  title: string,
  message: string,
  options: WebhookSendOptions,
  timeoutMs?: number,
): Promise<void> {
  switch (target.type) {
    case "discord":
      await sendDiscord(target, title, message, options.overrides, timeoutMs);
      break;
    case "ntfy":
      await sendNtfy(target, title, message, options.overrides, timeoutMs);
      break;
    case "gotify":
      await sendGotify(target, title, message, options.overrides, timeoutMs);
      break;
    case "telegram":
      await sendTelegram(target, title, message, options.overrides, timeoutMs);
      break;
    case "generic":
      if (!options.context) {
        throw new Error("Generic webhook requires context (event, timestamp, turn)");
      }
      await sendGeneric(target, title, message, options.context, options.overrides, timeoutMs);
      break;
    default: {
      const unknown = target as { type?: unknown };
      throw new Error(`Unknown webhook type: ${String(unknown.type)}`);
    }
  }
}

export function createWebhookSender(options: WebhookSenderOptions = {}): WebhookSender {
  const debouncer = options.debouncer ?? createDebouncer(options.debounceMs ?? 1000);
  const logger = options.logger;
  const ownsDebouncer = !options.debouncer;
  const breakers = new Map<string, CircuitBreaker>();
  const timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : undefined;

  const defaultRetry = {
    maxAttempts: options.defaultRetry?.maxAttempts ?? 3,
    initialDelayMs: options.defaultRetry?.initialDelayMs ?? 500,
    maxDelayMs: options.defaultRetry?.maxDelayMs ?? 30_000,
  };
  const defaultCircuit = {
    failureThreshold: options.defaultCircuit?.failureThreshold ?? 5,
    cooldownMs: options.defaultCircuit?.cooldownMs ?? 60_000,
  };

  function getBreaker(target: WebhookTarget): CircuitBreaker {
    const id = targetIdentity(target);
    let breaker = breakers.get(id);
    if (!breaker) {
      breaker = createCircuitBreaker({
        failureThreshold: target.circuitBreaker?.failureThreshold ?? defaultCircuit.failureThreshold,
        cooldownMs: target.circuitBreaker?.cooldownMs ?? defaultCircuit.cooldownMs,
      });
      breakers.set(id, breaker);
    }
    return breaker;
  }

  async function deliver(
    target: WebhookTarget,
    title: string,
    message: string,
    options: WebhookSendOptions,
  ): Promise<void> {
    const breaker = getBreaker(target);
    if (!breaker.allow()) {
      logger?.warn("circuit open, skipping target", {
        target: targetIdentity(target),
        type: target.type,
      });
      return;
    }

    const retry = {
      maxAttempts: target.retry?.maxAttempts ?? defaultRetry.maxAttempts,
      initialDelayMs: target.retry?.initialDelayMs ?? defaultRetry.initialDelayMs,
      maxDelayMs: target.retry?.maxDelayMs ?? defaultRetry.maxDelayMs,
    };

    try {
      await withRetry(() => dispatch(target, title, message, options, timeoutMs), {
        maxAttempts: retry.maxAttempts,
        initialDelayMs: retry.initialDelayMs,
        maxDelayMs: retry.maxDelayMs,
        onAttempt: (attempt, error) => {
          logger?.warn("webhook attempt failed", {
            target: targetIdentity(target),
            type: target.type,
            attempt,
            error: String(error),
          });
        },
      });
      breaker.recordSuccess();
    } catch (error) {
      breaker.recordFailure();
      logger?.error("webhook delivery exhausted", {
        target: targetIdentity(target),
        type: target.type,
        error: String(error),
      });
    }
  }

  return {
    send(targets, title, message, eventType, sendOptions) {
      if (!targets || targets.length === 0) return;

      const key = `webhook-${eventType}-${sendOptions?.sessionID ?? "global"}`;
      debouncer.schedule(key, async () => {
        await Promise.all(
          targets.map((target) => deliver(target, title, message, sendOptions ?? {}).catch(() => undefined)),
        );
      });
    },
    dispose() {
      if (ownsDebouncer) debouncer.cancelAll();
    },
  };
}
