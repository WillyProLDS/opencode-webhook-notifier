import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../src/log/logger.js";

const ENV_VAR = "OPENCODE_WEBHOOK_NOTIFIER_LOG";

describe("createLogger", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV_VAR];
    delete process.env[ENV_VAR];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = original;
  });

  it("defaults to warn level: suppresses debug + info", () => {
    const lines: string[] = [];
    const logger = createLogger({ sink: (l) => lines.push(l) });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).level).toBe("warn");
    expect(JSON.parse(lines[1]).level).toBe("error");
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

    const parsed = JSON.parse(lines[0]);
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
});
