import type { QuestionDetails, QuestionInfo, QuestionOption } from "../config/schema.js";

function isQuestionOption(value: unknown): value is QuestionOption {
  if (!value || typeof value !== "object") return false;
  const option = value as Record<string, unknown>;
  return typeof option.label === "string" && typeof option.description === "string";
}

function isQuestionInfo(value: unknown): value is QuestionInfo {
  if (!value || typeof value !== "object") return false;
  const question = value as Record<string, unknown>;
  return (
    typeof question.question === "string" &&
    typeof question.header === "string" &&
    Array.isArray(question.options) &&
    question.options.every(isQuestionOption) &&
    (question.multiple === undefined || typeof question.multiple === "boolean") &&
    (question.custom === undefined || typeof question.custom === "boolean")
  );
}

export function extractQuestionDetails(value: unknown): QuestionDetails | null {
  if (!value || typeof value !== "object") return null;
  const request = value as Record<string, unknown>;
  if (
    typeof request.id !== "string" ||
    typeof request.sessionID !== "string" ||
    !Array.isArray(request.questions) ||
    request.questions.length === 0 ||
    !request.questions.every(isQuestionInfo)
  ) {
    return null;
  }

  return {
    id: request.id,
    sessionID: request.sessionID,
    questions: request.questions,
  };
}

export function formatQuestionDetails(details: QuestionDetails): string {
  const lines = ["Questions:"];
  for (const [index, question] of details.questions.entries()) {
    lines.push(`${index + 1}. ${question.header}: ${question.question}`);
    for (const option of question.options) {
      lines.push(`   - ${option.label}: ${option.description}`);
    }
    lines.push(`   Multiple selections: ${question.multiple ? "allowed" : "not allowed"}`);
    lines.push(`   Custom answer: ${question.custom !== false ? "allowed" : "not allowed"}`);
  }
  return lines.join("\n");
}

export function appendQuestionDetails(message: string, details?: QuestionDetails | null): string {
  if (!details) return message;
  return `${message}\n\n${formatQuestionDetails(details)}`;
}
