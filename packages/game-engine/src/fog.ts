/**
 * Fog Wipe activity: the camera preview is fogged over and the player wipes
 * it clear with a hand while the agent works. Pure functions, no DOM.
 *
 * See docs/fog-wipe-mode.md for the rules and the proposed contract changes.
 *
 *   const fog = createFog();
 *   applyWipe(fog, sample);      // per vision sample
 *   advanceFog(fog, nowMs);      // per tick, only matters when refog is on
 *   scoreFog(fog);               // 0..100 at the agent deadline
 */

export interface WipePoint {
  /** 0..1, left to right in preview (already mirrored) coordinates. */
  x: number;
  /** 0..1, top to bottom. */
  y: number;
}

/** What the engine expects from vision for this mode. */
export interface WipeSample {
  /** performance.now() at frame capture, same clock as the engine. */
  capturedAtMs: number;
  /** Hand centers, up to two. Empty when tracking is false. */
  points: readonly WipePoint[];
  /** False when no hand is visible. Resets wipe continuity. */
  tracking: boolean;
}

export interface FogConfig {
  cols: number;
  rows: number;
  /** Wipe radius as a fraction of frame width. */
  wipeRadius: number;
  /** Fog removed at the center of one wipe sample. Falls off linearly to the edge. */
  wipeStrength: number;
  /** A hand must move at least this far (fraction of frame width) between samples to wipe. */
  minMoveDistance: number;
  /** Fog added back per second to every cell. 0 disables refog. */
  refogPerSecond: number;
  /** Samples older than this on arrival are dropped, ms. */
  maxSampleAgeMs: number;
}

export const FOG_DEFAULTS: FogConfig = {
  cols: 32,
  rows: 18,
  wipeRadius: 0.09,
  wipeStrength: 0.45,
  minMoveDistance: 0.01,
  refogPerSecond: 0,
  maxSampleAgeMs: 250,
};

export interface FogState {
  readonly cols: number;
  readonly rows: number;
  /** Row-major, cols * rows entries, 1 = opaque, 0 = clear. Safe for the UI to read. */
  readonly cells: Float32Array;
  /** Timestamp of the last accepted sample, or -Infinity. */
  lastSampleAtMs: number;
  /** Last accepted hand positions, used for the minimum-movement rule. */
  lastPoints: WipePoint[];
  /** Timestamp of the last advanceFog call, or null before the first. */
  lastAdvanceAtMs: number | null;
  /** Once frozen, wipes and refog are ignored. Set at the agent deadline. */
  frozen: boolean;
  readonly config: FogConfig;
}

export function createFog(overrides: Partial<FogConfig> = {}): FogState {
  const config = { ...FOG_DEFAULTS, ...overrides };
  if (config.cols < 1 || config.rows < 1) throw new Error("Fog grid needs at least one cell.");
  return {
    cols: config.cols,
    rows: config.rows,
    cells: new Float32Array(config.cols * config.rows).fill(1),
    lastSampleAtMs: Number.NEGATIVE_INFINITY,
    lastPoints: [],
    lastAdvanceAtMs: null,
    frozen: false,
    config,
  };
}

/**
 * Apply one vision sample. Returns true when the sample was accepted (even if
 * it wiped nothing because the hand did not move).
 *
 * `nowMs` is the engine clock at arrival, used for the max-age check. Omit it
 * to skip that check (tests, replays).
 */
export function applyWipe(fog: FogState, sample: WipeSample, nowMs?: number): boolean {
  if (fog.frozen) return false;
  if (!Number.isFinite(sample.capturedAtMs)) return false;
  if (sample.capturedAtMs <= fog.lastSampleAtMs) return false; // out of order or duplicate
  if (nowMs !== undefined) {
    if (sample.capturedAtMs > nowMs) return false; // from the future
    if (nowMs - sample.capturedAtMs > fog.config.maxSampleAgeMs) return false; // stale
  }

  fog.lastSampleAtMs = sample.capturedAtMs;

  if (!sample.tracking) {
    fog.lastPoints = [];
    return true;
  }

  const points = sample.points.filter(inFrame);
  points.forEach((p, i) => {
    if (!hasMoved(p, fog.lastPoints, fog.config.minMoveDistance)) return;
    // Low frame rates leave gaps between samples: wipe along the segment from the
    // previous position of the same hand, one stamp every half radius.
    const prev = fog.lastPoints[i];
    const step = fog.config.wipeRadius / 2;
    const d = prev ? Math.sqrt(dist2(prev, p)) : 0;
    if (prev && d > step) {
      const n = Math.min(24, Math.ceil(d / step));
      for (let k = 1; k <= n; k++) wipeAt(fog, { x: prev.x + (p.x - prev.x) * (k / n), y: prev.y + (p.y - prev.y) * (k / n) });
    } else {
      wipeAt(fog, p);
    }
  });
  fog.lastPoints = points;
  return true;
}

/** Add fog back for the time elapsed since the previous call. No-op when refog is 0. */
export function advanceFog(fog: FogState, nowMs: number): void {
  if (fog.frozen) return;
  const prev = fog.lastAdvanceAtMs;
  fog.lastAdvanceAtMs = nowMs;
  if (prev === null || fog.config.refogPerSecond <= 0) return;
  const dt = Math.max(0, nowMs - prev) / 1000;
  const add = fog.config.refogPerSecond * dt;
  if (add <= 0) return;
  const c = fog.cells;
  for (let i = 0; i < c.length; i++) c[i] = Math.min(1, c[i] + add);
}

/** Lock the state at the agent deadline. Late samples cannot change the result. */
export function freezeFog(fog: FogState): void {
  fog.frozen = true;
}

/** 0..1, how much of the frame is clear. */
export function clearedFraction(fog: FogState): number {
  const c = fog.cells;
  let sum = 0;
  for (let i = 0; i < c.length; i++) sum += c[i];
  return 1 - sum / c.length;
}

/** 0..100 turn score. */
export function scoreFog(fog: FogState): number {
  return 100 * clearedFraction(fog);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function inFrame(p: WipePoint): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}

/** True when no previous point is within minMove of this one. */
function hasMoved(p: WipePoint, previous: readonly WipePoint[], minMove: number): boolean {
  if (previous.length === 0) return true;
  const min2 = minMove * minMove;
  return !previous.some((q) => dist2(p, q) < min2);
}

function dist2(a: WipePoint, b: WipePoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Thin every cell within wipeRadius of p, full strength at the center, zero at the edge. */
function wipeAt(fog: FogState, p: WipePoint): void {
  const { cols, rows, cells } = fog;
  const { wipeRadius, wipeStrength } = fog.config;
  // Radius is a fraction of width; convert to cell units on each axis
  // so the wipe is a circle on a 16:9-ish grid, not an ellipse.
  const aspect = rows / cols;
  const rx = wipeRadius * cols;
  const ry = (wipeRadius / aspect) * rows;
  const cx = p.x * cols - 0.5;
  const cy = p.y * rows - 0.5;

  const c0 = Math.max(0, Math.floor(cx - rx));
  const c1 = Math.min(cols - 1, Math.ceil(cx + rx));
  const r0 = Math.max(0, Math.floor(cy - ry));
  const r1 = Math.min(rows - 1, Math.ceil(cy + ry));

  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const dx = (c - cx) / rx;
      const dy = (r - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;
      const i = r * cols + c;
      cells[i] = Math.max(0, cells[i] - wipeStrength * (1 - d));
    }
  }
}
