import {
  SCORING,
  SCORING_VERSION,
  type GameController,
  type GameOptions,
  type GameResult,
  type GameState,
  type TranscriptEntry,
  type TurnResult,
  type TypingResult,
  type VisionSample,
} from "@vibecodemaxxing/contracts";
import { scoreTyping as engineScoreTyping } from "@vibecodemaxxing/game-engine";

// Design stand-in for `createGame` from @vibecodemaxxing/game-engine. It follows the README's
// timing and scoring rules closely enough to lay out every phase; swap it out when the engine lands.

// Typing is scored by the real engine (scoring v2); only the game loop below is a stand-in.
export function scoreTyping(target: string, submitted: string, durationMs: number): TypingResult {
  return engineScoreTyping({ target, submitted, durationMs });
}

function sampleValue(sample: VisionSample) {
  return sample.tracking && sample.confidence >= SCORING.minimumVisionConfidence ? sample.efficiency : 0;
}

function integrateShower(samples: VisionSample[], start: number, end: number) {
  const duration = end - start;
  let weighted = 0;
  let qualifying = 0;
  samples.forEach((sample, index) => {
    const next = samples[index + 1]?.capturedAtMs ?? Infinity;
    const until = Math.min(next, sample.capturedAtMs + SCORING.maximumVisionSampleAgeMs, end);
    const covered = Math.max(0, until - Math.max(sample.capturedAtMs, start));
    const value = sampleValue(sample);
    weighted += value * covered;
    if (sample.tracking && sample.confidence >= SCORING.minimumVisionConfidence) qualifying += covered;
  });
  const averageEfficiency = duration > 0 ? weighted / duration : 0;
  return {
    durationMs: duration,
    averageEfficiency,
    trackingCoverage: duration > 0 ? qualifying / duration : 0,
    score: 100 * averageEfficiency,
  };
}

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

export function createDesignGame({ session, nickname, inputMode, now = () => performance.now() }: GameOptions): GameController {
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
      return { ...base, phase, turnIndex, turnId: turn.id, targetPrompt: turn.prompt, typingStartedAtMs: typingStartedAt };
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
      scoringVersion: SCORING_VERSION,
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
      completed.push({ turnId: turn.id, typing: typingResult!, shower: integrateShower(samples, agentStartedAt, end) });
      samples = [];
      if (turnIndex === session.turns.length - 1) {
        finish();
      } else {
        turnIndex += 1;
        phase = "typing";
        typingStartedAt = end;
      }
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
    submitPrompt(text) {
      if (disposed) return false;
      catchUp();
      if (phase !== "typing" || text.length === 0) return false;
      const turn = session.turns[turnIndex];
      const submittedAt = now();
      typingResult = scoreTyping(turn.prompt, text, submittedAt - typingStartedAt);
      transcript = [...transcript, { kind: "user", id: `${turn.id}-prompt`, turnId: turn.id, text }];
      phase = "agent";
      agentStartedAt = submittedAt;
      eventCursor = 0;
      samples = [];
      catchUp();
      emit();
      return true;
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
      if (timer) clearInterval(timer);
      timer = null;
      listeners.clear();
    },
  };
}
