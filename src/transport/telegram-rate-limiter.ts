import { TelegramApiError } from "./telegram.js";

export interface TelegramRateLimiterOptions {
  /** Minimum delay between requests to the same chat in milliseconds. Defaults to 1000ms. */
  minChatIntervalMs?: number;
  /** Minimum delay between requests to the same bot token in milliseconds. Defaults to 50ms. */
  minBotIntervalMs?: number;
  /** Maximum queued requests per chat before dropping/rejecting new ones. Defaults to 100. */
  maxQueueSize?: number;
  /** Custom clock provider for deterministic testing. */
  now?: () => number;
}

interface QueuedItem<T = unknown> {
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  chatId: string | number;
  botToken: string;
}

export interface TelegramRateLimiter {
  schedule<T>(botToken: string, chatId: string | number, task: () => Promise<T>): Promise<T>;
  pause(botToken: string, chatId?: string | number, durationMs?: number): void;
  clear(): void;
  getQueueLength(botToken: string, chatId?: string | number): number;
}

export function createTelegramRateLimiter(options: TelegramRateLimiterOptions = {}): TelegramRateLimiter {
  const minChatIntervalMs = options.minChatIntervalMs ?? 1000;
  const minBotIntervalMs = options.minBotIntervalMs ?? 50;
  const maxQueueSize = options.maxQueueSize ?? 100;
  const now = options.now ?? Date.now;

  // Track timestamps
  const lastBotDispatch = new Map<string, number>();
  const lastChatDispatch = new Map<string, number>();
  const botPausedUntil = new Map<string, number>();
  const chatPausedUntil = new Map<string, number>();

  // Per-bot queues: botToken -> QueuedItem[]
  const queues = new Map<string, QueuedItem[]>();
  const running = new Set<string>();

  function chatKey(botToken: string, chatId: string | number): string {
    return `${botToken}:${chatId}`;
  }

  function getRequiredDelay(botToken: string, chatId: string | number): number {
    const current = now();
    const cKey = chatKey(botToken, chatId);

    const botPause = (botPausedUntil.get(botToken) ?? 0) - current;
    const chatPause = (chatPausedUntil.get(cKey) ?? 0) - current;

    const lastBot = lastBotDispatch.get(botToken) ?? 0;
    const botIntervalWait = lastBot + minBotIntervalMs - current;

    const lastChat = lastChatDispatch.get(cKey) ?? 0;
    const chatIntervalWait = lastChat + minChatIntervalMs - current;

    return Math.max(0, botPause, chatPause, botIntervalWait, chatIntervalWait);
  }

  async function processBotQueue(botToken: string): Promise<void> {
    if (running.has(botToken)) return;
    running.add(botToken);

    try {
      while (true) {
        const queue = queues.get(botToken);
        if (!queue || queue.length === 0) break;

        const item = queue[0];
        if (!item) {
          queue.shift();
          continue;
        }

        const delay = getRequiredDelay(botToken, item.chatId);
        if (delay > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }

        // Check again if still the head item
        if (queue[0] !== item) continue;
        queue.shift();

        const cKey = chatKey(botToken, item.chatId);
        const dispatchTime = now();
        lastBotDispatch.set(botToken, dispatchTime);
        lastChatDispatch.set(cKey, dispatchTime);

        try {
          const result = await item.task();
          item.resolve(result);
        } catch (error) {
          if (error instanceof TelegramApiError && error.status === 429) {
            const retryMs = (error.retryAfterSeconds ?? 1) * 1000;
            const pauseTime = now() + retryMs;
            chatPausedUntil.set(cKey, Math.max(chatPausedUntil.get(cKey) ?? 0, pauseTime));
            botPausedUntil.set(botToken, Math.max(botPausedUntil.get(botToken) ?? 0, pauseTime));
          }
          item.reject(error);
        }
      }
    } finally {
      running.delete(botToken);
    }
  }

  return {
    schedule<T>(botToken: string, chatId: string | number, task: () => Promise<T>): Promise<T> {
      let queue = queues.get(botToken);
      if (!queue) {
        queue = [];
        queues.set(botToken, queue);
      }

      if (queue.length >= maxQueueSize) {
        return Promise.reject(new Error(`Telegram rate limiter queue full for bot (${queue.length}/${maxQueueSize})`));
      }

      return new Promise<T>((resolve, reject) => {
        queue?.push({
          task: task as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject,
          chatId,
          botToken,
        });
        processBotQueue(botToken).catch(() => {});
      });
    },

    pause(botToken: string, chatId?: string | number, durationMs = 1000) {
      const until = now() + durationMs;
      if (chatId !== undefined) {
        const cKey = chatKey(botToken, chatId);
        chatPausedUntil.set(cKey, Math.max(chatPausedUntil.get(cKey) ?? 0, until));
      } else {
        botPausedUntil.set(botToken, Math.max(botPausedUntil.get(botToken) ?? 0, until));
      }
    },

    clear() {
      for (const queue of queues.values()) {
        for (const item of queue) {
          item.reject(new Error("Telegram rate limiter disposed"));
        }
      }
      queues.clear();
      running.clear();
      lastBotDispatch.clear();
      lastChatDispatch.clear();
      botPausedUntil.clear();
      chatPausedUntil.clear();
    },

    getQueueLength(botToken: string, chatId?: string | number): number {
      const queue = queues.get(botToken);
      if (!queue) return 0;
      if (chatId === undefined) return queue.length;
      return queue.filter((item) => String(item.chatId) === String(chatId)).length;
    },
  };
}
