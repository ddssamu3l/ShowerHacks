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

export { createFogActivity, type FogActivity, type FogActivityOptions } from "./fog-activity";

export {
  createSixSeven,
  applySixSevenSample,
  freezeSixSeven,
  sixSevenProgress,
  scoreSixSeven,
  lastSixSevenCall,
  nextSixSevenCall,
  SIXSEVEN_DEFAULTS,
  type SixSevenConfig,
  type SixSevenState,
  type SixSevenSample,
  type SixSevenHand,
  type SixSevenCall,
  type SixSevenOptions,
  type SixSevenOutcome,
} from "./sixseven";

export { createSixSevenActivity, type SixSevenActivity, type SixSevenActivityOptions } from "./sixseven-activity";

// Game owner: implement and export `createGame: GameFactory` here.
// Timing, scoring, and lifecycle rules are specified in docs/technical-guide.md.
// Per-turn typing scoring is `scoreTyping` above; call it from submitPrompt.

export { getAgentWindows, type AgentWindow } from "./agent-windows";
export { quizForTurn, scoreDefinition } from "./quiz";
