import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionSchema, type QuizJudge, type QuizJudgment } from "@vibecodemaxxing/contracts";
import source from "../../../../../content/sessions/ship-it.json";
import { createDesignGame } from "./design-game";
const judgment: QuizJudgment = { accuracy: 80, feedback: "Mostly right.", definition: "Pretending to be someone you are not." };
const session = sessionSchema.parse(source);
const games: ReturnType<typeof createDesignGame>[] = [];
function setup(judge: QuizJudge = vi.fn().mockResolvedValue(judgment)) {
  vi.useFakeTimers();
  let time = 0;
  const game = createDesignGame({ session, nickname: "Test", inputMode: "mock", now: () => time, definitionQuiz: { judge, wordOffset: 0 } });
  games.push(game);
  return { game, setTime: (value: number) => { time = value; }, judge };
}
afterEach(() => { games.forEach((game) => game.dispose()); games.length = 0; vi.useRealTimers(); });

describe("definition round lifecycle", () => {
  it("freezes elapsed time before judging and starts the full shower afterward", async () => {
    let resolve!: (value: QuizJudgment) => void;
    const { game, setTime } = setup(() => new Promise((done) => { resolve = done; }));
    game.start();
    expect(game.getState()).toMatchObject({ phase: "typing", quiz: { word: "Larp" } });
    setTime(15_000);
    expect(game.submitPrompt("pretending")).toBe(true);
    expect(game.getState()).toMatchObject({ phase: "judging", durationMs: 15_000 });
    expect(game.submitPrompt("different answer")).toBe(false);
    setTime(20_000);
    resolve(judgment);
    await vi.advanceTimersByTimeAsync(0);
    expect(game.getState()).toMatchObject({ phase: "agent", agentStartedAtMs: 20_000, agentEndsAtMs: 32_000, typingResult: { score: 68, durationMs: 15_000 } });
    setTime(32_000);
    await vi.advanceTimersByTimeAsync(100);
    expect(game.getState()).toMatchObject({ phase: "typing", turnIndex: 1, quiz: undefined });
  });
  it("auto-submits the last on-time draft and rejects late edits", async () => {
    const { game, setTime, judge } = setup();
    game.start();
    setTime(29_999);
    game.updateQuizDraft("pretending");
    setTime(40_000);
    game.updateQuizDraft("a late correction");
    await vi.advanceTimersByTimeAsync(100);
    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge).toHaveBeenCalledWith(expect.objectContaining({ id: "larp" }), "pretending", expect.any(AbortSignal));
    expect(game.getState()).toMatchObject({ phase: "agent", typingResult: { submittedText: "pretending", durationMs: 30_000, score: 56 } });
  });
  it("ends an unanswered deadline with zero without calling the LLM", async () => {
    const { game, setTime, judge } = setup();
    game.start(); setTime(30_000);
    await vi.advanceTimersByTimeAsync(100);
    expect(judge).not.toHaveBeenCalled();
    expect(game.getState()).toMatchObject({ phase: "agent", typingResult: { score: 0, definitionQuiz: { outcome: "empty" } } });
  });
  it("retries a failed judge with the same answer and time", async () => {
    const judge = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(judgment);
    const { game, setTime } = setup(judge);
    game.start(); setTime(10_000); game.submitPrompt("pretending");
    await vi.advanceTimersByTimeAsync(0);
    expect(game.getState()).toMatchObject({ phase: "judging", error: "Offline" });
    setTime(40_000); game.updateQuizDraft("cheating"); game.retryQuiz(); game.retryQuiz();
    await vi.advanceTimersByTimeAsync(0);
    expect(judge).toHaveBeenCalledTimes(2);
    expect(judge.mock.calls[1][1]).toBe("pretending");
    expect(game.getState()).toMatchObject({ phase: "agent", typingResult: { durationMs: 10_000 } });
  });
  it("allows skipping only failed judgments and ignores disposed responses", async () => {
    const { game } = setup(vi.fn().mockRejectedValue(new Error("Offline")));
    game.start(); game.skipQuiz(); expect(game.getState().phase).toBe("typing");
    game.submitPrompt("pretending"); await vi.advanceTimersByTimeAsync(0); game.skipQuiz();
    expect(game.getState()).toMatchObject({ phase: "agent", typingResult: { score: 0, definitionQuiz: { outcome: "skipped" } } });
    let resolve!: (value: QuizJudgment) => void;
    const second = setup(() => new Promise((done) => { resolve = done; })).game;
    second.start(); second.submitPrompt("pretending");
    const before = second.getState(); second.dispose(); resolve(judgment);
    await vi.advanceTimersByTimeAsync(0);
    expect(second.getState()).toBe(before);
  });
  it("finishes a mixed run with a distinct scoring version", async () => {
    const { game, setTime } = setup();
    let time = 0;
    game.start();
    for (const turn of session.turns) {
      time += 1000; setTime(time); game.submitPrompt("an answer");
      await vi.advanceTimersByTimeAsync(0);
      time += turn.agent.durationMs; setTime(time);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(game.getState()).toMatchObject({ phase: "finished", result: { scoringVersion: "v3-definition", turns: expect.any(Array) } });
  });
});
