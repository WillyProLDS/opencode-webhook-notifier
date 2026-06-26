import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotifierConfig } from "../src/config/schema.js";
import type { Logger } from "../src/log/logger.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { runCommand } from "../src/command/runner.js";

type SpawnArgs = Parameters<typeof spawn>;

function makeSpawned(): ChildProcess {
  const ee = new EventEmitter() as unknown as ChildProcess;
  (ee as unknown as { unref: () => void }).unref = vi.fn();
  return ee;
}

function makeConfig(overrides: Partial<NotifierConfig["command"]> = {}): NotifierConfig {
  return {
    timeout: 5,
    showProjectName: true,
    showSessionTitle: false,
    suppressWhenFocused: false,
    enableOnDesktop: false,
    focusCacheMs: 250,
    command: {
      enabled: true,
      path: "notify-send",
      ...overrides,
    },
    events: {
      permission: { webhook: true, command: true },
      complete: { webhook: true, command: true },
      subagent_complete: { webhook: false, command: true },
      error: { webhook: true, command: true },
      question: { webhook: true, command: true },
      user_cancelled: { webhook: false, command: true },
      plan_exit: { webhook: true, command: true },
    },
    messages: {
      permission: "Session needs permission",
      complete: "Session has finished",
      subagent_complete: "Subagent task completed",
      error: "Session encountered an error",
      question: "Session has a question",
      user_cancelled: "Session was cancelled",
      plan_exit: "Plan ready for review",
    },
    webhook: { enabled: true, targets: [] },
  };
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    event: "complete" as const,
    message: "Session has finished",
    sessionTitle: "My Session",
    agentName: "claude",
    projectName: "my-project",
    timestamp: "2025-06-27T10:00:00Z",
    turn: 3,
    ...overrides,
  };
}

function makeLogger(): Logger & { calls: Array<{ msg: string; ctx?: Record<string, unknown> }> } {
  const calls: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];
  const logger: Logger = {
    debug: (msg, ctx) => calls.push({ msg, ctx }),
    info: (msg, ctx) => calls.push({ msg, ctx }),
    warn: (msg, ctx) => calls.push({ msg, ctx }),
    error: (msg, ctx) => calls.push({ msg, ctx }),
  };
  return Object.assign(logger, { calls });
}

