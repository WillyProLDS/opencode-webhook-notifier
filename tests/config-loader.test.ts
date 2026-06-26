import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMessage, isEventCommandEnabled, isEventWebhookEnabled } from "../src/config/interpolate.js";
import { loadConfig } from "../src/config/loader.js";
import type { EventType } from "../src/config/schema.js";
import type { Logger } from "../src/log/logger.js";

const FIXTURES = join(__dirname, "fixtures");

let tempDir: string;
let originalEnv: string | undefined;

function pointConfigAt(path: string): void {
  process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH = path;
}

beforeEach(() => {
  originalEnv = process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH;
  tempDir = mkdtempSync(join(tmpdir(), "wnotify-test-"));
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH;
  } else {
    process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH = originalEnv;
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns defaults when config file is missing", () => {
    pointConfigAt(join(tempDir, "does-not-exist.json"));
    const config = loadConfig();

    expect(config.timeout).toBe(5);
    expect(config.showProjectName).toBe(true);
    expect(config.showSessionTitle).toBe(false);
    expect(config.suppressWhenFocused).toBe(true);
    expect(config.enableOnDesktop).toBe(false);
    expect(config.focusCacheMs).toBe(250);
    expect(config.webhook.enabled).toBe(true);
    expect(config.webhook.targets).toEqual([]);
    expect(config.command.enabled).toBe(false);
  });

  it("returns defaults when config is malformed JSON", () => {
    pointConfigAt(join(FIXTURES, "malformed.json"));
    const config = loadConfig();

    expect(config.webhook.enabled).toBe(true);
    expect(config.webhook.targets).toEqual([]);
    expect(config.events.complete.webhook).toBe(true);
  });

  it("merges partial config with defaults", () => {
    pointConfigAt(join(FIXTURES, "partial.json"));
    const config = loadConfig();

    expect(config.webhook.enabled).toBe(false);
    expect(config.showProjectName).toBe(true);
    expect(config.events.permission.webhook).toBe(true);
    expect(config.messages.permission).toBe("Session needs permission: {sessionTitle}");
  });

  it("loads valid config and applies overrides", () => {
    pointConfigAt(join(FIXTURES, "valid.json"));
    const config = loadConfig();

    expect(config.webhook.enabled).toBe(true);
    expect(config.webhook.targets).toHaveLength(2);
    expect(config.webhook.targets[0]).toMatchObject({ type: "discord", url: "https://discord.example/webhook" });
    expect(config.showSessionTitle).toBe(true);
    expect(config.command.enabled).toBe(true);
    expect(config.command.path).toBe("/tmp/notify.sh");
    expect(config.command.args).toEqual(["--event", "{event}"]);
    expect(config.command.minDuration).toBe(5);
  });

  it("filters out invalid targets (missing type, url, or required field)", () => {
    pointConfigAt(join(FIXTURES, "invalid-targets.json"));
    const config = loadConfig();

    const urls = config.webhook.targets.map((t) => ("url" in t ? t.url : "(no-url)"));
    expect(urls).toEqual(["https://valid.example/webhook", "https://gotify.example/message"]);
  });

  it("expands boolean event config to both channels", () => {
    pointConfigAt(join(FIXTURES, "valid.json"));
    const config = loadConfig();

    expect(config.events.complete).toEqual({ webhook: false, command: false });
  });

  it("respects per-channel object event config", () => {
    pointConfigAt(join(FIXTURES, "valid.json"));
    const config = loadConfig();

    expect(config.events.permission).toEqual({ webhook: true, command: false });
  });

  it("subagent_complete defaults to webhook=false, command=true", () => {
    pointConfigAt(join(tempDir, "missing.json"));
    const config = loadConfig();

    expect(config.events.subagent_complete).toEqual({ webhook: false, command: true });
  });

  it("user_cancelled defaults to webhook=false, command=true", () => {
    pointConfigAt(join(tempDir, "missing.json"));
    const config = loadConfig();

    expect(config.events.user_cancelled).toEqual({ webhook: false, command: true });
  });

  it("custom messages override defaults; missing ones fall back", () => {
    pointConfigAt(join(FIXTURES, "valid.json"));
    const config = loadConfig();

    expect(getMessage(config, "permission")).toBe("custom permission: {sessionTitle}");
    expect(getMessage(config, "complete")).toBe("Session has finished: {sessionTitle}");
  });

  it("preserves OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH semantics", () => {
    const customPath = join(tempDir, "custom.json");
    writeFileSync(customPath, JSON.stringify({ showProjectName: false }));
    pointConfigAt(customPath);

    const config = loadConfig();
    expect(config.showProjectName).toBe(false);
  });

  it("isEventWebhookEnabled and isEventCommandEnabled reflect config", () => {
    pointConfigAt(join(FIXTURES, "valid.json"));
    const config = loadConfig();

    const event: EventType = "permission";
    expect(isEventWebhookEnabled(config, event)).toBe(true);
    expect(isEventCommandEnabled(config, event)).toBe(false);
  });

  it("accepts telegram targets with botToken + chatId; rejects malformed ones", () => {
    pointConfigAt(join(FIXTURES, "new-targets.json"));
    const config = loadConfig();

    const telegrams = config.webhook.targets.filter((t) => t.type === "telegram");
    expect(telegrams).toHaveLength(1);
    expect(telegrams[0]).toMatchObject({ type: "telegram", botToken: "TOKEN:ABC", chatId: "@channel" });
  });

  it("accepts generic targets with url; rejects empty url", () => {
    pointConfigAt(join(FIXTURES, "new-targets.json"));
    const config = loadConfig();

    const generics = config.webhook.targets.filter((t) => t.type === "generic");
    expect(generics).toHaveLength(1);
    expect(generics[0]).toMatchObject({ type: "generic", url: "https://example.com/webhook" });
  });

  function createMockLogger(): Logger & { calls: { msg: string; ctx?: Record<string, unknown> }[] } {
    const calls: { msg: string; ctx?: Record<string, unknown> }[] = [];
    const logger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn((msg: string, ctx?: Record<string, unknown>) => {
        calls.push({ msg, ctx });
      }),
      error: vi.fn(),
    };
    return Object.assign(logger, { calls });
  }

  it("logs a warning when config file contains malformed JSON", () => {
    pointConfigAt(join(FIXTURES, "malformed.json"));
    const logger = createMockLogger();
    const config = loadConfig(logger);

    expect(config.webhook.enabled).toBe(true);
    expect(config.webhook.targets).toEqual([]);
    const warnCalls = logger.calls.filter((c) => c.msg.includes("malformed JSON"));
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0]?.ctx).toMatchObject({ path: join(FIXTURES, "malformed.json") });
  });

  it("logs a warning for each rejected invalid target with reason", () => {
    pointConfigAt(join(FIXTURES, "invalid-targets.json"));
    const logger = createMockLogger();
    const config = loadConfig(logger);

    const urls = config.webhook.targets.map((t) => ("url" in t ? t.url : "(no-url)"));
    expect(urls).toEqual(["https://valid.example/webhook", "https://gotify.example/message"]);

    const targetWarnings = logger.calls.filter((c) => c.msg.includes("invalid webhook target rejected"));
    expect(targetWarnings.length).toBeGreaterThanOrEqual(3);
    for (const w of targetWarnings) {
      expect(w.ctx).toBeDefined();
      expect(w.ctx).toHaveProperty("index");
      expect(w.ctx).toHaveProperty("reasons");
    }
  });

  it("logs a warning when telegram target is missing botToken", () => {
    pointConfigAt(join(FIXTURES, "new-targets.json"));
    const logger = createMockLogger();
    const config = loadConfig(logger);

    const telegrams = config.webhook.targets.filter((t) => t.type === "telegram");
    expect(telegrams).toHaveLength(1);

    const targetWarnings = logger.calls.filter((c) => c.msg.includes("invalid webhook target rejected"));
    const telegramWarnings = targetWarnings.filter((w) => w.ctx?.type === "telegram");
    expect(telegramWarnings.length).toBeGreaterThanOrEqual(2);
    const reasons = telegramWarnings.flatMap((w) => (w.ctx?.reasons as string[]) ?? []);
    expect(reasons.some((r) => r.includes("botToken"))).toBe(true);
  });

  it("logs a warning when generic target has empty url", () => {
    pointConfigAt(join(FIXTURES, "new-targets.json"));
    const logger = createMockLogger();
    const config = loadConfig(logger);

    const generics = config.webhook.targets.filter((t) => t.type === "generic");
    expect(generics).toHaveLength(1);

    const targetWarnings = logger.calls.filter((c) => c.msg.includes("invalid webhook target rejected"));
    const genericWarnings = targetWarnings.filter((w) => w.ctx?.type === "generic");
    expect(genericWarnings).toHaveLength(1);
    const reasons = genericWarnings.flatMap((w) => (w.ctx?.reasons as string[]) ?? []);
    expect(reasons.some((r) => r.includes("non-empty string"))).toBe(true);
  });

  it("does not log anything when config file is missing", () => {
    pointConfigAt(join(tempDir, "does-not-exist.json"));
    const logger = createMockLogger();
    const config = loadConfig(logger);

    expect(config.webhook.enabled).toBe(true);
    expect(logger.calls).toHaveLength(0);
  });

  describe("webhook event overrides validation", () => {
    it("parses valid event overrides and filters unknown event types", () => {
      pointConfigAt(join(FIXTURES, "webhook-events.json"));
      const config = loadConfig();

      expect(config.webhook.events).toBeDefined();
      const events = config.webhook.events!;

      // Known event types with valid overrides are kept
      expect(events.error).toBeDefined();
      expect(events.error?.message).toBe("CRITICAL: {sessionTitle}");
      expect(events.error?.priority).toBe(5);
      expect(events.error?.tags).toEqual(["urgent"]);
      expect(events.error?.color).toBe(15548997);
      expect(events.error?.gotifyPriority).toBe(8);

      expect(events.permission).toBeDefined();
      expect(events.permission?.message).toBe("Permission needed: {sessionTitle}");

      // Unknown event type "invalid_event_type" is filtered out
      expect((events as Record<string, unknown>).invalid_event_type).toBeUndefined();

      // "complete" had an invalid override (priority as string, not number)
      // Zod validation rejects it, so the whole entry is dropped
      expect(events.complete).toBeUndefined();
    });

    it("returns undefined when no webhook events are configured", () => {
      pointConfigAt(join(FIXTURES, "valid.json"));
      const config = loadConfig();

      // valid.json has no webhook.events key
      expect(config.webhook.events).toBeUndefined();
    });
  });
});
