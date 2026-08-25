import type { QuestionDetails } from "../config/schema.js";

const PENDING_TTL_MS = 3600_000;

export interface PendingQuestion {
  key: string;
  request: QuestionDetails;
  botToken: string;
  chatID: string | number;
  answers: Array<string[] | undefined>;
  selected: string[];
  notificationMessageID?: number;
  promptMessageID?: number;
  createdAt: number;
}

const pendingMap = new Map<string, PendingQuestion>();
let keyCounter = 1;

export function prunePendingQuestions(cutoff = Date.now() - PENDING_TTL_MS): void {
  for (const [key, pending] of pendingMap.entries()) {
    if (pending.createdAt < cutoff) pendingMap.delete(key);
  }
}

export function registerPendingQuestion(
  request: QuestionDetails,
  botToken: string,
  chatID: string | number,
): PendingQuestion {
  const now = Date.now();
  prunePendingQuestions(now - PENDING_TTL_MS);
  const key = `q_${(keyCounter++).toString(36)}_${(now % 10000).toString(36)}`;
  const pending: PendingQuestion = {
    key,
    request,
    botToken,
    chatID,
    answers: request.questions.map(() => undefined),
    selected: [],
    createdAt: now,
  };
  pendingMap.set(key, pending);
  return pending;
}

export function getPendingQuestion(key: string): PendingQuestion | undefined {
  const pending = pendingMap.get(key);
  if (pending && Date.now() - pending.createdAt > PENDING_TTL_MS) {
    pendingMap.delete(key);
    return undefined;
  }
  return pending;
}

export function getCurrentQuestionIndex(pending: PendingQuestion): number {
  return pending.answers.indexOf(undefined);
}

export function answerCurrentQuestion(pending: PendingQuestion, answers: string[]): boolean {
  const index = getCurrentQuestionIndex(pending);
  if (index < 0) return true;
  pending.answers[index] = answers;
  pending.selected = [];
  pending.promptMessageID = undefined;
  return getCurrentQuestionIndex(pending) < 0;
}

export function togglePendingSelection(pending: PendingQuestion, label: string): void {
  const index = pending.selected.indexOf(label);
  if (index >= 0) pending.selected.splice(index, 1);
  else pending.selected.push(label);
}

export function findPendingQuestionByPrompt(
  botToken: string,
  chatID: string | number,
  promptMessageID: number,
): PendingQuestion | undefined {
  for (const pending of pendingMap.values()) {
    if (
      pending.botToken === botToken &&
      String(pending.chatID) === String(chatID) &&
      pending.promptMessageID === promptMessageID
    ) {
      return pending;
    }
  }
  return undefined;
}

export function removePendingQuestion(key: string): void {
  pendingMap.delete(key);
}

export function removePendingQuestionsByRequest(requestID: string): void {
  for (const [key, pending] of pendingMap.entries()) {
    if (pending.request.id === requestID) pendingMap.delete(key);
  }
}

export function clearPendingQuestions(): void {
  pendingMap.clear();
  keyCounter = 1;
}
