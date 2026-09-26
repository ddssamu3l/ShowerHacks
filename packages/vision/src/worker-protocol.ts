import type { Landmark } from "./types";
export type WorkerInput =
  | { type: "init"; assetBase: string }
  | { type: "frame"; image: ImageBitmap; capturedAtMs: number };
export type WorkerOutput =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "result"; landmarks: Landmark[]; capturedAtMs: number; inferenceMs: number };
