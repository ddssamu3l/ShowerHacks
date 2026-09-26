import { HAND_JOINTS, POSE_JOINTS, type FingerName, type HandSide, type TrackingFrame, type TrackingPoint, type TrackingOptions, type TrackedHand } from "@vibecodemaxxing/contracts";
import { createVision } from "./controller";
import { mockPose } from "./mock";
import { PlacementDetector, type PlacementFrame, type DetectedHand } from "./placement";
import { drawPlacementOverlay } from "./placement-overlay";
import type { Landmark } from "./types";

const fingers: Record<FingerName, number[]> = { thumb: [1,2,3,4], index: [5,6,7,8], middle: [9,10,11,12], ring: [13,14,15,16], pinky: [17,18,19,20] };
const valid = (p?: Landmark | null): p is Landmark => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/** Pure adapter for live model output, recorded landmarks, and deterministic activity demos. */
export class TrackingFrameBuilder {
  private placement = new PlacementDetector();
  private previous = new Map<string, { point: Landmark; at: number; source: string }>();
  private dimensions = "";
  private lastAt = -Infinity;
  reset() { this.previous.clear(); this.placement.reset(); this.dimensions = ""; this.lastAt = -Infinity; }
  process(pose: Landmark[], hands: DetectedHand[], at: number, width: number, height: number, inputMode: "camera" | "mock" = "camera") {
    return this.fromPlacement(this.placement.process(pose, hands, at, width, height), width, height, inputMode);
  }
  fromPlacement(frame: PlacementFrame, width: number, height: number, inputMode: "camera" | "mock" = "camera"): TrackingFrame {
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height) && Number.isFinite(frame.capturedAtMs) && frame.capturedAtMs > this.lastAt)) throw new Error("Tracking frames need valid dimensions and strictly increasing finite timestamps.");
    this.lastAt = frame.capturedAtMs;
    const dimensions = `${width}:${height}:${inputMode}`;
    if (this.dimensions !== dimensions) { this.previous.clear(); this.dimensions = dimensions; }
    const aspect = width / height, at = frame.capturedAtMs;
    const seen = new Set<string>();
    const point = (key: string, raw: Landmark | null | undefined, source: string, pose = false): TrackingPoint | null => {
      if (!valid(raw) || (pose && (!Number.isFinite(raw.visibility) || (raw.visibility ?? 0) < .35))) return null;
      seen.add(key);
      const prior = this.previous.get(key), dt = prior ? (at - prior.at) / 1000 : 0;
      let motion: TrackingPoint["motion"] = null;
      if (prior && prior.source === source && dt > 0 && dt <= .25) {
        const velocity = { x: (raw.x - prior.point.x) / dt, y: (raw.y - prior.point.y) / dt };
        motion = { velocity, speed: Math.hypot(velocity.x * aspect, velocity.y) };
      }
      this.previous.set(key, { point: { ...raw }, at, source });
      return { x: raw.x, y: raw.y, ...(Number.isFinite(raw.z) ? { z: raw.z } : {}), ...(Number.isFinite(raw.visibility) ? { visibility: raw.visibility } : {}), motion };
    };
    const landmarks = POSE_JOINTS.map((name, i) => point(`pose:${name}`, frame.landmarks[i], "pose", true));
    const hands = Object.fromEntries((["left", "right"] as HandSide[]).map(side => {
      const hand = frame.hands.find(item => item.side === side);
      const source = hand?.visible ? hand.source : "none";
      const points = HAND_JOINTS.map((name, i) => point(`${side}:${name}`, source === "hand" ? hand?.landmarks[i] : null, source));
      const wrist = points[0] ?? (source === "pose" ? landmarks[side === "left" ? 15 : 16] : null);
      const palm = point(`${side}:palm`, source !== "none" ? hand?.point : null, source);
      const value: TrackedHand = {
        side, source, tracked: !!palm, confidence: palm ? hand!.confidence : 0,
        palm, wrist, bodyPart: palm ? hand!.zone : null, landmarks: points,
        joints: Object.fromEntries(HAND_JOINTS.map((name, i) => [name, points[i]])) as TrackedHand["joints"],
        fingers: Object.fromEntries(Object.entries(fingers).map(([name, ids]) => [name, { joints: ids.map(i => points[i]), tip: points[ids[3]] }])) as TrackedHand["fingers"],
      };
      return [side, value];
    })) as TrackingFrame["hands"];
    for (const key of this.previous.keys()) if (!seen.has(key)) this.previous.delete(key);
    return {
      schemaVersion: 1, capturedAtMs: at, width, height, coordinateSpace: "camera-normalized", inputMode,
      body: { tracked: frame.tracking, confidence: frame.tracking ? Math.min(landmarks[11]?.visibility ?? 0, landmarks[12]?.visibility ?? 0) : 0,
        landmarks, joints: Object.fromEntries(POSE_JOINTS.map((name, i) => [name, landmarks[i]])) as TrackingFrame["body"]["joints"],
        regions: frame.regions.map(region => ({ part: region.zone, center: { ...region.center }, outline: region.outline.map(p => ({ ...p })) })),
      }, hands, ...(frame.inferenceMs === undefined ? {} : { inferenceMs: frame.inferenceMs }),
    };
  }
}

