import type { Landmark } from "./types";
import type { DetectedHand } from "./placement";
export type WorkerInput =
  | { type: "init"; assetBase: string; trackHands?: boolean }
  | { type: "frame"; image: ImageBitmap; capturedAtMs: number };
export type WorkerOutput =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "result"; landmarks: Landmark[]; hands: DetectedHand[]; capturedAtMs: number; inferenceMs: number };
