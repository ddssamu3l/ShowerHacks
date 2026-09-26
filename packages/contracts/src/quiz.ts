import { z } from "zod";

export const QUIZ_SCORING_VERSION = "v3-definition" as const;
export const QUIZ_MAX_ANSWER_LENGTH = 600;
export const QUIZ_QUESTIONS = [
  { id: "larp", word: "Larp", timeLimitMs: 30_000 },
  { id: "yap", word: "Yap", timeLimitMs: 25_000 },
  { id: "hypergamy", word: "Hypergamy", timeLimitMs: 35_000 },
  { id: "tokenmaxxing", word: "Tokenmaxxing", timeLimitMs: 40_000 },
  { id: "clanker", word: "Clanker", timeLimitMs: 15_000 },
  { id: "cracked", word: "Cracked", timeLimitMs: 15_000 },
] as const;
export type QuizQuestion = typeof QUIZ_QUESTIONS[number];
export const quizRequestSchema = z.strictObject({
  wordId: z.enum(["larp", "yap", "hypergamy", "tokenmaxxing", "clanker", "cracked"]),
  answer: z.string().trim().min(1).max(QUIZ_MAX_ANSWER_LENGTH),
});
export const quizJudgmentSchema = z.strictObject({
  accuracy: z.number().int().min(0).max(100),
  feedback: z.string().min(1).max(300),
  definition: z.string().min(1).max(600),
});
export type QuizJudgment = z.infer<typeof quizJudgmentSchema>;
export type QuizJudge = (question: QuizQuestion, answer: string, signal: AbortSignal) => Promise<QuizJudgment>;
export interface DefinitionResult {
  question: QuizQuestion;
  accuracy: number; // LLM semantic match, 0..100.
  feedback: string;
  definition: string;
  outcome: "graded" | "empty" | "skipped";
}
