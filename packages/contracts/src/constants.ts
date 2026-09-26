export const SCORING_VERSION = "v2" as const;

/**
 * Typing scoring (v2): absolute time with per-second decay, plus penalties.
 *
 *   timeLimitSec  = parTimeSec(targetLength, parWpm) * timeLimitFactor
 *   speedPoints   = maxSpeedPoints * (1 - elapsedSec / timeLimitSec), clamped 0..max
 *   accuracy      = 1 - levenshtein / max(targetLength, submittedLength)
 *   accuracyPts   = maxAccuracyPoints * accuracy^2
 *   penaltyPoints = min(maxPenaltyPoints, typos*typoPenalty + pauses*pausePenalty + backspaces*correctionPenalty)
 *   score (0..100)= max(0, speedPoints + accuracyPts - penaltyPoints) / (maxSpeedPoints + maxAccuracyPoints) * 100
 */
export const TYPING_SCORING = {
  maxSpeedPoints: 300,
  maxAccuracyPoints: 200,
  /** Reference typing speed used to derive par time for a prompt. */
  parWpm: 40,
  /** Speed points reach zero at parTime * timeLimitFactor. */
  timeLimitFactor: 3,
  /** Gap between two keystrokes above this counts as a long pause. */
  pauseThresholdMs: 2000,
  typoPenalty: 5,
  pausePenalty: 15,
  correctionPenalty: 3,
  maxPenaltyPoints: 150,
} as const;

export const SCORING = {
  typingWeight: 0.5,
  showerWeight: 0.5,
  minimumVisionConfidence: 0.5,
  maximumVisionSampleAgeMs: 250,
  maximumScore: 10_000,
} as const;
