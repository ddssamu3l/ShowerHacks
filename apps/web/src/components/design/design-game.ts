import {
  SCORING,
  SCORING_VERSION,
  QUIZ_SCORING_VERSION,
  QUIZ_MAX_ANSWER_LENGTH,
  quizJudgmentSchema,
  type QuizQuestion,
  type DefinitionResult,
  type GameController,
  type GameOptions,
  type GameResult,
  type GameState,
  type TranscriptEntry,
  type TurnResult,
  type TypingResult,
  type VisionSample,
} from "@vibecodemaxxing/contracts";
import { scoreTyping, scoreDefinition, quizForTurn } from "@vibecodemaxxing/game-engine";

// Design stand-in for `createGame` from @vibecodemaxxing/game-engine. It follows the README's
// timing rules closely enough to lay out every phase; swap it out when createGame lands.
// Typing is already scored by the engine's scoreTyping.

function sampleValue(sample: VisionSample) {
  return sample.tracking && sample.confidence >= SCORING.minimumVisionConfidence ? sample.efficiency : 0;
}

function finalizeCumulative(samples: VisionSample[], start: number, end: number) {
  const duration = end - start;
  const last = samples.at(-1);
  const cleared = last ? sampleValue(last) : 0;
  const covered = samples.length ? Math.min(duration, last!.capturedAtMs - samples[0].capturedAtMs + SCORING.maximumVisionSampleAgeMs) : 0;
  return { durationMs: duration, averageEfficiency: cleared, trackingCoverage: duration > 0 ? covered / duration : 0, score: 100 * cleared };
}

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

