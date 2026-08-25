import type { PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { NotifierConfig } from "../src/config/schema.js";
import type { Logger } from "../src/log/logger.js";
import { createEventRouter } from "../src/plugin/event-router.js";
import type { Notifier } from "../src/plugin/notifier.js";

const config = {
  showSessionTitle: false,
  command: { enabled: false, path: "" },
  messages: { question: "Question" },
} as unknown as NotifierConfig;

function makeRouter() {
  const notify = vi.fn();
  const warn = vi.fn();
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn,
    error: vi.fn(),
  } satisfies Logger;
  const router = createEventRouter({
    client: {} as PluginInput["client"],
    config: () => config,
    notifier: { notify } satisfies Notifier,
    sessionState: {} as never,
    permissionDedupe: {} as never,
    logger,
    projectName: "demo",
  });
  return { router, notify, warn };
}

describe("question event routing", () => {
  it("routes question.asked with complete details", async () => {
    const { router, notify } = makeRouter();
    const properties = {
      id: "req_1",
      sessionID: "ses_1",
      questions: [
        {
          header: "Deploy",
          question: "Where should this deploy?",
          options: [{ label: "Staging", description: "Use staging" }],
        },
      ],
    };

    await router.handle({ type: "question.asked", properties } as unknown as Event);

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "question",
        projectName: "demo",
        sessionID: "ses_1",
        question: properties,
      }),
      config,
    );
  });

  it("ignores malformed question events", async () => {
    const { router, notify, warn } = makeRouter();

    await router.handle({
      type: "question.asked",
      properties: { id: "req_1", sessionID: "ses_1", questions: "invalid" },
    } as unknown as Event);

    expect(notify).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("invalid question event ignored");
  });
});
