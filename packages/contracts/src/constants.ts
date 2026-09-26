export const SCORING_VERSION = "v1" as const;
export const SCORING = {
  typingWeight: 0.5,
  showerWeight: 0.5,
  targetCharactersPerSecond: 5,
  minimumTypingSeconds: 0.25,
  minimumVisionConfidence: 0.5,
  maximumVisionSampleAgeMs: 250,
  maximumScore: 10_000,
} as const;
