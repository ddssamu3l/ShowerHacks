import type { HandSide, TrackingFrame, BodyPart, Point2 } from "@vibecodemaxxing/contracts";

export type ScrubTarget = Exclude<BodyPart, "face">;
export interface ScrubHandMotion {
  side: HandSide;
  zone: ScrubTarget | null;
  confidence: number;
  speed: number;
  intensity: number;
  scrubbing: boolean;
}
export interface ScrubMotionFrame {
  capturedAtMs: number;
  tracking: boolean;
  hands: ScrubHandMotion[];
}
type Observation = Point2 & { at: number };
type History = { zone: ScrubTarget; source: string; points: Observation[]; lastMovementAt: number };
const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Adds motion to the proven placement regions without running a second region classifier. */
export class PlacementScrubDetector {
  private histories = new Map<HandSide, History>();
  private lastAt = -Infinity;
  reset() { this.histories.clear(); this.lastAt = -Infinity; }

  process(frame: TrackingFrame): ScrubMotionFrame {
    const { width, height } = frame;
    const at = frame.capturedAtMs;
    const result: ScrubMotionFrame = { capturedAtMs: at, tracking: false, hands: [] };
    if (!Number.isFinite(at) || at <= this.lastAt) return result;
    if (at - this.lastAt > 250) this.histories.clear();
    this.lastAt = at;
    const left = frame.body.joints.leftShoulder, right = frame.body.joints.rightShoulder;
    if (!frame.body.tracked || !left || !right || width <= 0 || height <= 0) { this.histories.clear(); return result; }
    const aspect = width / height;
    const dx = (right.x - left.x) * aspect, dy = right.y - left.y;
    const scale = Math.hypot(dx, dy);
    if (!Number.isFinite(scale) || scale < .07) { this.histories.clear(); return result; }
    const axis = { x: dx / scale, y: dy / scale };
    const sign = axis.x >= 0 ? 1 : -1;
    const down = { x: -axis.y * sign, y: axis.x * sign };
    result.tracking = true;
    for (const side of ["left", "right"] as const) {
      const hand = frame.hands[side];
      const zone = hand.bodyPart === "face" ? "hair" : hand.bodyPart;
      const anchor = frame.body.regions.find(region => region.part === zone)?.center;
      const confidence = Math.min(hand?.confidence ?? 0, left.visibility ?? 0, right.visibility ?? 0);
      const motion: ScrubHandMotion = { side, zone: zone ?? null, confidence, speed: 0, intensity: 0, scrubbing: false };
      result.hands.push(motion);
      if (!hand.tracked || !hand.palm || !zone || !anchor || confidence < .5) { this.histories.delete(side); continue; }
      // Measure relative to the body part, so moving your body/head with a resting hand is not a scrub.
      const x = (hand.palm.x - anchor.x) * aspect, y = hand.palm.y - anchor.y;
      const point = { x: (x * axis.x + y * axis.y) / scale, y: (x * down.x + y * down.y) / scale, at };
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) { this.histories.delete(side); continue; }
      let history = this.histories.get(side);
      if (!history || history.zone !== zone || history.source !== hand.source) {
        history = { zone, source: hand.source, points: [], lastMovementAt: -Infinity };
        this.histories.set(side, history);
      }
      const previous = history.points.at(-1);
      const dt = previous ? (at - previous.at) / 1000 : 0;
      const instantSpeed = previous && dt > 0 ? distance(previous, point) / dt : 0;
      if (instantSpeed > 8) { this.histories.delete(side); continue; }
      if (instantSpeed > .14) history.lastMovementAt = at;
      history.points.push(point);
      history.points = history.points.filter(p => at - p.at <= 650);
      const points = history.points, first = points[0];
      const span = (at - first.at) / 1000;
      let path = 0, extent = 0;
      for (let i = 1; i < points.length; i++) {
        path += distance(points[i - 1], points[i]);
        extent = Math.max(extent, distance(first, points[i]));
      }
      const repeatedTravel = Math.max(0, path - distance(first, point));
      motion.speed = span > 0 ? path / span : 0;
      motion.scrubbing = span >= .25 && extent >= .05 && repeatedTravel >= .09 && motion.speed >= .25 && at - history.lastMovementAt <= 120;
      motion.intensity = motion.scrubbing ? Math.min(1, motion.speed / 1.5) : 0;
    }
    return result;
  }
}
