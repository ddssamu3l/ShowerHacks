import type { Landmark } from "./types";

export const PLACEMENT_ZONES = ["hair", "face", "chest", "left-shoulder", "right-shoulder", "left-arm", "right-arm", "left-pit", "right-pit"] as const;
export type PlacementZone = typeof PLACEMENT_ZONES[number];
export type HandSide = "left" | "right";
export const PLACEMENT_LABELS: Record<PlacementZone, string> = {
  hair: "Hair", face: "Face", chest: "Chest", "left-shoulder": "Left shoulder", "right-shoulder": "Right shoulder",
  "left-arm": "Left upper arm", "right-arm": "Right upper arm", "left-pit": "Left armpit", "right-pit": "Right armpit",
};
export interface Point2 { x: number; y: number }
export interface DetectedHand {
  landmarks: Landmark[];
  handedness: HandSide;
  handednessScore: number;
}
export interface HandPlacement {
  side: HandSide;
  visible: boolean;
  point: Point2 | null;
  zone: PlacementZone | null;
  source: "hand" | "pose" | "none";
  confidence: number;
  landmarks: Landmark[];
}
export interface PlacementRegion {
  zone: PlacementZone;
  outline: Point2[];
  center: Point2;
}
export interface PlacementFrame {
  capturedAtMs: number;
  tracking: boolean;
  landmarks: Landmark[];
  hands: HandPlacement[];
  regions: PlacementRegion[];
  inferenceMs?: number;
}
type BodyPoint = Point2 & { confidence: number };
type Region = PlacementRegion & { distance: (point: Point2) => number; allowedHand?: HandSide };
const sides: HandSide[] = ["left", "right"];
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const valid = (point: Point2 | undefined): point is Point2 => !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
const length = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y);

export class PlacementDetector {
  private previous = new Map<HandSide, HandPlacement>();
  private lastAt = -Infinity;
  reset() { this.previous.clear(); this.lastAt = -Infinity; }

