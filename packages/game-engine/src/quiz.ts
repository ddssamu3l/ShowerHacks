import { QUIZ_QUESTIONS, type QuizQuestion, type DefinitionResult, type TypingResult } from "@vibecodemaxxing/contracts";

export function quizForTurn(turnIndex: number, offset = 0): QuizQuestion | undefined {
  if (turnIndex % 2 !== 0) return undefined;
  const index = ((Math.floor(turnIndex / 2) + Math.trunc(offset)) % QUIZ_QUESTIONS.length + QUIZ_QUESTIONS.length) % QUIZ_QUESTIONS.length;
  return QUIZ_QUESTIONS[index];
}

/** Semantic accuracy gates the speed bonus: irrelevant answers never earn speed-only points. */
export function scoreDefinition(answer: string, elapsedMs: number, result: DefinitionResult): TypingResult {
  const durationMs = Number.isFinite(elapsedMs) ? Math.max(0, Math.min(elapsedMs, result.question.timeLimitMs)) : result.question.timeLimitMs;
  const accuracy = Number.isFinite(result.accuracy) && answer.trim() && result.outcome === "graded"
    ? Math.max(0, Math.min(100, result.accuracy)) / 100 : 0;
  const speed = Math.max(0, 1 - durationMs / result.question.timeLimitMs);
  const accuracyPoints = accuracy * 70;
  const speedPoints = accuracy * 30 * speed;
  return {
    submittedText: answer, durationMs, timeLimitMs: result.question.timeLimitMs,
    accuracy, speed, errors: 0, longPauses: 0, corrections: 0,
    accuracyPoints, speedPoints, penaltyPoints: 0, score: accuracyPoints + speedPoints,
    notes: [`${Math.round(accuracy * 100)}% meaning match`, `${Math.round(speed * 100)}% time remaining`],
    definitionQuiz: { ...result, accuracy: accuracy * 100 },
  };
}
