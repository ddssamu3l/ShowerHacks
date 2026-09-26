/**
 * Six Seven activity: the player holds both palms up and rocks them in
 * anti-phase, like weighing two things ("six... seven!"). Pure functions,
 * no DOM. See docs/sixseven-mode.md.
 *
 *   const state = createSixSeven({ durationMs });
 *   applySixSevenSample(state, sample);   // per vision sample, returns "beat" when a six or a seven landed
 *   sixSevenProgress(state);              // 0..1, beats / target
 *   scoreSixSeven(state);                 // 0..100 at the agent deadline
 *
 * Detection works on the gap between the two palms, yLeft - yRight. Rocking
 * hands in anti-phase makes the gap swing; moving both hands together keeps
 * it flat. Every reversal of the gap that travels at least `minAmplitude`
 * since the previous turning point is one beat. Beats alternate six, seven.
 */

export type SixSevenSide = "left" | "right";
export type SixSevenCall = "six" | "seven";

export interface SixSevenHand {
  side: SixSevenSide;
  /** 0..1 across the frame. Only the horizontal distance between hands is used. */
  x: number;
  /** 0..1, top to bottom. */
  y: number;
}

/** What the engine expects from vision for this mode. */
export interface SixSevenSample {
  /** performance.now() at frame capture, same clock as the engine. */
  capturedAtMs: number;
  /** Tracked palms, at most one per side. Fewer than two means no beat can land. */
  hands: readonly SixSevenHand[];
}

export interface SixSevenConfig {
  /** The palm gap has to change by this much (fraction of frame height) between two beats. */
  minAmplitude: number;
  /** Hands closer than this horizontally (fraction of frame width) are ignored: one hand seen twice is not two hands. */
  minHandGap: number;
  /** Reversals faster than this are geometry, not beats; they flip direction without counting. */
  minBeatIntervalMs: number;
  /** A beat later than this after the previous one starts a new streak. */
  maxBeatIntervalMs: number;
  /** Beats needed per second of the turn to reach 100. About 0.8 full six-seven cycles a second. */
  targetBeatsPerSecond: number;
  /** Exponential smoothing on the gap, 0..1; 1 = no smoothing. */
  smoothing: number;
  /** Samples older than this on arrival are dropped, ms. */
  maxSampleAgeMs: number;
}

export const SIXSEVEN_DEFAULTS: SixSevenConfig = {
  minAmplitude: 0.07,
  minHandGap: 0.06,
  minBeatIntervalMs: 120,
  maxBeatIntervalMs: 1500,
  targetBeatsPerSecond: 1.6,
  smoothing: 0.5,
  maxSampleAgeMs: 250,
};

export interface SixSevenState {
  /** Beats landed so far. Odd beats are a six, even beats a seven. */
  beats: number;
  /** Consecutive beats no further apart than maxBeatIntervalMs. */
  streak: number;
  bestStreak: number;
  /** Beats needed for a full score. */
  targetBeats: number;
  /** Timestamp of the last beat, or -Infinity. */
  lastBeatAtMs: number;
  /** Timestamp of the last accepted sample, or -Infinity. */
  lastSampleAtMs: number;
  /** Smoothed yLeft - yRight, null until both hands are seen. */
  gap: number | null;
  /** The gap at the last turning point (or where tracking began). */
  peak: number | null;
  /** Sign of the gap's travel since the peak. 0 before the first beat or after a tracking gap. */
  direction: -1 | 0 | 1;
  /** Once frozen, samples are ignored. Set at the agent deadline. */
  frozen: boolean;
  readonly config: SixSevenConfig;
}

export interface SixSevenOptions extends Partial<SixSevenConfig> {
  /** Length of the turn; sets targetBeats. */
  durationMs?: number;
  /** Explicit target, overrides durationMs. */
  targetBeats?: number;
}