  process(pose: Landmark[], detections: DetectedHand[], at: number, width: number, height: number): PlacementFrame {
    const empty = (side: HandSide): HandPlacement => ({ side, visible: false, point: null, zone: null, source: "none", confidence: 0, landmarks: [] });
    const frame: PlacementFrame = { capturedAtMs: at, tracking: false, landmarks: pose, hands: sides.map(empty), regions: [] };
    if (!Number.isFinite(at) || at <= this.lastAt || width <= 0 || height <= 0) return frame;
    if (at - this.lastAt > 350) this.previous.clear();
    const elapsed = at - this.lastAt;
    this.lastAt = at;
    const aspect = width / height;
    const metric = (p: Point2) => ({ x: p.x * aspect, y: p.y });
    const posePoint = (id: number, threshold = .35): Landmark | null => {
      const p = pose[id];
      return valid(p) && Number.isFinite(p.visibility) && (p.visibility ?? 0) >= threshold ? p : null;
    };
    const ls = posePoint(11), rs = posePoint(12);
    const scale = ls && rs ? length(metric(ls), metric(rs)) : .3;
    const bodyReady = !!ls && !!rs && scale > .07;
    frame.tracking = bodyReady;
    const origin = ls && rs ? { x: (ls.x + rs.x) * aspect / 2, y: (ls.y + rs.y) / 2 } : { x: 0, y: 0 };
    const axis = ls && rs ? { x: (rs.x - ls.x) * aspect / scale, y: (rs.y - ls.y) / scale } : { x: 1, y: 0 };
    const sign = axis.x >= 0 ? 1 : -1;
    const down = { x: -axis.y * sign, y: axis.x * sign };
    const toBody = (p: Point2): Point2 => {
      const x = p.x * aspect - origin.x, y = p.y - origin.y;
      return { x: (x * axis.x + y * axis.y) / scale, y: (x * down.x + y * down.y) / scale };
    };
    const fromBody = (p: Point2): Point2 => ({ x: (origin.x + scale * (axis.x * p.x + down.x * p.y)) / aspect, y: origin.y + scale * (axis.y * p.x + down.y * p.y) });
    const body = (id: number): BodyPoint | null => { const p = posePoint(id); return p ? { ...toBody(p), confidence: p.visibility! } : null; };
    const regions: Region[] = [];
    const ellipse = (zone: PlacementZone, center: Point2, rx: number, ry: number) => {
      regions.push({ zone, center: fromBody(center), outline: Array.from({ length: 48 }, (_, i) => fromBody({ x: center.x + rx * Math.cos(i * Math.PI / 24), y: center.y + ry * Math.sin(i * Math.PI / 24) })), distance: p => Math.hypot((p.x - center.x) / rx, (p.y - center.y) / ry) });
    };
    if (bodyReady) {
      // Include palms resting along the ribs and sides of the torso.
      ellipse("chest", { x: 0, y: .65 }, .68, .68);
      const nose = body(0);
      if (nose) {
        ellipse("face", nose, .30, .28);
        // Cover the sides of the head down to ear level, not just the crown.
        ellipse("hair", { x: nose.x, y: nose.y - .22 }, .58, .52);
      }
      for (const side of sides) {
        const shoulder = body(side === "left" ? 11 : 12)!;
        const elbow = body(side === "left" ? 13 : 14);
        ellipse(`${side}-shoulder`, shoulder, .27, .24);
        if (!elbow) continue;
        const dx = elbow.x - shoulder.x, dy = elbow.y - shoulder.y;
        const start = { x: shoulder.x + dx * .28, y: shoulder.y + dy * .28 };
        const theta = Math.atan2(dy, dx), radius = .23;
        const outline = [
          ...Array.from({ length: 17 }, (_, i) => { const a = theta - Math.PI / 2 + i * Math.PI / 16; return fromBody({ x: elbow.x + radius * Math.cos(a), y: elbow.y + radius * Math.sin(a) }); }),
          ...Array.from({ length: 17 }, (_, i) => { const a = theta + Math.PI / 2 + i * Math.PI / 16; return fromBody({ x: start.x + radius * Math.cos(a), y: start.y + radius * Math.sin(a) }); }),
        ];
        regions.push({ zone: `${side}-arm`, allowedHand: side === "left" ? "right" : "left", center: fromBody({ x: (start.x + elbow.x) / 2, y: (start.y + elbow.y) / 2 }), outline, distance: p => {
          const vx = elbow.x - start.x, vy = elbow.y - start.y;
          const t = clamp(((p.x - start.x) * vx + (p.y - start.y) * vy) / Math.max(vx * vx + vy * vy, .001), 0, 1);
          return length(p, { x: start.x + vx * t, y: start.y + vy * t }) / radius;
        } });
        if (elbow.y < shoulder.y + .12) ellipse(`${side}-pit`, { x: shoulder.x * .76, y: shoulder.y + .22 }, .23, .23);
      }
    }
    frame.regions = regions.map(({ zone, outline, center }) => ({ zone, outline, center }));

    // Match hands to anatomical pose wrists, never to screen-left / screen-right.
    // Global assignment preserves two distinct hands even when their palms overlap.
    const hands = detections.filter(hand => [0, 5, 9, 13, 17].every(i => valid(hand.landmarks[i]))).slice(0, 2);
    const assignment = new Map<HandSide, DetectedHand>();
    const cost = (hand: DetectedHand, side: HandSide) => {
      const wrist = posePoint(side === "left" ? 15 : 16);
      if (wrist) return length(metric(hand.landmarks[0]), metric(wrist)) / Math.max(scale, .1) + (hand.handedness === side ? 0 : .03);
      const prior = this.previous.get(side)?.point;
      const palm = hand.landmarks[9];
      return (hand.handedness === side ? 0 : .6) + (prior ? length(metric(palm), metric(prior)) / Math.max(scale, .1) * .3 : 0);
    };
    if (hands.length === 2) {
      const direct = cost(hands[0], "left") + cost(hands[1], "right");
      const crossed = cost(hands[0], "right") + cost(hands[1], "left");
      assignment.set("left", hands[direct <= crossed ? 0 : 1]);
      assignment.set("right", hands[direct <= crossed ? 1 : 0]);
    } else if (hands.length === 1) assignment.set(cost(hands[0], "left") <= cost(hands[0], "right") ? "left" : "right", hands[0]);

    frame.hands = sides.map(side => {
      const hand = assignment.get(side);
      const wristId = side === "left" ? 15 : 16;
      const wrist = posePoint(wristId, .5);
      const finger = posePoint(side === "left" ? 19 : 20, .5);
      let point: Point2 | null = null;
      let confidence = 0;
      if (hand) {
        const palm = [0, 5, 9, 13, 17].map(i => hand.landmarks[i]);
        point = { x: palm.reduce((n, p) => n + p.x, 0) / palm.length, y: palm.reduce((n, p) => n + p.y, 0) / palm.length };
        confidence = .95; // Successful hand detection; handedness probability is NOT visibility confidence.
      } else if (wrist) {
        point = finger ? { x: wrist.x * .35 + finger.x * .65, y: wrist.y * .35 + finger.y * .65 } : { x: wrist.x, y: wrist.y };
        confidence = wrist.visibility!;
      }
      if (!point) { this.previous.delete(side); return empty(side); }
      const prior = this.previous.get(side);
      if (prior?.point && length(metric(prior.point), metric(point)) < scale * .6) {
        const alpha = 1 - Math.exp(-elapsed / 35);
        point = { x: prior.point.x + alpha * (point.x - prior.point.x), y: prior.point.y + alpha * (point.y - prior.point.y) };
      }
      const p = toBody(point);
      const candidates = bodyReady ? regions.filter(r => (!r.allowedHand || r.allowedHand === side) && r.distance(p) <= (r.zone === prior?.zone ? 1.1 : 1)) : [];
      candidates.sort((a, b) => {
        const score = (r: Region) => r.distance(p) - (r.zone === prior?.zone ? .08 : 0) - (r.zone.includes("shoulder") ? .12 : 0);
        return score(a) - score(b);
      });
      const placement: HandPlacement = { side, visible: true, point, zone: candidates[0]?.zone ?? null, source: hand ? "hand" : "pose", confidence, landmarks: hand?.landmarks ?? [] };
      this.previous.set(side, placement);
      return placement;
    });
    return frame;
  }
}
