export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function parseLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (normalized in LEVEL_RANK) return normalized as LogLevel;
  return fallback;
}

export interface LoggerOptions {
  level?: LogLevel;
  envVar?: string;
  prefix?: string;
  sink?: (line: string) => void;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const envName = options.envVar ?? "OPENCODE_WEBHOOK_NOTIFIER_LOG";
  const level = parseLevel(process.env[envName], options.level ?? "warn");
  const minRank = LEVEL_RANK[level];
  const prefix = options.prefix ?? "webhook-notifier";
  const sink = options.sink ?? ((line: string) => process.stderr.write(`${line}\n`));

  function emit(target: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
    if (LEVEL_RANK[target] < minRank) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level: target,
      prefix,
      msg,
      ...(ctx ?? {}),
    });
    sink(line);
  }

  return {
    debug: (msg, ctx) => emit("debug", msg, ctx),
    info: (msg, ctx) => emit("info", msg, ctx),
    warn: (msg, ctx) => emit("warn", msg, ctx),
    error: (msg, ctx) => emit("error", msg, ctx),
  };
}

export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
