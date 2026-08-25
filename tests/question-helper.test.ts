import { describe, expect, it } from "vitest";
import { extractQuestionDetails, formatQuestionDetails } from "../src/plugin/question-helper.js";

describe("question helper", () => {
  it("extracts a valid question request", () => {
    const details = extractQuestionDetails({
      id: "req_1",
      sessionID: "ses_1",
      questions: [
        {
          header: "Deploy",
          question: "Which environment should receive this release?",
          options: [{ label: "Staging", description: "Deploy to the staging environment" }],
          multiple: false,
          custom: true,
        },
      ],
    });

    expect(details).toEqual({
      id: "req_1",
      sessionID: "ses_1",
      questions: [
        {
          header: "Deploy",
          question: "Which environment should receive this release?",
          options: [{ label: "Staging", description: "Deploy to the staging environment" }],
          multiple: false,
          custom: true,
        },
      ],
    });
  });

  it("rejects malformed question requests", () => {
    expect(extractQuestionDetails({ id: "req_1", sessionID: "ses_1", questions: "invalid" })).toBeNull();
    expect(
      extractQuestionDetails({
        id: "req_1",
        sessionID: "ses_1",
        questions: [{ header: "H", question: "Q", options: [{ label: 1, description: "D" }] }],
      }),
    ).toBeNull();
  });

  it("formats every question, option, and input mode", () => {
    const details = extractQuestionDetails({
      id: "req_1",
      sessionID: "ses_1",
      questions: [
        {
          header: "Target",
          question: "Choose deployment targets",
          options: [
            { label: "Web", description: "Deploy the web service" },
            { label: "Worker", description: "Deploy the worker service" },
          ],
          multiple: true,
        },
      ],
    });

    expect(details).not.toBeNull();
    const text = formatQuestionDetails(details!);
    expect(text).toContain("1. Target: Choose deployment targets");
    expect(text).toContain("- Web: Deploy the web service");
    expect(text).toContain("- Worker: Deploy the worker service");
    expect(text).toContain("Multiple selections: allowed");
    expect(text).toContain("Custom answer: allowed");
  });
});