describe("runCommand", () => {
  const mockedSpawn = vi.mocked(spawn);

  beforeEach(() => {
    mockedSpawn.mockReset();
    mockedSpawn.mockReturnValue(makeSpawned());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when command is disabled", () => {
    const config = makeConfig({ enabled: false });
    runCommand(config, makeCtx());
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it("does nothing when command.path is missing", () => {
    const config = makeConfig({ path: "" });
    runCommand(config, makeCtx());
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it("spawns the command with substituted path when enabled", () => {
    const config = makeConfig({ path: "/usr/bin/notify-send" });
    runCommand(config, makeCtx());
    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    const [cmd, , opts] = mockedSpawn.mock.calls[0] as SpawnArgs;
    expect(cmd).toBe("/usr/bin/notify-send");
    expect(opts).toMatchObject({ stdio: "ignore", detached: true });
  });

  it("substitutes all 7 tokens in the command path", () => {
    const config = makeConfig({
      path: "{event}/{message}/{sessionTitle}/{agentName}/{projectName}/{timestamp}/{turn}",
    });
    runCommand(config, makeCtx());
    const [cmd] = mockedSpawn.mock.calls[0] as SpawnArgs;
    expect(cmd).toBe("complete/Session has finished/My Session/claude/my-project/2025-06-27T10:00:00Z/3");
  });

  it("substitutes tokens in args", () => {
    const config = makeConfig({
      path: "script.sh",
      args: ["--event", "{event}", "--msg", "{message}", "--turn", "{turn}"],
    });
    runCommand(config, makeCtx());
    const [, args] = mockedSpawn.mock.calls[0] as SpawnArgs;
    expect(args).toEqual(["--event", "complete", "--msg", "Session has finished", "--turn", "3"]);
  });

  it("handles null/undefined optional context fields as empty strings", () => {
    const config = makeConfig({
      path: "{sessionTitle}|{agentName}|{projectName}|{timestamp}|{turn}",
    });
    runCommand(config, {
      event: "error",
      message: "boom",
      sessionTitle: null,
      agentName: null,
      projectName: null,
      timestamp: null,
      turn: null,
    });
    const [cmd] = mockedSpawn.mock.calls[0] as SpawnArgs;
    expect(cmd).toBe("||||");
  });

  it("sets OC_* environment variables for all tokens", () => {
    const config = makeConfig({ path: "notify-send" });
    runCommand(config, makeCtx());
    const [, , opts] = mockedSpawn.mock.calls[0] as SpawnArgs;
    const env = opts?.env as Record<string, string>;
    expect(env.OC_EVENT).toBe("complete");
    expect(env.OC_MESSAGE).toBe("Session has finished");
    expect(env.OC_SESSION_TITLE).toBe("My Session");
    expect(env.OC_AGENT_NAME).toBe("claude");
    expect(env.OC_PROJECT_NAME).toBe("my-project");
    expect(env.OC_TIMESTAMP).toBe("2025-06-27T10:00:00Z");
    expect(env.OC_TURN).toBe("3");
  });

  it("sets OC_* env vars to empty strings for null context fields", () => {
    const config = makeConfig({ path: "notify-send" });
    runCommand(config, {
      event: "error",
      message: "boom",
      sessionTitle: null,
      agentName: null,
      projectName: null,
      timestamp: null,
      turn: null,
    });
    const [, , opts] = mockedSpawn.mock.calls[0] as SpawnArgs;
    const env = opts?.env as Record<string, string>;
    expect(env.OC_SESSION_TITLE).toBe("");
    expect(env.OC_AGENT_NAME).toBe("");
    expect(env.OC_PROJECT_NAME).toBe("");
    expect(env.OC_TIMESTAMP).toBe("");
    expect(env.OC_TURN).toBe("");
  });

  it("merges OC_* vars onto process.env without removing existing vars", () => {
    const config = makeConfig({ path: "notify-send" });
    const existingKey = "PRE_EXISTING_VAR";
    process.env[existingKey] = "keep-me";

    runCommand(config, makeCtx());

    const [, , opts] = mockedSpawn.mock.calls[0] as SpawnArgs;
    const env = opts?.env as Record<string, string>;
    expect(env[existingKey]).toBe("keep-me");

    delete process.env[existingKey];
  });

  it("skips spawn and warns when path is empty after substitution", () => {
    const config = makeConfig({ path: "{sessionTitle}" });
    const logger = makeLogger();
    runCommand(config, makeCtx({ sessionTitle: "" }), logger);
    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]?.msg).toContain("empty");
  });

  it("skips spawn when path is only whitespace after substitution", () => {
    const config = makeConfig({ path: "{sessionTitle}" });
    const logger = makeLogger();
    runCommand(config, makeCtx({ sessionTitle: "   " }), logger);
    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(logger.calls).toHaveLength(1);
  });

  it("attaches an error handler on the spawned process", () => {
    const proc = makeSpawned();
    mockedSpawn.mockReturnValue(proc);
    const spy = vi.spyOn(proc, "on");

    const config = makeConfig({ path: "notify-send" });
    runCommand(config, makeCtx());

    const calls = spy.mock.calls as unknown as [string, ...unknown[]][];
    const errorCalls = calls.filter((c) => c[0] === "error");
    expect(errorCalls).toHaveLength(1);
  });

  it("calls unref on the spawned process", () => {
    const proc = makeSpawned();
    const unrefSpy = vi.fn();
    (proc as unknown as { unref: () => void }).unref = unrefSpy;
    mockedSpawn.mockReturnValue(proc);

    const config = makeConfig({ path: "notify-send" });
    runCommand(config, makeCtx());

    expect(unrefSpy).toHaveBeenCalledTimes(1);
  });

  it("logs a warning when spawn emits an error", () => {
    const proc = makeSpawned();
    mockedSpawn.mockReturnValue(proc);
    const onSpy = vi.spyOn(proc, "on");

    const config = makeConfig({ path: "notify-send" });
    const logger = makeLogger();
    runCommand(config, makeCtx(), logger);

    const calls = onSpy.mock.calls as unknown as [string, ...unknown[]][];
    const errorHandler = calls.find((c) => c[0] === "error")?.[1] as ((err: Error) => void) | undefined;
    expect(errorHandler).toBeTypeOf("function");

    errorHandler?.(new Error("ENOENT"));
    expect(logger.calls.some((c) => c.msg === "command spawn failed")).toBe(true);
  });

  it("does not throw when no logger is passed and spawn errors", () => {
    const proc = makeSpawned();
    mockedSpawn.mockReturnValue(proc);
    const onSpy = vi.spyOn(proc, "on");

    const config = makeConfig({ path: "notify-send" });
    expect(() => runCommand(config, makeCtx())).not.toThrow();

    const calls = onSpy.mock.calls as unknown as [string, ...unknown[]][];
    const errorHandler = calls.find((c) => c[0] === "error")?.[1] as ((err: Error) => void) | undefined;
    expect(() => errorHandler?.(new Error("ENOENT"))).not.toThrow();
  });

  it("does not use shell: true in spawn options", () => {
    const config = makeConfig({ path: "notify-send" });
    runCommand(config, makeCtx());
    const [, , opts] = mockedSpawn.mock.calls[0] as SpawnArgs;
    expect(opts?.shell).toBeUndefined();
  });
});
