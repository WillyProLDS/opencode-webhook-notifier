import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../src/log/logger.js";

const ENV_VAR = "OPENCODE_WEBHOOK_NOTIFIER_LOG";
const LOG_FILE_ENV = "OPENCODE_WEBHOOK_NOTIFIER_LOG_FILE";

describe("createLogger", () => {
  let original: string | undefined;
  let originalLogFile: string | undefined;
  let tempDir: string | null = null;

  beforeEach(() => {
    original = process.env[ENV_VAR];
    originalLogFile = process.env[LOG_FILE_ENV];
    delete process.env[ENV_VAR];
    delete process.env[LOG_FILE_ENV];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = original;

    if (originalLogFile === undefined) delete process.env[LOG_FILE_ENV];
    else process.env[LOG_FILE_ENV] = originalLogFile;

    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("defaults to warn level: suppresses debug + info", () => {
    const lines: string[] = [];
    const logger = createLogger({ sink: (l) => lines.push(l) });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "").level).toBe("warn");
    expect(JSON.parse(lines[1] ?? "").level).toBe("error");
  });

  it("respects env var override (debug)", () => {
    process.env[ENV_VAR] = "debug";
    const lines: string[] = [];
    const logger = createLogger({ sink: (l) => lines.push(l) });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(lines).toHaveLength(4);
  });

  it("respects env var override (silent)", () => {
    process.env[ENV_VAR] = "silent";
    const lines: string[] = [];
    const logger = createLogger({ sink: (l) => lines.push(l) });

    logger.error("e");
    expect(lines).toEqual([]);
  });

  it("emits JSON with ts, level, prefix, msg, ctx", () => {
    process.env[ENV_VAR] = "info";
    const lines: string[] = [];
    const logger = createLogger({ sink: (l) => lines.push(l), prefix: "test" });

    logger.info("hello", { foo: "bar" });

    const parsed = JSON.parse(lines[0] ?? "");
    expect(parsed.level).toBe("info");
    expect(parsed.prefix).toBe("test");
    expect(parsed.msg).toBe("hello");
    expect(parsed.foo).toBe("bar");
    expect(typeof parsed.ts).toBe("string");
  });

  it("falls back to default when env var has invalid value", () => {
    process.env[ENV_VAR] = "garbage";
    const lines: string[] = [];
    const logger = createLogger({ level: "info", sink: (l) => lines.push(l) });

    logger.info("i");
    expect(lines).toHaveLength(1);
  });

  it("writes logs to file specified via OPENCODE_WEBHOOK_NOTIFIER_LOG_FILE", () => {
    tempDir = mkdtempSync(join(tmpdir(), "webhook-logger-test-"));
    const logFilePath = join(tempDir, "nested", "sub", "app.log");
    process.env[LOG_FILE_ENV] = logFilePath;
    process.env[ENV_VAR] = "info";

    const logger = createLogger();
    logger.info("file test message", { extra: 123 });

    expect(existsSync(logFilePath)).toBe(true);
    const content = readFileSync(logFilePath, "utf-8").trim();
    const parsed = JSON.parse(content);
    expect(parsed.msg).toBe("file test message");
    expect(parsed.extra).toBe(123);
  });

  it("writes logs to file specified via options.logFile", () => {
    tempDir = mkdtempSync(join(tmpdir(), "webhook-logger-test-"));
    const logFilePath = join(tempDir, "options.log");

    const logger = createLogger({ level: "error", logFile: logFilePath });
    logger.info("suppressed");
    logger.error("error logged");

    expect(existsSync(logFilePath)).toBe(true);
    const content = readFileSync(logFilePath, "utf-8").trim();
    const parsed = JSON.parse(content);
    expect(parsed.msg).toBe("error logged");
    expect(parsed.level).toBe("error");
  });

  it("does not crash when writing to invalid file path", () => {
    const logger = createLogger({ level: "error", logFile: "\0invalid-path" });
    expect(() => {
      logger.error("should not throw");
    }).not.toThrow();
  });
});
