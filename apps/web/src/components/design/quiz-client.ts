import { quizJudgmentSchema, type QuizJudge } from "@vibecodemaxxing/contracts";

export const judgeQuiz: QuizJudge = async (question, answer, signal) => {
  const response = await fetch("/api/quiz/judge", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wordId: question.id, answer }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "The judge is unavailable. Please retry.");
  return quizJudgmentSchema.parse(body);
};
