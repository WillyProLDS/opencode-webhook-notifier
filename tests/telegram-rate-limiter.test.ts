import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramApiError } from "../src/transport/telegram.js";
import { createTelegramRateLimiter } from "../src/transport/telegram-rate-limiter.js";

describe("TelegramRateLimiter", () => {
  let virtualTime = 10000;
  const mockNow = () => virtualTime;

  beforeEach(() => {
    vi.useFakeTimers();
    virtualTime = 10000;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes single request immediately", async () => {
    const limiter = createTelegramRateLimiter({ now: mockNow });
    const task = vi.fn().mockResolvedValue("done");

    const resultPromise = limiter.schedule("bot123", "chat1", task);
    const result = await resultPromise;

    expect(result).toBe("done");
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("paces multiple requests to the same chat by minChatIntervalMs", async () => {
    const limiter = createTelegramRateLimiter({
      minChatIntervalMs: 1000,
      minBotIntervalMs: 50,
      now: mockNow,
    });

    const executionTimes: number[] = [];
    const task1 = vi.fn().mockImplementation(async () => {
      executionTimes.push(virtualTime);
      return "res1";
    });
    const task2 = vi.fn().mockImplementation(async () => {
      executionTimes.push(virtualTime);
      return "res2";
    });

    const p1 = limiter.schedule("bot123", "chat1", task1);
    const p2 = limiter.schedule("bot123", "chat1", task2);

    // First task should resolve immediately
    await p1;
    expect(task1).toHaveBeenCalledTimes(1);
    expect(task2).not.toHaveBeenCalled();

    // Advance time by 500ms (still within minChatIntervalMs)
    virtualTime += 500;
    await vi.advanceTimersByTimeAsync(500);
    expect(task2).not.toHaveBeenCalled();

    // Advance another 500ms (1000ms total)
    virtualTime += 500;
    await vi.advanceTimersByTimeAsync(500);
    const res2 = await p2;

    expect(res2).toBe("res2");
    expect(task2).toHaveBeenCalledTimes(1);
    expect(executionTimes[1]! - executionTimes[0]!).toBeGreaterThanOrEqual(1000);
  });

  it("paces requests to different chats under same bot by minBotIntervalMs", async () => {
    const limiter = createTelegramRateLimiter({
      minChatIntervalMs: 1000,
      minBotIntervalMs: 50,
      now: mockNow,
    });

    const executionTimes: number[] = [];
    const task1 = vi.fn().mockImplementation(async () => {
      executionTimes.push(virtualTime);
      return "chat1_done";
    });
    const task2 = vi.fn().mockImplementation(async () => {
      executionTimes.push(virtualTime);
      return "chat2_done";
    });

    const p1 = limiter.schedule("bot123", "chat1", task1);
    const p2 = limiter.schedule("bot123", "chat2", task2);

    await p1;
    expect(task1).toHaveBeenCalledTimes(1);
    expect(task2).not.toHaveBeenCalled();

    virtualTime += 50;
    await vi.advanceTimersByTimeAsync(50);
    const res2 = await p2;

    expect(res2).toBe("chat2_done");
    expect(task2).toHaveBeenCalledTimes(1);
  });

  it("pauses queue for retry_after seconds when 429 error occurs", async () => {
    const limiter = createTelegramRateLimiter({
      minChatIntervalMs: 1000,
      minBotIntervalMs: 50,
      now: mockNow,
    });

    const error429 = new TelegramApiError({
      status: 429,
      statusText: "Too Many Requests",
      retryAfterSeconds: 5,
    });

    const task1 = vi.fn().mockRejectedValue(error429);
    const task2 = vi.fn().mockResolvedValue("recovered");

    const p1 = limiter.schedule("bot123", "chat1", task1);
    const p2 = limiter.schedule("bot123", "chat1", task2);

    await expect(p1).rejects.toThrow(TelegramApiError);

    // At 2 seconds, task2 should still be paused
    virtualTime += 2000;
    await vi.advanceTimersByTimeAsync(2000);
    expect(task2).not.toHaveBeenCalled();

    // At 5 seconds (retry_after expired), task2 runs
    virtualTime += 3000;
    await vi.advanceTimersByTimeAsync(3000);
    const res2 = await p2;

    expect(res2).toBe("recovered");
    expect(task2).toHaveBeenCalledTimes(1);
  });

  it("rejects immediately when queue exceeds maxQueueSize", async () => {
    const limiter = createTelegramRateLimiter({
      minChatIntervalMs: 1000,
      maxQueueSize: 1,
      now: mockNow,
    });

    // p1 starts running immediately
    void limiter.schedule("bot1", "chat1", () => new Promise(() => {}));
    // p2 is queued (queue length = 1)
    const p2 = limiter.schedule("bot1", "chat1", () => Promise.resolve("ok2"));

    // p3 exceeds maxQueueSize (queue length >= 1)
    const p3 = limiter.schedule("bot1", "chat1", () => Promise.resolve("ok3"));

    await expect(p3).rejects.toThrow("Telegram rate limiter queue full");
    limiter.clear();
    await p2.catch(() => {});
  });

  it("rejects pending queued tasks on clear()", async () => {
    const limiter = createTelegramRateLimiter({
      minChatIntervalMs: 1000,
      now: mockNow,
    });

    const task1 = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500)));
    const task2 = vi.fn().mockResolvedValue("task2");

    void limiter.schedule("bot1", "chat1", task1);
    const p2 = limiter.schedule("bot1", "chat1", task2);

    limiter.clear();
    await expect(p2).rejects.toThrow("disposed");
  });
});
