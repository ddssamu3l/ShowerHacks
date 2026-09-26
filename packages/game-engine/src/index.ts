export type { GameController, GameFactory, GameOptions, GameResult, GameState } from "@vibecodemaxxing/contracts";

export {
  scoreTyping,
  diffChars,
  liveAccuracy,
  levenshtein,
  parTimeMs,
  timeLimitMs,
  type TypingInput,
  type TypingConfig,
  type CharDiff,
  type CharState,
} from "./typing";

export {
  createFog,
  applyWipe,
  advanceFog,
  freezeFog,
  clearedFraction,
  scoreFog,
  FOG_DEFAULTS,
  type FogConfig,
  type FogState,
  type WipePoint,
  type WipeSample,
} from "./fog";

// Game owner: implement and export `createGame: GameFactory` here.
// Timing, scoring, and lifecycle rules are specified in the root README.
// Per-turn typing scoring is `scoreTyping` above; call it from submitPrompt.