export function createTracking(options: TrackingOptions) {
  const builder = new TrackingFrameBuilder();
  return createVision({
    ...options, mode: "placement", onSample: () => {},
    onPlacement: frame => options.onFrame(builder.fromPlacement(frame, options.video.videoWidth, options.video.videoHeight)),
    onFrame: undefined,
  });
}
export function createMockTracking(options: TrackingOptions) {
  const builder = new TrackingFrameBuilder(), now = options.now ?? (() => performance.now());
  let stopped = false, timer: ReturnType<typeof setInterval> | undefined;
  return {
    async start() {
      if (stopped) throw new Error("Create a new tracker to restart.");
      if (timer) return;
      const started = now(); options.onStatus({ state: "ready" });
      timer = setInterval(() => {
        if (stopped) return;
        const at = now(), elapsed = at - started;
        const pose = mockPose("chest", elapsed);
        pose[16] = { x: .38 + Math.sin(elapsed / 550) * .08, y: .29, visibility: .99 };
        const hand = (side: HandSide, wrist: Landmark): DetectedHand => ({
          handedness: side, handednessScore: 1,
          landmarks: [[0,0],[-.02,-.015],[-.035,-.03],[-.045,-.045],[-.055,-.06],[-.025,-.045],[-.027,-.075],[-.028,-.095],[-.029,-.115],[0,-.05],[0,-.085],[0,-.11],[0,-.135],[.02,-.045],[.023,-.08],[.025,-.10],[.027,-.12],[.038,-.035],[.043,-.06],[.048,-.077],[.052,-.095]].map(([x,y]) => ({ x: wrist.x + x * (side === "left" ? 1 : -1), y: wrist.y + y })),
        });
        const frame = builder.process(pose, [hand("left", pose[15]), hand("right", pose[16])], at, 960, 720, "mock");
        if (options.overlay) drawTrackingOverlay(options.overlay, frame);
        options.onFrame(frame);
      }, 50);
    },
    stop() {
      if (stopped) return;
      stopped = true; clearInterval(timer); builder.reset();
      options.overlay?.getContext("2d")?.clearRect(0, 0, options.overlay.width, options.overlay.height);
      options.onStatus({ state: "stopped" });
    },
  };
}

/** Optional shared overlay. Activities can render their own effects using the same coordinates. */
export function drawTrackingOverlay(canvas: HTMLCanvasElement, frame: TrackingFrame, target?: import("@vibecodemaxxing/contracts").BodyPart | null) {
  const missing = { x: 0, y: 0, visibility: 0 };
  drawPlacementOverlay(canvas, {
    capturedAtMs: frame.capturedAtMs, tracking: frame.body.tracked,
    landmarks: frame.body.landmarks.map(p => p ?? missing),
    regions: frame.body.regions.map(region => ({ zone: region.part, center: region.center, outline: region.outline })),
    hands: Object.values(frame.hands).map(hand => ({ side: hand.side, visible: hand.tracked, point: hand.palm, zone: hand.bodyPart, source: hand.source, confidence: hand.confidence, landmarks: hand.source === "hand" ? hand.landmarks.map(p => p ?? missing) : [] })),
  }, frame.width, frame.height, target);
}
