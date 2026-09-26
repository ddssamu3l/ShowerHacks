import type { VisionController, VisionStatus } from "@vibecodemaxxing/contracts";
import { ScrubDetector } from "./detector";
import { drawOverlay } from "./overlay";
import { PlacementDetector } from "./placement";
import { drawPlacementOverlay } from "./placement-overlay";
import type { ArcadeVisionOptions } from "./types";
import type { WorkerInput, WorkerOutput } from "./worker-protocol";

export function createVision(options: ArcadeVisionOptions): VisionController {
  const now = options.now ?? (() => performance.now());
  const detector = new ScrubDetector(options.sensitivity);
  const placement = new PlacementDetector();
  let stopped = false, running = false, busy = false;
  let stream: MediaStream | undefined, worker: Worker | undefined;
  let raf = 0, lastCapture = -Infinity, lastVideoTime = -1;
  let startPromise: Promise<void> | undefined;
  const abort = new AbortController();
  const assetBase = options.assetBase ?? "/vision-assets";

  const cleanup = () => {
    stopped = true; running = false;
    abort.abort(); cancelAnimationFrame(raf); worker?.terminate();
    stream?.getTracks().forEach(track => track.stop());
    if (options.video.srcObject === stream) { options.video.pause(); options.video.srcObject = null; }
    if (options.overlay) options.overlay.getContext("2d")?.clearRect(0, 0, options.overlay.width, options.overlay.height);
    detector.reset();
    placement.reset();
  };
  const fail = (message: string, code: Extract<VisionStatus, { state: "error" }>["code"] = "model_failed") => {
    if (stopped) return;
    cleanup(); options.onStatus({ state: "error", code, message });
  };
  const cancellable = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Camera startup cancelled.", "AbortError"));
    if (abort.signal.aborted) { onAbort(); return; }
    abort.signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => abort.signal.removeEventListener("abort", onAbort));
  });
  const capture = async () => {
    if (!running || stopped) return;
    raf = requestAnimationFrame(capture);
    const at = now();
    if (busy || at - lastCapture < 50 || options.video.readyState < 2 || options.video.currentTime === lastVideoTime) return;
    busy = true; lastCapture = at; lastVideoTime = options.video.currentTime;
    try {
      const image = await createImageBitmap(options.video);
      if (stopped) { image.close(); return; }
      const message: WorkerInput = { type: "frame", image, capturedAtMs: at };
      worker!.postMessage(message, [image]);
    } catch (error) { fail(error instanceof Error ? error.message : "Unable to read camera frame."); }
  };
  const start = async () => {
    if (stopped) throw new DOMException("Create a new controller to restart.", "AbortError");
    options.onStatus({ state: "initializing" });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access needs localhost or HTTPS in a supported browser.");
      const acquisition = navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" }, audio: false }).then(value => {
        if (stopped) { value.getTracks().forEach(track => track.stop()); throw new DOMException("Stopped", "AbortError"); }
        return value;
      });
      stream = await cancellable(acquisition);
      stream.getVideoTracks().forEach(track => track.addEventListener("ended", () => fail("Camera disconnected. Reconnect it and try again.", "camera_unavailable")));
      options.video.srcObject = stream;
      options.video.muted = true;
      options.video.playsInline = true;
      await cancellable(options.video.play());
      worker = new Worker(`${assetBase}/pose-worker.js?v=2`);
      await cancellable(new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Tracker loading timed out. Run npm run vision:prepare, then retry.")), 60_000);
        const cancelTimeout = () => clearTimeout(timeout);
        abort.signal.addEventListener("abort", cancelTimeout, { once: true });
        const done = () => { clearTimeout(timeout); abort.signal.removeEventListener("abort", cancelTimeout); };
        worker!.onerror = event => { done(); if (!running) reject(new Error(event.message || "Could not load pose tracker.")); else fail("Pose tracker stopped unexpectedly. Try restarting the camera."); };
        worker!.onmessage = ({ data }: MessageEvent<WorkerOutput>) => {
          if (stopped) return;
          if (data.type === "ready") { done(); resolve(); return; }
          if (data.type === "error") { done(); if (!running) reject(new Error(data.message)); else fail(data.message); return; }
          busy = false;
          const fresh = now() - data.capturedAtMs <= 250;
          if (options.mode === "placement") {
            const frame = placement.process(fresh ? data.landmarks : [], fresh ? data.hands : [], data.capturedAtMs, options.video.videoWidth, options.video.videoHeight);
            frame.inferenceMs = data.inferenceMs;
            if (options.overlay) drawPlacementOverlay(options.overlay, frame, options.video.videoWidth, options.video.videoHeight);
            options.onPlacement?.(frame);
            options.onSample({ capturedAtMs: data.capturedAtMs, efficiency: 0, confidence: frame.tracking ? Math.min(data.landmarks[11]?.visibility ?? 0, data.landmarks[12]?.visibility ?? 0) : 0, tracking: frame.tracking });
            return;
          }
          const { frame, wash } = detector.process(fresh ? data.landmarks : [], data.capturedAtMs, options.video.videoWidth, options.video.videoHeight);
          frame.inferenceMs = data.inferenceMs;
          if (options.overlay) drawOverlay(options.overlay, frame, options.video.videoWidth, options.video.videoHeight);
          options.onSample({ capturedAtMs: data.capturedAtMs, efficiency: frame.intensity, confidence: frame.confidence, tracking: frame.tracking });
          options.onFrame?.(frame);
          if (wash) options.onWash?.(wash);
        };
        const message: WorkerInput = { type: "init", assetBase: new URL(assetBase, location.href).href.replace(/\/$/, ""), trackHands: options.mode === "placement" };
        worker!.postMessage(message);
      }));
      if (stopped) return;
      running = true;
      options.onStatus({ state: "ready" });
      raf = requestAnimationFrame(capture);
    } catch (error) {
      if (!stopped) {
        const name = error instanceof Error ? error.name : "";
        const denied = name === "NotAllowedError" || name === "SecurityError";
        const code = denied ? "permission_denied" : !stream ? "camera_unavailable" : "model_failed";
        fail(denied ? "Camera permission is blocked. Allow the camera in your browser's site settings, then retry." : error instanceof Error ? error.message : "Could not start camera tracking.", code);
      }
      throw error;
    }
  };
  return {
    start() { return startPromise ??= start(); },
    stop() { if (stopped) return; cleanup(); options.onStatus({ state: "stopped" }); },
  };
}
