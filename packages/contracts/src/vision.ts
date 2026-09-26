/** All times use the same browser performance.now() clock as the engine. */
export interface VisionSample {
  capturedAtMs: number;
  efficiency: number; // 0..1: calibrated scrub speed/quality, NOT points
  confidence: number; // 0..1
  tracking: boolean;
}

export type VisionStatus =
  | { state: "idle" | "initializing" | "ready" | "stopped" }
  | { state: "error"; code: "permission_denied" | "camera_unavailable" | "model_failed"; message: string };

export interface VisionOptions {
  video: HTMLVideoElement;
  overlay?: HTMLCanvasElement;
  onSample: (sample: VisionSample) => void;
  onStatus: (status: VisionStatus) => void;
  now?: () => number; // Defaults to performance.now(); stamp capture, not inference completion.
}

export interface VisionController {
  start(): Promise<void>; // Resolve once camera/model can emit samples; reject on failure.
  stop(): void; // Cancel inference, release owned camera tracks, detach preview; idempotent.
}

export type VisionFactory = (options: VisionOptions) => VisionController;
