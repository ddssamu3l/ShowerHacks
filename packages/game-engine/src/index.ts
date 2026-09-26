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

// Game owner: implement and export `createGame: GameFactory` here.
// Timing, scoring, and lifecycle rules are specified in the root README.
// Per-turn typing scoring is `scoreTyping` above; call it from submitPrompt.

export { getAgentWindows, type AgentWindow } from "./agent-windows";
export { quizForTurn, scoreDefinition } from "./quiz";
