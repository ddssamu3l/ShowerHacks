import type { VisionController, VisionStatus, VisionSample } from "./vision";

export type HandSide = "left" | "right";
export type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";
export type BodyPart = "hair" | "face" | "chest" | "left-shoulder" | "right-shoulder" | "left-arm" | "right-arm" | "left-pit" | "right-pit";
export interface Point2 { x: number; y: number }
export interface PointMotion {
  /** Camera-normalized units/second. Null on first sighting, gaps, or source changes. */
  velocity: Point2;
  /** Image-height units/second, corrected for the frame aspect ratio. */
  speed: number;
}
export interface TrackingPoint extends Point2 {
  /** Model-relative depth, not meters; do not compare pose z with hand z. */
  z?: number;
  /** Pose visibility only. Hand models do not provide per-joint visibility. */
  visibility?: number;
  motion: PointMotion | null;
}
export const POSE_JOINTS = [
  "nose", "leftEyeInner", "leftEye", "leftEyeOuter", "rightEyeInner", "rightEye", "rightEyeOuter", "leftEar", "rightEar", "mouthLeft", "mouthRight",
  "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist", "leftPinky", "rightPinky", "leftIndex", "rightIndex", "leftThumb", "rightThumb",
  "leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle", "leftHeel", "rightHeel", "leftFootIndex", "rightFootIndex",
] as const;
export type PoseJoint = typeof POSE_JOINTS[number];
export const HAND_JOINTS = [
  "wrist", "thumbCmc", "thumbMcp", "thumbIp", "thumbTip", "indexMcp", "indexPip", "indexDip", "indexTip",
  "middleMcp", "middlePip", "middleDip", "middleTip", "ringMcp", "ringPip", "ringDip", "ringTip", "pinkyMcp", "pinkyPip", "pinkyDip", "pinkyTip",
] as const;
export type HandJoint = typeof HAND_JOINTS[number];
export interface BodyRegion { part: BodyPart; center: Point2; outline: Point2[] }
export interface TrackedHand {
  side: HandSide; tracked: boolean; source: "hand" | "pose" | "none";
  /** Heuristic availability/visibility, not a calibrated contact probability. */
  confidence: number;
  palm: TrackingPoint | null;
  wrist: TrackingPoint | null;
  /** 2D overlap only; null outside regions or when the body is missing. */
  bodyPart: BodyPart | null;
  /** Always 21 slots; null when unavailable. Never synthesize fingers from pose. */
  landmarks: (TrackingPoint | null)[];
  joints: Record<HandJoint, TrackingPoint | null>;
  fingers: Record<FingerName, { joints: (TrackingPoint | null)[]; tip: TrackingPoint | null }>;
}
export interface TrackingFrame {
  schemaVersion: 1;
  /** Browser performance.now() at capture, shared with game timers. */
  capturedAtMs: number;
  width: number; height: number;
  /** Unmirrored camera coordinates: x right, y down, 0..1 in the image. UI mirrors x as 1-x. */
  coordinateSpace: "camera-normalized";
  inputMode: "camera" | "mock";
  body: {
    tracked: boolean; confidence: number;
    /** Always 33 slots in POSE_JOINTS order; null means missing/unreliable. */
    landmarks: (TrackingPoint | null)[];
    joints: Record<PoseJoint, TrackingPoint | null>;
    regions: BodyRegion[];
  };
  /** Anatomical left/right, independent of mirroring and screen position. */
  hands: Record<HandSide, TrackedHand>;
  inferenceMs?: number;
}
export interface TrackingOptions {
  video: HTMLVideoElement;
  overlay?: HTMLCanvasElement;
  onFrame: (frame: TrackingFrame) => void;
  onStatus: (status: VisionStatus) => void;
  now?: () => number;
  assetBase?: string;
  /** Results older than this on arrival count as no detection. Default 250 ms; raise for slow CPU inference. */
  maxFrameAgeMs?: number;
}
export type TrackingController = VisionController;
export type TrackingFactory = (options: TrackingOptions) => TrackingController;

export interface ActivityContext {
  targetId: string | null;
  windowStartedAtMs: number;
  windowEndsAtMs: number;
}
/** Every activity uses the same scoring envelope; points belong to the game, not tracking. */
export interface ActivitySample extends VisionSample {
  schemaVersion: 1;
  activityId: string;
  targetId: string | null;
  feedback?: { label: string; level: "idle" | "active" | "warning" };
  metrics?: Record<string, number>;
}
export interface ActivityAdapter {
  readonly id: string;
  reset(): void;
  evaluate(frame: TrackingFrame, context: ActivityContext): ActivitySample;
}
export interface ActivityWindowConfig {
  activityId: string; targetId: string | null;
  startAtMs: number; endAtMs: number;
  maxPoints?: number; // Default 1000. Independent of window duration and frame rate.
}
export interface ActivityWindowScore {
  averageEfficiency: number;
  basePoints: number;
  trackingCoverage: number;
  activeCoverage: number;
  liveEfficiency: number;
}
