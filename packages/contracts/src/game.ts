import type { SCORING_VERSION } from "./constants";
import type { AgentEvent, Session } from "./session";
import type { VisionSample } from "./vision";

export interface TypingResult {
  submittedText: string;
  durationMs: number;
  accuracy: number; // 0..1
  speed: number; // 0..1, normalized against target characters/second
  score: number; // 0..100, before final rounding
}

export interface TurnResult {
  turnId: string;
  typing: TypingResult;
  shower: {
    durationMs: number;
    averageEfficiency: number; // 0..1, full-duration time average
    trackingCoverage: number; // 0..1, time with a qualifying sample
    score: number; // 0..100
  };
}

export interface GameResult {
  runId: string;
  nickname: string;
  sessionId: string;
  sessionVersion: number;
  scoringVersion: typeof SCORING_VERSION;
  inputMode: "camera" | "mock";
  completedAt: string; // ISO-8601 UTC; wall clock for display only
  typingScore: number; // 0..100, equal-weight mean across turns
  showerScore: number; // 0..100, equal-weight mean across turns
  totalScore: number; // Integer 0..10000
  turns: readonly TurnResult[];
}

export type TranscriptEntry =
  | { kind: "user"; id: string; turnId: string; text: string }
  | { kind: "agent"; turnId: string; event: AgentEvent };

interface GameStateBase {
  runId: string;
  nickname: string;
  sessionId: string;
  sessionVersion: number;
  inputMode: "camera" | "mock";
  turnCount: number;
  transcript: readonly TranscriptEntry[];
  completedTurns: readonly TurnResult[];
  score: { typing: number; shower: number; total: number }; // Completed-turn averages, zero before first completion.
}

export type GameState = GameStateBase & (
  | { phase: "ready" }
  | { phase: "typing"; turnIndex: number; turnId: string; targetPrompt: string; typingStartedAtMs: number }
  | { phase: "agent"; turnIndex: number; turnId: string; agentStartedAtMs: number; agentEndsAtMs: number; typingResult: TypingResult; liveEfficiency: number }
  | { phase: "finished"; result: GameResult }
);

export interface GameOptions {
  session: Session;
  nickname: string; // Trim outer whitespace; require 1..24 Unicode code points.
  inputMode: "camera" | "mock";
  now?: () => number; // Defaults to performance.now(); scheduling must use the same clock.
}

export interface GameController {
  getState(): GameState; // Stable immutable snapshot until the next update.
  subscribe(listener: (state: GameState) => void): () => void; // Does not emit on subscription.
  start(): void; // ready -> typing; repeated calls have no effect.
  submitPrompt(text: string): boolean; // Accept only in typing, reject empty string, transition synchronously.
  ingestVision(sample: VisionSample): void; // Engine validates and gates samples by the active agent phase.
  dispose(): void; // Cancel all timers/listeners; idempotent. Create a new controller to restart.
}

export type GameFactory = (options: GameOptions) => GameController;
