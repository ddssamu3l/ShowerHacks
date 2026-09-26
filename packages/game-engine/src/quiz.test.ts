import { describe, it, expect } from "vitest";
import { QUIZ_QUESTIONS, type DefinitionResult } from "@vibecodemaxxing/contracts";
import { quizForTurn, scoreDefinition } from "./quiz";
const result: DefinitionResult = { question: QUIZ_QUESTIONS[0], accuracy: 80, definition: "Pretending.", feedback: "Mostly right.", outcome: "graded" };

describe("definition scoring", () => {
  it("combines semantic accuracy with normalized remaining time", () => {
    expect(scoreDefinition("pretending", 15_000, result).score).toBe(68);
    expect(scoreDefinition("pretending", 0, result).score).toBe(80);
    expect(scoreDefinition("pretending", 30_000, result).score).toBe(56);
    expect(scoreDefinition("pretending", 15_000, { ...result, question: QUIZ_QUESTIONS[4] }).score).toBe(56);
  });
  it("never gives speed-only points for empty, skipped, or unrelated answers", () => {
    expect(scoreDefinition(" ", 0, result).score).toBe(0);
    expect(scoreDefinition("anything", 0, { ...result, accuracy: 0 }).score).toBe(0);
    expect(scoreDefinition("anything", 0, { ...result, outcome: "skipped" }).score).toBe(0);
  });
  it("clamps bad values without awarding extra time", () => {
    expect(scoreDefinition("answer", Infinity, result).speed).toBe(0);
    expect(scoreDefinition("answer", 100_000, result).durationMs).toBe(30_000);
    expect(scoreDefinition("answer", 0, { ...result, accuracy: NaN }).score).toBe(0);
  });
  it("alternates tasks and cycles through all six words", () => {
    expect(Array.from({ length: 6 }, (_, i) => quizForTurn(i * 2)?.id)).toEqual(QUIZ_QUESTIONS.map((q) => q.id));
    expect(quizForTurn(1)).toBeUndefined();
    expect(quizForTurn(12)?.id).toBe("larp");
    expect(quizForTurn(0, 5)?.id).toBe("cracked");
  });
});
