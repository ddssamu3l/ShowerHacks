import type { GameResult } from "./game";
import type { Session, SessionSummary } from "./session";

export interface ApiError {
  error: { code: string; message: string };
}

export interface SessionListResponse { sessions: SessionSummary[] }
export interface SessionResponse { session: Session }

export interface LeaderboardEntry {
  runId: string;
  nickname: string;
  sessionId: string;
  sessionVersion: number;
  scoringVersion: GameResult["scoringVersion"];
  typingScore: number;
  showerScore: number;
  totalScore: number;
  completedAt: string; // Server receipt time, not a client-supplied sort key.
}

export interface LeaderboardResponse { entries: LeaderboardEntry[] }
export interface SubmitScoreRequest { result: GameResult }
export interface SubmitScoreResponse {
  entry: LeaderboardEntry;
  rank: number; // 1-based rank among all runs in this session/version/scoring board
  entries: LeaderboardEntry[]; // Top 10; same ordering as GET
}

/** Internal disk format; never return the full stored result from GET. */
export interface StoredLeaderboardRun {
  result: GameResult; // Original validated result, retained for idempotency checks.
  entry: LeaderboardEntry; // Public projection with server-assigned completedAt.
}

export interface LeaderboardStore {
  schemaVersion: 1;
  entries: StoredLeaderboardRun[];
}
