/**
 * Keeps the sponge attached to a hand that the tracker only reports 3-4 times a second.
 *
 * Each tracker sample gives a position and a timestamp; from two samples we get a velocity.
 * Every render frame the sponge is moved toward a *predicted* target (last sample plus
 * velocity times the sample's age, capped) with a short exponential lerp, so it glides at
 * 60 fps and leads the stale sample instead of teleporting once per tracker frame.
 *
 * Coordinates are normalized 0..1 in whatever space the caller draws in.
 */

export interface SpongeCursor {
  key: string;
  x: number;
  y: number;
  /** Radians, tilt toward the direction of travel. */
  angle: number;
  moving: boolean;
}

interface Track {
  key: string;
  /** Latest sample. */
  x: number;
  y: number;
  t: number;
  /** Velocity in normalized units per second, from the last two samples. */
  vx: number;
  vy: number;
  /** Where the sponge is drawn right now. */
  dx: number;
  dy: number;
  /** Drawn position on the previous update, for the drawn velocity. */
  px: number;
  py: number;
  angle: number;
  moving: boolean;
  lastSeen: number;
  /** Direct cursors (mouse, practice) skip prediction. */
  direct: boolean;
}

export interface SpongeTrackerOptions {
  /** Samples further apart than this do not yield a velocity, ms. */
  maxSampleGapMs?: number;
  /** Never extrapolate further ahead than this, ms. */
  maxLeadMs?: number;
  /** Fraction of the measured lead to apply; <1 damps overshoot on reversals. */
  leadGain?: number;
  /** Lerp time constant toward the target, ms. */
  followMs?: number;
  /** Drop a hand not seen for this long, ms. */
  holdMs?: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class SpongeTracker {
  private tracks = new Map<string, Track>();
  private lastUpdateAt = Number.NaN;
  private readonly maxSampleGapMs: number;
  private readonly maxLeadMs: number;
  private readonly leadGain: number;
  private readonly followMs: number;
  private readonly holdMs: number;

  constructor(options: SpongeTrackerOptions = {}) {
    this.maxSampleGapMs = options.maxSampleGapMs ?? 800;
    this.maxLeadMs = options.maxLeadMs ?? 300;
    this.leadGain = options.leadGain ?? 0.8;
    this.followMs = options.followMs ?? 70;
    this.holdMs = options.holdMs ?? 700;
  }

  /** A tracker sample for one hand. `at` is the capture time on the same clock as `update(now)`. */
  observe(key: string, x: number, y: number, at: number, now: number): void {
    const track = this.tracks.get(key);
    if (!track) {
      this.tracks.set(key, { key, x, y, t: at, vx: 0, vy: 0, dx: x, dy: y, px: x, py: y, angle: -0.35, moving: false, lastSeen: now, direct: false });
      return;
    }
    if (at <= track.t) { track.lastSeen = now; return; }
    const dt = (at - track.t) / 1000;
    if (dt * 1000 <= this.maxSampleGapMs) {
      track.vx = (x - track.x) / dt;
      track.vy = (y - track.y) / dt;
    } else {
      track.vx = 0; track.vy = 0;
      track.dx = x; track.dy = y; // long gap: snap instead of gliding across the frame
    }
    track.x = x; track.y = y; track.t = at;
    track.lastSeen = now;
    track.direct = false;
  }

  /** Put a cursor exactly here (mouse, practice hand). */
  place(key: string, x: number, y: number, now: number): void {
    const track = this.tracks.get(key);
    if (!track) {
      this.tracks.set(key, { key, x, y, t: now, vx: 0, vy: 0, dx: x, dy: y, px: x, py: y, angle: -0.35, moving: false, lastSeen: now, direct: true });
      return;
    }
    track.x = x; track.y = y; track.t = now; track.lastSeen = now; track.direct = true;
  }

  /** Advance every cursor toward its (predicted) target. Call once per render frame. */
  update(now: number): SpongeCursor[] {
    const dtMs = Number.isFinite(this.lastUpdateAt) ? Math.min(100, Math.max(0, now - this.lastUpdateAt)) : 16;
    this.lastUpdateAt = now;
    const k = 1 - Math.exp(-dtMs / this.followMs);
    const out: SpongeCursor[] = [];
    for (const [key, track] of this.tracks) {
      if (now - track.lastSeen > this.holdMs) { this.tracks.delete(key); continue; }
      let tx = track.x, ty = track.y;
      if (!track.direct) {
        const lead = Math.min(this.maxLeadMs, Math.max(0, now - track.t)) / 1000 * this.leadGain;
        tx = clamp01(track.x + track.vx * lead);
        ty = clamp01(track.y + track.vy * lead);
      }
      track.px = track.dx; track.py = track.dy;
      track.dx += (tx - track.dx) * (track.direct ? 1 : k);
      track.dy += (ty - track.dy) * (track.direct ? 1 : k);
      const dt = dtMs / 1000;
      const speed = dt > 0 ? Math.hypot(track.dx - track.px, track.dy - track.py) / dt : 0;
      track.moving = speed > 0.08;
      const targetAngle = track.moving ? Math.max(-0.7, Math.min(0.7, Math.atan2(track.dy - track.py, track.dx - track.px) * 0.35)) : -0.35;
      track.angle += (targetAngle - track.angle) * 0.25;
      out.push({ key, x: track.dx, y: track.dy, angle: track.angle, moving: track.moving });
    }
    return out;
  }

  clear(): void {
    this.tracks.clear();
  }
}
