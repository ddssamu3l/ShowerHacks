import type { Landmark, VisionFrame, WashEvent, WashZone, ZoneMarker } from "./types";

type Point = { x: number; y: number; confidence: number };
type Candidate = { zone: WashZone; hand: number; point: Point; confidence: number; distance: number; activity: number };
type Observation = { at: number; point: Point };
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Pure, camera-independent detector. Coordinates are stabilized in a shoulder-relative frame. */
export class ScrubDetector {
  private zone: WashZone | null = null;
  private hand = -1;
  private observations: Observation[] = [];
  private lastAt = -Infinity;
  private lastHitAt = -Infinity;
  private lastMovementAt = -Infinity;
  private progress = 0;
  private handMotion = new Map<number, { point: Point; at: number; speed: number }>();

  constructor(private sensitivity = 1) {}

  reset() {
    this.zone = null;
    this.hand = -1;
    this.observations = [];
    this.lastAt = -Infinity;
    this.lastMovementAt = -Infinity;
    this.lastHitAt = -Infinity;
    this.progress = 0;
    this.handMotion.clear();
  }

  process(landmarks: Landmark[], at: number, width: number, height: number): { frame: VisionFrame; wash?: WashEvent } {
    const frame: VisionFrame = {
      capturedAtMs: at, landmarks, markers: [], zone: null, tracking: false,
      confidence: 0, speed: 0, intensity: 0, progress: 0, scrubbing: false,
    };
    if (!Number.isFinite(at) || at <= this.lastAt || width <= 0 || height <= 0) return { frame };
    if (at - this.lastAt > 300) this.reset();
    const dt = clamp((at - this.lastAt) / 1000, 0, 0.15);
    this.lastAt = at;
    const aspect = width / height;
    const raw = (i: number): Point | null => {
      const p = landmarks[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.visibility) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || (p.visibility ?? 0) < 0.45) return null;
      return { x: p.x * aspect, y: p.y, confidence: p.visibility ?? 0 };
    };
    const left = raw(11), right = raw(12);
    if (!left || !right) { this.clearMotion(); this.handMotion.clear(); return { frame }; }
    const scale = distance(left, right);
    if (scale < 0.07) { this.clearMotion(); return { frame }; }
    const origin = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    const axis = { x: (right.x - left.x) / scale, y: (right.y - left.y) / scale };
    const sign = axis.x >= 0 ? 1 : -1;
    const down = { x: -axis.y * sign, y: axis.x * sign };
    const body = (i: number): Point | null => {
      const p = raw(i);
      if (!p) return null;
      const x = p.x - origin.x, y = p.y - origin.y;
      return { x: (x * axis.x + y * axis.y) / scale, y: (x * down.x + y * down.y) / scale, confidence: p.confidence };
    };
    const marker = (zone: WashZone, x: number, y: number): ZoneMarker => ({
      zone, x: (origin.x + scale * (axis.x * x + down.x * y)) / aspect,
      y: origin.y + scale * (axis.y * x + down.y * y),
    });
    frame.tracking = true;
    frame.confidence = Math.min(left.confidence, right.confidence);
    frame.markers.push(marker("chest", 0, 0.43));
    const nose = body(0);
    const head = nose ? { x: nose.x, y: nose.y - 0.27, confidence: nose.confidence } : null;
    if (head) frame.markers.push(marker("hair", head.x, head.y));
    const candidates: Candidate[] = [];
    for (const hand of [15, 16]) {
      const wrist = body(hand);
      if (!wrist) { this.handMotion.delete(hand); continue; }
      // Wrist remains usable when finger landmarks are occluded against the body.
      const finger = body(hand === 15 ? 19 : 20);
      const p = finger ? { x: wrist.x * 0.7 + finger.x * 0.3, y: wrist.y * 0.7 + finger.y * 0.3, confidence: wrist.confidence } : wrist;
      const prior = this.handMotion.get(hand);
      const elapsed = prior ? (at - prior.at) / 1000 : 0;
      const velocity = prior && elapsed > 0 && elapsed < .3 ? Math.min(5, distance(prior.point, p) / elapsed) : 0;
      const blend = 1 - Math.exp(-Math.max(elapsed, .05) / .2);
      const activity = prior ? prior.speed + blend * (velocity - prior.speed) : 0;
      this.handMotion.set(hand, { point: p, at, speed: activity });
      const add = (zone: WashZone, d: number, confidence: number, bias = 0) => {
        if (d < 1.0) candidates.push({ zone, hand, point: p, confidence: Math.min(frame.confidence, p.confidence, confidence), distance: d + bias, activity });
      };
      if (head) add("hair", Math.hypot((p.x - head.x) / 0.55, (p.y - head.y) / 0.55), head.confidence, -0.12);
      add("chest", Math.hypot(p.x / 0.54, (p.y - 0.43) / 0.43), frame.confidence, 0.13);
      const side = hand === 15 ? "right" : "left";
      const shoulder = body(hand === 15 ? 12 : 11)!;
      const elbow = body(hand === 15 ? 14 : 13);
      if (elbow) {
        const dx = elbow.x - shoulder.x, dy = elbow.y - shoulder.y;
        const t = clamp(((p.x - shoulder.x) * dx + (p.y - shoulder.y) * dy) / Math.max(dx * dx + dy * dy, 0.001), 0.08, 0.95);
        const closest = { x: shoulder.x + dx * t, y: shoulder.y + dy * t, confidence: elbow.confidence };
        add(`${side}-arm`, distance(p, closest) / 0.3, elbow.confidence);
        frame.markers.push(marker(`${side}-arm`, shoulder.x + dx * 0.6, shoulder.y + dy * 0.6));
        if (elbow.y < shoulder.y + 0.08) {
          const pit = { x: shoulder.x * 0.75, y: shoulder.y + 0.15, confidence: elbow.confidence };
          add(`${side}-pit`, distance(p, pit) / 0.34, elbow.confidence, -0.28);
          frame.markers.push(marker(`${side}-pit`, pit.x, pit.y));
        }
      }
    }
    // Hysteresis prevents zone/hand flicker at overlapping boundaries.
    const movingCandidates = candidates.filter(candidate => candidate.activity > .22);
    const eligible = movingCandidates.length ? movingCandidates : candidates;
    eligible.sort((a, b) => (a.distance - (a.zone === this.zone && a.hand === this.hand ? 0.24 : 0)) - (b.distance - (b.zone === this.zone && b.hand === this.hand ? 0.24 : 0)));
    const chosen = eligible[0];
    if (!chosen || chosen.confidence < 0.5) { this.clearMotion(); return { frame }; }
    if (chosen.zone !== this.zone || chosen.hand !== this.hand) {
      this.clearMotion(); this.zone = chosen.zone; this.hand = chosen.hand;
    }
    frame.zone = chosen.zone;
    frame.confidence = chosen.confidence;
    const previous = this.observations.at(-1);
    // Light time-based smoothing, then velocity in body lengths rather than pixels.
    const alpha = previous ? 1 - Math.exp(-Math.max(dt, 0.01) / 0.05) : 1;
    const smoothed = previous ? { ...chosen.point, x: previous.point.x + alpha * (chosen.point.x - previous.point.x), y: previous.point.y + alpha * (chosen.point.y - previous.point.y) } : chosen.point;
    const instantSpeed = previous ? distance(previous.point, smoothed) / Math.max((at - previous.at) / 1000, 0.01) : 0;
    if (instantSpeed > 9) { this.clearMotion(); return { frame }; } // Landmark teleport, not a scrub.
    this.observations.push({ at, point: smoothed });
    this.observations = this.observations.filter(p => at - p.at <= 800);
    let path = 0;
    for (let i = 1; i < this.observations.length; i++) path += distance(this.observations[i - 1].point, this.observations[i].point);
    const first = this.observations[0];
    const span = (at - first.at) / 1000;
    const net = distance(first.point, smoothed);
    const repeatedTravel = Math.max(0, path - net); // Reversals/circles have more path than displacement.
    const speed = span > 0 ? path / span : 0;
    const sensitivity = clamp(this.sensitivity, 0.6, 1.6);
    const moving = instantSpeed > 0.12 / sensitivity;
    if (moving) this.lastMovementAt = at;
    const valid = span >= 0.3 && repeatedTravel > 0.12 / sensitivity && speed > 0.24 / sensitivity && at - this.lastMovementAt < 130;
    frame.speed = speed;
    frame.scrubbing = valid;
    frame.intensity = valid ? clamp(speed / 1.6, 0.15, 1) : 0;
    this.progress = valid ? this.progress + dt / 0.48 : Math.max(0, this.progress - dt * 2.5);
    frame.progress = clamp(this.progress);
    if (this.progress >= 1 && at - this.lastHitAt >= 430) {
      this.progress = 0;
      this.lastHitAt = at;
      return { frame, wash: { zone: chosen.zone, capturedAtMs: at, intensity: frame.intensity, confidence: chosen.confidence } };
    }
    return { frame };
  }

  private clearMotion() {
    this.zone = null; this.hand = -1; this.observations = []; this.progress = 0; this.lastMovementAt = -Infinity;
  }
}