export function createDesignGame({ session, nickname, inputMode, definitionQuiz, now = () => performance.now() }: GameOptions): GameController {
  const runId = crypto.randomUUID();
  const name = nickname.trim();
  let phase: GameState["phase"] = "ready";
  let turnIndex = 0;
  let typingStartedAt = 0;
  let agentStartedAt = 0;
  let eventCursor = 0;
  let typingResult: TypingResult | null = null;
  let transcript: TranscriptEntry[] = [];
  const completed: TurnResult[] = [];
  let samples: VisionSample[] = [];
  let result: GameResult | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  let quizDraft = "";
  const wordOffset = definitionQuiz?.wordOffset ?? 0;
  const currentQuiz = () => definitionQuiz ? quizForTurn(turnIndex, wordOffset) : undefined;
  let pendingQuiz: { question: QuizQuestion; answer: string; durationMs: number } | null = null;
  let judgeError: string | null = null;
  let judgeController: AbortController | null = null;
  const listeners = new Set<(state: GameState) => void>();

  const score = () => {
    const typing = mean(completed.map((turn) => turn.typing.score));
    const shower = mean(completed.map((turn) => turn.shower.score));
    return { typing, shower, total: Math.round(100 * (SCORING.typingWeight * typing + SCORING.showerWeight * shower)) };
  };

  const liveEfficiency = () => {
    const last = samples.at(-1);
    if (!last || now() - last.capturedAtMs > SCORING.maximumVisionSampleAgeMs) return 0;
    return sampleValue(last);
  };

  const build = (): GameState => {
    const base = {
      runId,
      nickname: name,
      sessionId: session.id,
      sessionVersion: session.sessionVersion,
      inputMode,
      turnCount: session.turns.length,
      transcript,
      completedTurns: [...completed],
      score: score(),
    };
    const turn = session.turns[turnIndex];
    if (phase === "typing") {
      return { ...base, phase, turnIndex, turnId: turn.id, targetPrompt: turn.prompt, typingStartedAtMs: typingStartedAt, quiz: currentQuiz(), quizDraft };
    }
    if (phase === "judging" && pendingQuiz) {
      return { ...base, phase, turnIndex, turnId: turn.id, question: pendingQuiz.question,
        submittedText: pendingQuiz.answer, durationMs: pendingQuiz.durationMs, error: judgeError };
    }
    if (phase === "agent") {
      return {
        ...base,
        phase,
        turnIndex,
        turnId: turn.id,
        agentStartedAtMs: agentStartedAt,
        agentEndsAtMs: agentStartedAt + turn.agent.durationMs,
        typingResult: typingResult!,
        liveEfficiency: liveEfficiency(),
      };
    }
    if (phase === "finished") return { ...base, phase, result: result! };
    return { ...base, phase: "ready" };
  };

  let snapshot = build();
  const emit = () => {
    snapshot = build();
    listeners.forEach((listener) => listener(snapshot));
  };

  const finish = () => {
    const totals = score();
    result = {
      runId,
      nickname: name,
      sessionId: session.id,
      sessionVersion: session.sessionVersion,
      scoringVersion: definitionQuiz ? QUIZ_SCORING_VERSION : SCORING_VERSION,
      inputMode,
      completedAt: new Date().toISOString(),
      typingScore: totals.typing,
      showerScore: totals.shower,
      totalScore: totals.total,
      turns: [...completed],
    };
    phase = "finished";
    if (timer) clearInterval(timer);
    timer = null;
  };

  const startAgent = () => {
    phase = "agent";
    agentStartedAt = now();
    eventCursor = 0;
    samples = [];
    catchUp();
    emit();
  };

  const completeQuiz = (result: DefinitionResult) => {
    if (!pendingQuiz || disposed) return;
    typingResult = scoreDefinition(pendingQuiz.answer, pendingQuiz.durationMs, result);
    pendingQuiz = null;
    judgeError = null;
    startAgent();
  };

  const judgePendingQuiz = async () => {
    if (!pendingQuiz || !definitionQuiz || disposed || judgeController) return;
    const pending = pendingQuiz;
    const controller = new AbortController();
    judgeController = controller;
    judgeError = null;
    emit();
    try {
      const judgment = quizJudgmentSchema.parse(await definitionQuiz.judge(pending.question, pending.answer, controller.signal));
      if (disposed || controller.signal.aborted || pendingQuiz !== pending) return;
      completeQuiz({ question: pending.question, ...judgment, outcome: "graded" });
    } catch (error) {
      if (disposed || controller.signal.aborted || pendingQuiz !== pending) return;
      judgeError = error instanceof Error ? error.message : "The judge is unavailable. Please retry.";
      emit();
    } finally {
      if (judgeController === controller) judgeController = null;
    }
  };

  const submitDefinition = (answer: string, question: QuizQuestion, submittedAt: number) => {
    pendingQuiz = { question, answer, durationMs: Math.max(0, Math.min(question.timeLimitMs, submittedAt - typingStartedAt)) };
    phase = "judging";
    transcript = [...transcript, { kind: "user", id: `${session.turns[turnIndex].id}-quiz`, turnId: session.turns[turnIndex].id, text: `Define ${question.word}: ${answer || "(no answer)"}` }];
    if (!answer.trim()) {
      completeQuiz({ question, accuracy: 0, feedback: "No definition was submitted before time ran out.", definition: "", outcome: "empty" });
    } else {
      void judgePendingQuiz();
    }
  };

  const catchUp = () => {
    while (phase === "agent") {
      const turn = session.turns[turnIndex];
      const events = turn.agent.events;
      const current = now();
      while (eventCursor < events.length && agentStartedAt + events[eventCursor].atMs <= current) {
        transcript = [...transcript, { kind: "agent", turnId: turn.id, event: events[eventCursor] }];
        eventCursor += 1;
      }
      const end = agentStartedAt + turn.agent.durationMs;
      if (current < end) return;
      // Both activities are cumulative: the shower scores the fraction of filth washed off,
      // the fog wipe the fraction of the frame cleared. The last reported value is the turn score.
      const shower = finalizeCumulative(samples, agentStartedAt, end);
      completed.push({ turnId: turn.id, typing: typingResult!, shower });
      samples = [];
      if (turnIndex === session.turns.length - 1) {
        finish();
      } else {
        turnIndex += 1;
        phase = "typing";
        typingStartedAt = end;
        quizDraft = "";
      }
    }
    const question = currentQuiz();
    if (phase === "typing" && question && now() >= typingStartedAt + question.timeLimitMs) {
      submitDefinition(quizDraft, question, typingStartedAt + question.timeLimitMs);
    }
  };

  const tick = () => {
    if (disposed) return;
    catchUp();
    emit();
  };

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (disposed || phase !== "ready") return;
      phase = "typing";
      turnIndex = 0;
      typingStartedAt = now();
      timer = setInterval(tick, 100);
      emit();
    },
    submitPrompt(text, keystrokes) {
      if (disposed) return false;
      catchUp();
      if (phase !== "typing" || text.length === 0) return false;
      const turn = session.turns[turnIndex];
      const submittedAt = now();
      const question = currentQuiz();
      if (question) {
        if (!text.trim() || text.length > QUIZ_MAX_ANSWER_LENGTH) return false;
        submitDefinition(text, question, submittedAt);
        return true;
      }
      typingResult = scoreTyping({ target: turn.prompt, submitted: text, durationMs: submittedAt - typingStartedAt, keystrokes });
      transcript = [...transcript, { kind: "user", id: `${turn.id}-prompt`, turnId: turn.id, text }];
      phase = "agent";
      agentStartedAt = submittedAt;
      eventCursor = 0;
      samples = [];
      catchUp();
      emit();
      return true;
    },
    updateQuizDraft(text) {
      if (disposed) return;
      catchUp();
      if (phase !== "typing" || !currentQuiz()) return;
      quizDraft = text.slice(0, QUIZ_MAX_ANSWER_LENGTH);
      emit();
    },
    retryQuiz() {
      if (!disposed && phase === "judging" && judgeError && !judgeController) void judgePendingQuiz();
    },
    skipQuiz() {
      if (disposed || phase !== "judging" || !pendingQuiz || !judgeError) return;
      judgeController?.abort();
      judgeController = null;
      completeQuiz({ question: pendingQuiz.question, accuracy: 0, feedback: "Judging was unavailable. This round was skipped for zero points.", definition: "", outcome: "skipped" });
    },
    ingestVision(sample) {
      if (disposed || phase !== "agent") return;
      const current = now();
      const last = samples.at(-1);
      if (
        !Number.isFinite(sample.efficiency) ||
        sample.efficiency < 0 ||
        sample.efficiency > 1 ||
        sample.capturedAtMs < agentStartedAt ||
        sample.capturedAtMs > current ||
        current - sample.capturedAtMs > SCORING.maximumVisionSampleAgeMs ||
        (last && sample.capturedAtMs <= last.capturedAtMs)
      ) {
        return;
      }
      samples.push(sample);
    },
    dispose() {
      disposed = true;
      judgeController?.abort();
      if (timer) clearInterval(timer);
      timer = null;
      listeners.clear();
    },
  };
}
