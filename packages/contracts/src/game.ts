import type { DefinitionResult, QuizJudge, QuizQuestion, QUIZ_SCORING_VERSION } from "./quiz";
import type { SCORING_VERSION } from "./constants";
import type { AgentEvent, Session } from "./session";
import type { VisionSample } from "./vision";

/** One key press during a typing phase. `atMs` is relative to typingStartedAtMs. */
export interface KeystrokeEvent {
  key: string; // A printable character or "Backspace"
  atMs: number;
}

export interface TypingResult {
  /** Present for definition rounds; accuracy is semantic and point fields use a 0..100 budget. */
  definitionQuiz?: DefinitionResult;
  submittedText: string;
  durationMs: number; // Time from entering `typing` to submit, reaction time included
  timeLimitMs: number; // Speed points reach zero here; derived from target length
  accuracy: number; // 0..1, 1 - levenshtein / max(targetLength, submittedLength)
  speed: number; // 0..1, 1 - durationMs / timeLimitMs, clamped
  errors: number; // Levenshtein distance in Unicode code points
  longPauses: number; // Keystroke gaps over the pause threshold; 0 without a keystroke log
  corrections: number; // Backspace presses; 0 without a keystroke log
  speedPoints: number; // 0..300
  accuracyPoints: number; // 0..200
  penaltyPoints: number; // 0..150
  score: number; // 0..100, before final rounding
  notes: readonly string[]; // Human-readable reasons for the result screen
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
  scoringVersion: typeof SCORING_VERSION | typeof QUIZ_SCORING_VERSION;
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
  | { phase: "typing"; turnIndex: number; turnId: string; targetPrompt: string; typingStartedAtMs: number; quiz?: QuizQuestion; quizDraft?: string }
  | { phase: "judging"; turnIndex: number; turnId: string; question: QuizQuestion; submittedText: string; durationMs: number; error: string | null }
  | { phase: "agent"; turnIndex: number; turnId: string; agentStartedAtMs: number; agentEndsAtMs: number; typingResult: TypingResult; liveEfficiency: number }
  | { phase: "finished"; result: GameResult }
);

export interface GameOptions {
  session: Session;
  nickname: string; // Trim outer whitespace; require 1..24 Unicode code points.
  inputMode: "camera" | "mock";
  definitionQuiz?: { judge: QuizJudge; wordOffset?: number }; // Alternates quiz and typing, starting with a quiz.
  now?: () => number; // Defaults to performance.now(); scheduling must use the same clock.
}

export interface GameController {
  getState(): GameState; // Stable immutable snapshot until the next update.
  subscribe(listener: (state: GameState) => void): () => void; // Does not emit on subscription.
  start(): void; // ready -> typing; repeated calls have no effect.
  submitPrompt(text: string, keystrokes?: readonly KeystrokeEvent[]): boolean; // Accept only in typing, reject empty string, transition synchronously. Keystrokes are optional and enable pause/correction penalties.
  updateQuizDraft(text: string): void; // Engine retains the answer for automatic deadline submission.
  retryQuiz(): void; // Retry the frozen answer without changing elapsed time.
  skipQuiz(): void; // After a judging failure only; awards zero and resumes the run.
  ingestVision(sample: VisionSample): void; // Engine validates and gates samples by the active agent phase.
  dispose(): void; // Cancel all timers/listeners; idempotent. Create a new controller to restart.
}

export type GameFactory = (options: GameOptions) => GameController;
