import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerCurrentQuestion,
  clearPendingQuestions,
  findPendingQuestionByPrompt,
  getCurrentQuestionIndex,
  getPendingQuestion,
  prunePendingQuestions,
  registerPendingQuestion,
  togglePendingSelection,
} from "../src/transport/pending-questions.js";

describe("pending questions", () => {
  beforeEach(() => clearPendingQuestions());
  afterEach(() => vi.useRealTimers());

  it("tracks answers and selections in question order", () => {
    const pending = registerPendingQuestion(
      {
        id: "req_1",
        sessionID: "ses_1",
        questions: [
          { header: "One", question: "First?", options: [] },
          { header: "Two", question: "Second?", options: [], multiple: true },
        ],
      },
      "token",
      123,
    );

    expect(getCurrentQuestionIndex(pending)).toBe(0);
    expect(answerCurrentQuestion(pending, ["first"])).toBe(false);
    togglePendingSelection(pending, "A");
    togglePendingSelection(pending, "B");
    togglePendingSelection(pending, "A");
    expect(pending.selected).toEqual(["B"]);
    expect(answerCurrentQuestion(pending, [...pending.selected])).toBe(true);
    expect(pending.answers).toEqual([["first"], ["B"]]);
  });

  it("finds custom input only by bot, chat, and prompt message", () => {
    const pending = registerPendingQuestion(
      { id: "req_1", sessionID: "ses_1", questions: [{ header: "One", question: "First?", options: [] }] },
      "token",
      123,
    );
    pending.promptMessageID = 99;

    expect(findPendingQuestionByPrompt("token", 123, 99)).toBe(pending);
    expect(findPendingQuestionByPrompt("other", 123, 99)).toBeUndefined();
    expect(findPendingQuestionByPrompt("token", 456, 99)).toBeUndefined();
    expect(findPendingQuestionByPrompt("token", 123, 100)).toBeUndefined();
  });

  it("keeps requests for one hour before pruning them", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const pending = registerPendingQuestion(
      { id: "req_1", sessionID: "ses_1", questions: [{ header: "One", question: "First?", options: [] }] },
      "token",
      123,
    );

    vi.setSystemTime(new Date("2026-01-01T00:06:00Z"));
    prunePendingQuestions();
    expect(getPendingQuestion(pending.key)).toBe(pending);

    vi.setSystemTime(new Date("2026-01-01T01:01:00Z"));
    prunePendingQuestions();
    expect(getPendingQuestion(pending.key)).toBeUndefined();
  });
});
