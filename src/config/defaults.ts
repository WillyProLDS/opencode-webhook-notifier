import type { EventConfig, NotifierConfig } from "./schema.js";

export const DEFAULT_EVENT_CONFIG: EventConfig = {
  webhook: true,
  command: true,
};

export const DEFAULT_CONFIG: NotifierConfig = {
  timeout: 5,
  showProjectName: true,
  showSessionTitle: false,
  suppressWhenFocused: true,
  enableOnDesktop: false,
  focusCacheMs: 250,
  command: {
    enabled: false,
    path: "",
    minDuration: 0,
  },
  events: {
    permission: { ...DEFAULT_EVENT_CONFIG },
    complete: { ...DEFAULT_EVENT_CONFIG },
    subagent_complete: { webhook: false, command: true },
    error: { ...DEFAULT_EVENT_CONFIG },
    question: { ...DEFAULT_EVENT_CONFIG },
    user_cancelled: { webhook: false, command: true },
    plan_exit: { ...DEFAULT_EVENT_CONFIG },
  },
  messages: {
    permission: "Session needs permission: {sessionTitle}",
    complete: "Session has finished: {sessionTitle}",
    subagent_complete: "Subagent task completed: {sessionTitle}",
    error: "Session encountered an error: {sessionTitle}",
    question: "Session has a question: {sessionTitle}",
    user_cancelled: "Session was cancelled by user: {sessionTitle}",
    plan_exit: "Plan ready for review: {sessionTitle}",
  },
  webhook: {
    enabled: true,
    targets: [],
  },
};
