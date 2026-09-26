import type { GameResult } from "@vibecodemaxxing/contracts";

const PLAYER_KEY = "vcm:player";
const RESULT_KEY = "vcm:result";

export interface PlayerChoice {
  nickname: string;
  sessionId: string;
  inputMode: "camera" | "mock";
}

function read<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const readPlayer = () => read<PlayerChoice>(PLAYER_KEY);
export const savePlayer = (player: PlayerChoice) => window.sessionStorage.setItem(PLAYER_KEY, JSON.stringify(player));
export const readResult = () => read<GameResult>(RESULT_KEY);
export const saveResult = (result: GameResult) => window.sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));

export function nicknameProblem(nickname: string) {
  const length = Array.from(nickname.trim()).length;
  if (length === 0) return "Pick a name for the leaderboard.";
  if (length > 24) return "Keep it to 24 characters.";
  return null;
}
