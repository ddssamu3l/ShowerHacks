export type { VisionController, VisionFactory, VisionOptions, VisionSample, VisionStatus } from "@vibecodemaxxing/contracts";

export { createVision } from "./controller";
export { createMockVision } from "./mock";
export { ScrubDetector } from "./detector";
export { ZONE_LABELS, ZONES } from "./types";
export type { ArcadeVisionOptions, VisionFrame, WashEvent, WashZone, Landmark } from "./types";
export { PlacementDetector, PLACEMENT_ZONES, PLACEMENT_LABELS } from "./placement";
export type { PlacementFrame, HandPlacement, PlacementZone, HandSide, DetectedHand } from "./placement";
export { createTracking, createMockTracking, TrackingFrameBuilder, drawTrackingOverlay } from "./tracking";
export type { TrackingFrame, TrackingPoint, TrackedHand, TrackingOptions, TrackingController, TrackingFactory, ActivityAdapter, ActivityContext, ActivitySample, ActivityWindowConfig, ActivityWindowScore } from "@vibecodemaxxing/contracts";
export { HAND_JOINTS, POSE_JOINTS } from "@vibecodemaxxing/contracts";
export { PlacementScrubDetector } from "./scrub-motion";
export type { ScrubMotionFrame, ScrubHandMotion, ScrubTarget } from "./scrub-motion";
export { createScrubActivity } from "./scrub-activity";
export { ActivityScoreWindow, ACTIVITY_SAMPLE_TTL_MS } from "./activity-score";
export { ScrubChallenge, CHALLENGE_TARGETS, TARGET_LABELS, TARGET_HINTS, DEFAULT_ROUND_MS, COMBO_QUALITY } from "./challenge";
export type { ChallengeSnapshot, ChallengeRound } from "./challenge";
export { challengeDemoPose } from "./challenge-demo";