export function createSixSeven(options: SixSevenOptions = {}): SixSevenState {
  const { durationMs, targetBeats, ...overrides } = options;
  const config = { ...SIXSEVEN_DEFAULTS, ...overrides };
  const target = targetBeats ?? (durationMs !== undefined ? Math.round((durationMs / 1000) * config.targetBeatsPerSecond) : 20);
  if (!Number.isFinite(target) || target < 1) throw new Error("Six Seven needs a target of at least one beat.");
  return {
    beats: 0,
    streak: 0,
    bestStreak: 0,
    targetBeats: target,
    lastBeatAtMs: Number.NEGATIVE_INFINITY,
    lastSampleAtMs: Number.NEGATIVE_INFINITY,
    gap: null,
    peak: null,
    direction: 0,
    frozen: false,
    config,
  };
}

export type SixSevenOutcome = "rejected" | "idle" | "beat";

/**
 * Apply one vision sample. "rejected" for stale, out-of-order or frozen input,
 * "beat" when a six or a seven just landed, "idle" otherwise.
 *
 * `nowMs` is the engine clock at arrival, used for the max-age check. Omit it
 * to skip that check (tests, replays).
 */
export function applySixSevenSample(state: SixSevenState, sample: SixSevenSample, nowMs?: number): SixSevenOutcome {
  if (state.frozen) return "rejected";
  const t = sample.capturedAtMs;
  if (!Number.isFinite(t)) return "rejected";
  if (t <= state.lastSampleAtMs) return "rejected"; // out of order or duplicate
  if (nowMs !== undefined) {
    if (t > nowMs) return "rejected"; // from the future
    if (nowMs - t > state.config.maxSampleAgeMs) return "rejected"; // stale
  }
  state.lastSampleAtMs = t;

  const left = sample.hands.find((h) => h.side === "left" && inFrame(h));
  const right = sample.hands.find((h) => h.side === "right" && inFrame(h));
  if (!left || !right || Math.abs(left.x - right.x) < state.config.minHandGap) {
    // Lost a hand: forget the gap so a hand reappearing elsewhere does not read as a swing.
    state.gap = null;
    state.peak = null;
    state.direction = 0;
    return "idle";
  }

  const raw = left.y - right.y;
  state.gap = state.gap === null ? raw : state.gap + (raw - state.gap) * state.config.smoothing;
  if (state.peak === null) {
    state.peak = state.gap;
    return "idle";
  }

  const travel = state.gap - state.peak;
  const sign: -1 | 0 | 1 = travel > 0 ? 1 : travel < 0 ? -1 : 0;
  if (state.direction !== 0 && sign === state.direction) {
    // Still heading the same way: this is the new turning-point candidate.
    state.peak = state.gap;
    return "idle";
  }
  if (Math.abs(travel) < state.config.minAmplitude) return "idle";

  // Reversed (or first move) by at least the amplitude: a beat.
  state.direction = sign;
  state.peak = state.gap;
  if (t - state.lastBeatAtMs < state.config.minBeatIntervalMs) return "idle";
  state.streak = t - state.lastBeatAtMs <= state.config.maxBeatIntervalMs ? state.streak + 1 : 1;
  state.bestStreak = Math.max(state.bestStreak, state.streak);
  state.beats += 1;
  state.lastBeatAtMs = t;
  return "beat";
}

/** Lock the state at the agent deadline. Late samples cannot change the result. */
export function freezeSixSeven(state: SixSevenState): void {
  state.frozen = true;
}

/** 0..1, beats over target, capped. */
export function sixSevenProgress(state: SixSevenState): number {
  return Math.min(1, state.beats / state.targetBeats);
}

/** 0..100 turn score. */
export function scoreSixSeven(state: SixSevenState): number {
  return 100 * sixSevenProgress(state);
}

/** What the last beat was, or null before the first. */
export function lastSixSevenCall(state: SixSevenState): SixSevenCall | null {
  if (state.beats === 0) return null;
  return state.beats % 2 === 1 ? "six" : "seven";
}

/** What the next beat will be. */
export function nextSixSevenCall(state: SixSevenState): SixSevenCall {
  return state.beats % 2 === 0 ? "six" : "seven";
}

function inFrame(h: SixSevenHand): boolean {
  return Number.isFinite(h.x) && Number.isFinite(h.y) && h.x >= 0 && h.x <= 1 && h.y >= 0 && h.y <= 1;
}
