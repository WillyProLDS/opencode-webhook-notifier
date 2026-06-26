import { describe, expect, it, vi } from "vitest";
import type { NotifierConfig } from "../src/config/schema.js";
import type { FocusDetector } from "../src/focus/index.js";
import type { Logger } from "../src/log/logger.js";
import { createNotifier } from "../src/plugin/notifier.js";
import type { TurnCounter } from "../src/plugin/turn-counter.js";
import type { WebhookSender } from "../src/transport/send.js";

const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const unfocusedFocus: FocusDetector = {
  isTerminalFocused: () => false,
  invalidate: () => undefined,
};

function makeTurnCounter(): TurnCounter {
  let n = 0;
  return { next: () => (n += 1) };
}

function makeConfig(commandOver: Partial<NotifierConfig["command"]> = {}): NotifierConfig {
  return {
    timeout: 5,
    showProjectName: true,
    showSessionTitle: false,
    suppressWhenFocused: false,
    enableOnDesktop: false,
    focusCacheMs: 250,
    command: {
      enabled: true,
      path: "/bin/true",
      minDuration: 0,
      ...commandOver,
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
      permission: "Permission: {sessionTitle}",
      complete: "Finished: {sessionTitle}",
      subagent_complete: "Subagent done: {sessionTitle}",
      error: "Error: {sessionTitle}",
      question: "Question: {sessionTitle}",
      user_cancelled: "Cancelled: {sessionTitle}",
      plan_exit: "Plan: {sessionTitle}",
    },
    webhook: { enabled: true, targets: [{ type: "discord", url: "https://x.example/hook" }] },
  };
}

function makeDeps(commandOver: Partial<NotifierConfig["command"]> = {}) {
  const config = makeConfig(commandOver);
  const sender: WebhookSender = {
    send: vi.fn(),
    dispose: vi.fn(),
  };
  const notifier = createNotifier({
    config: () => config,
    focus: unfocusedFocus,
    turnCounter: makeTurnCounter(),
    webhookSender: sender,
    logger: noopLogger,
  });
  return { config, sender, notifier };
}

describe("notifier command minDuration", () => {
  it("does not throw when elapsedSeconds is below minDuration (command skipped)", async () => {
    const { notifier } = makeDeps({ minDuration: 10 });
    await notifier.notify({
      eventType: "complete",
      projectName: "demo",
      sessionID: "s1",
      elapsedSeconds: 3,
    });
  });

  it("does not throw when elapsedSeconds meets minDuration", async () => {
    const { notifier } = makeDeps({ minDuration: 10 });
    await notifier.notify({
      eventType: "complete",
      projectName: "demo",
      sessionID: "s1",
      elapsedSeconds: 15,
    });
  });

  it("does not throw when minDuration is 0 regardless of elapsedSeconds", async () => {
    const { notifier } = makeDeps({ minDuration: 0 });
    await notifier.notify({
      eventType: "complete",
      projectName: "demo",
      sessionID: "s1",
      elapsedSeconds: 0,
    });
  });

  it("does not throw when elapsedSeconds is null (unknown elapsed)", async () => {
    const { notifier } = makeDeps({ minDuration: 10 });
    await notifier.notify({
      eventType: "complete",
      projectName: "demo",
      sessionID: "s1",
      elapsedSeconds: null,
    });
  });
});

describe("notifier webhook send passes sessionID", () => {
  it("forwards sessionID to webhookSender.send", async () => {
    const { sender, notifier } = makeDeps();
    await notifier.notify({
      eventType: "complete",
      projectName: "demo",
      sessionID: "session-42",
    });
    const call = (sender.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call).toBeDefined();
    const options = call?.[4];
    expect(options?.sessionID).toBe("session-42");
  });
});
