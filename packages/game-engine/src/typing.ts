/**
 * Typing scorer (scoring v2).
 *
 * Grades how well the player retyped the prompt: elapsed time, typos,
 * long pauses, corrections. Pure functions, no DOM, no React, no timers.
 * The game controller calls `scoreTyping` once per submitted prompt.
 *
 * Entry points:
 *   scoreTyping(input)            -> TypingResult (contract type), points and 0..100 score
 *   diffChars(target, typed)      -> per-character diff for live highlighting in the UI
 *   liveAccuracy(target, prefix)  -> accuracy over what has been typed so far
 *   timeLimitMs(targetLength)     -> when speed points hit zero, for a countdown bar
 */

import { TYPING_SCORING, type KeystrokeEvent, type TypingResult } from "@vibecodemaxxing/contracts";

export type TypingConfig = { readonly [K in keyof typeof TYPING_SCORING]: number };

export interface TypingInput {
  /** The prompt the player was supposed to type. Compared exactly, no trim, no case folding. */
  target: string;
  /** What the player submitted. */
  submitted: string;
  /** ms from entering `typing` to submit. Reaction time counts. */
  durationMs: number;
  /** Optional. Enables long-pause and correction penalties. */
  keystrokes?: readonly KeystrokeEvent[];
}

export type CharState = "correct" | "wrong" | "missing" | "extra";

export interface CharDiff {
  char: string;
  state: CharState;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function scoreTyping(input: TypingInput, config: TypingConfig = TYPING_SCORING): TypingResult {
  const target = Array.from(input.target);
  const submitted = Array.from(input.submitted);
  const durationMs = Number.isFinite(input.durationMs) ? Math.max(0, input.durationMs) : 0;
  const notes: string[] = [];

  // Speed: full points at t=0, linear decay, zero at the time limit.
  const limitMs = timeLimitMs(target.length, config);
  const speed = limitMs > 0 ? clamp(1 - durationMs / limitMs, 0, 1) : 0;
  const speedPoints = speed * config.maxSpeedPoints;
  if (durationMs >= limitMs) notes.push(`Over the ${(limitMs / 1000).toFixed(1)}s limit, no speed points`);
  else if (durationMs <= limitMs / config.timeLimitFactor) notes.push("Fast: under par time");

  // Accuracy: edit distance over code points, squared so typos are visible even in short prompts.
  const errors = levenshtein(target, submitted);
  const denom = Math.max(target.length, submitted.length);
  const accuracy = denom === 0 ? 1 : clamp(1 - errors / denom, 0, 1);
  const accuracyPoints = accuracy * accuracy * config.maxAccuracyPoints;
  if (errors === 0) notes.push("Perfect retype");
  else notes.push(`${errors} typo${errors === 1 ? "" : "s"}`);

  // Penalties: hesitation and backspacing, only measurable with a keystroke log.
  const { longPauses, corrections } = analyzeKeystrokes(input.keystrokes ?? [], config.pauseThresholdMs);
  const rawPenalty =
    errors * config.typoPenalty + longPauses * config.pausePenalty + corrections * config.correctionPenalty;
  const penaltyPoints = Math.min(rawPenalty, config.maxPenaltyPoints);
  if (longPauses > 0) notes.push(`${longPauses} long pause${longPauses === 1 ? "" : "s"}`);
  if (corrections > 0) notes.push(`${corrections} correction${corrections === 1 ? "" : "s"}`);

  const maxPoints = config.maxSpeedPoints + config.maxAccuracyPoints;
  const points = Math.max(0, speedPoints + accuracyPoints - penaltyPoints);
  const score = (points / maxPoints) * 100;

  return {
    submittedText: input.submitted,
    durationMs,
    timeLimitMs: limitMs,
    accuracy,
    speed,
    errors,
    longPauses,
    corrections,
    speedPoints,
    accuracyPoints,
    penaltyPoints,
    score,
    notes,
  };
}

/** Milliseconds a `wpm` typist needs for `chars` code points (5 chars = 1 word). */
export function parTimeMs(chars: number, wpm: number): number {
  if (wpm <= 0) return 0;
  return (chars / 5 / wpm) * 60_000;
}

/** Milliseconds after which speed points are zero for a prompt of `targetLength` code points. */
export function timeLimitMs(targetLength: number, config: TypingConfig = TYPING_SCORING): number {
  return parTimeMs(targetLength, config.parWpm) * config.timeLimitFactor;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/**
 * Per-character diff of typed vs target. Uses the Levenshtein alignment so a
 * single dropped letter doesn't mark the whole rest of the line as wrong.
 */
export function diffChars(target: string, typed: string): CharDiff[] {
  const a = Array.from(target);
  const b = Array.from(typed);
  const dp = levenshteinTable(a, b);

  const out: CharDiff[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      out.push({ char: a[i - 1], state: "correct" });
      i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      out.push({ char: b[j - 1], state: "wrong" });
      i--; j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      out.push({ char: b[j - 1], state: "extra" });
      j--;
    } else {
      out.push({ char: a[i - 1], state: "missing" });
      i--;
    }
  }
  return out.reverse();
}

/** Accuracy while the player is still typing: compares only the prefix typed so far. */
export function liveAccuracy(target: string, typedSoFar: string): number {
  const b = Array.from(typedSoFar);
  if (b.length === 0) return 1;
  const a = Array.from(target).slice(0, b.length);
  return clamp(1 - levenshtein(a, b) / b.length, 0, 1);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function analyzeKeystrokes(keys: readonly KeystrokeEvent[], pauseThresholdMs: number) {
  let corrections = 0;
  let longPauses = 0;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].key === "Backspace") corrections++;
    if (i > 0 && keys[i].atMs - keys[i - 1].atMs > pauseThresholdMs) longPauses++;
  }
  return { corrections, longPauses };
}

export function levenshtein(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  return levenshteinTable(a, b)[a.length][b.length];
}

function levenshteinTable(a: readonly string[], b: readonly string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
