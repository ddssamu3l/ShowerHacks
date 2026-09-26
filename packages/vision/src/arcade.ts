import type { WashEvent, WashZone } from "./types";

// Standalone playground scoring only. Main-game scoring remains the engine owner's responsibility.
export const COMBO_WINDOW_MS = 6500;
export interface ArcadeState {
  points: number; combo: number; bestCombo: number; multiplier: number;
  lastChangeAt: number; lastZone: WashZone | null; repetition: number;
  history: WashZone[]; hits: number; zoneHits: Partial<Record<WashZone, number>>;
}
export interface ArcadeHit { points: number; title: string; repeated: boolean; zone: WashZone; at: number }
export const initialArcadeState = (): ArcadeState => ({ points: 0, combo: 0, bestCombo: 0, multiplier: 1, lastChangeAt: -Infinity, lastZone: null, repetition: 0, history: [], hits: 0, zoneHits: {} });

export function expireCombo(state: ArcadeState, now: number): ArcadeState {
  if (!state.combo || now - state.lastChangeAt <= COMBO_WINDOW_MS) return state;
  return { ...state, combo: 0, multiplier: 1, history: [] };
}

export function scoreWash(previous: ArcadeState, event: WashEvent): { state: ArcadeState; hit: ArcadeHit } {
  const state = expireCombo(previous, event.capturedAtMs);
  const repeated = state.lastZone === event.zone;
  const repetition = repeated ? state.repetition + 1 : 0;
  const history = repeated ? state.history : [...state.history, event.zone].slice(-4);
  const unique = new Set(history).size;
  const combo = repeated ? state.combo : state.combo + 1;
  const multiplier = Math.min(2.5, 1 + Math.max(0, unique - 1) * .5);
  const penalty = [1, .65, .3, .15][Math.min(3, repetition)];
  const points = Math.round((80 + Math.max(0, Math.min(1, event.intensity)) * 70) * multiplier * penalty);
  const title = repeated ? repetition > 1 ? "SWITCH IT UP!" : "SPOT CAMPING" : unique >= 4 ? "SOAP GOD" : unique >= 3 ? "FULL STACK CLEANSE" : combo >= 2 ? "CLEAN COMBO" : "FIRST SCRUB";
  return {
    state: { ...state, points: state.points + points, combo, bestCombo: Math.max(state.bestCombo, combo), multiplier, history, repetition, lastZone: event.zone, lastChangeAt: repeated ? state.lastChangeAt : event.capturedAtMs, hits: state.hits + 1, zoneHits: { ...state.zoneHits, [event.zone]: (state.zoneHits[event.zone] ?? 0) + 1 } },
    hit: { points, title, repeated, zone: event.zone, at: event.capturedAtMs },
  };
}
