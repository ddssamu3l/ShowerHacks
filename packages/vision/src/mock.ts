import type { VisionController } from "@vibecodemaxxing/contracts";
import { ScrubDetector } from "./detector";
import { drawOverlay } from "./overlay";
import type { ArcadeVisionOptions, Landmark, WashZone } from "./types";

/** Synthetic landmarks pass through the real scrub detector; no fake wash callbacks. */
export function mockPose(zone: WashZone, time: number): Landmark[] {
  const pose = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
  const set = (i: number, x: number, y: number) => { pose[i] = { x, y, visibility: .99 }; };
  set(0, .5, .25); set(11, .66, .43); set(12, .34, .43);
  set(13, .74, .7); set(14, .26, .7); set(15, .71, .89); set(16, .29, .89);
  const wave = Math.sin(time / 1000 * Math.PI * 4) * .05;
  if (zone === "hair") set(15, .5 + wave, .18);
  if (zone === "chest") set(15, .5 + wave, .58);
  if (zone === "right-arm") set(15, .30, .57 + wave);
  if (zone === "left-arm") set(16, .70, .57 + wave);
  if (zone === "right-pit") { set(14, .2, .3); set(15, .37 + wave * .6, .47); }
  if (zone === "left-pit") { set(13, .8, .3); set(16, .63 + wave * .6, .47); }
  return pose;
}

export function createMockVision(options: ArcadeVisionOptions): VisionController {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const now = options.now ?? (() => performance.now());
  const detector = new ScrubDetector(options.sensitivity);
  const sequence: WashZone[] = ["chest", "hair", "right-pit", "left-arm", "chest", "chest", "right-arm", "left-pit"];
  return {
    async start() {
      if (stopped) throw new Error("Create a new controller to restart.");
      if (timer) return;
      const start = now();
      options.onStatus({ state: "ready" });
      timer = setInterval(() => {
        if (stopped) return;
        const at = now(), elapsed = at - start;
        const zone = sequence[Math.floor(elapsed / 2600) % sequence.length];
        const { frame, wash } = detector.process(mockPose(zone, elapsed), at, 960, 720);
        if (options.overlay) drawOverlay(options.overlay, frame, 960, 720);
        options.onFrame?.(frame);
        options.onSample({ capturedAtMs: at, efficiency: frame.intensity, confidence: frame.confidence, tracking: frame.tracking });
        if (wash) options.onWash?.(wash);
      }, 50);
    },
    stop() {
      if (stopped) return;
      stopped = true; clearInterval(timer);
      options.overlay?.getContext("2d")?.clearRect(0, 0, options.overlay.width, options.overlay.height);
      options.onStatus({ state: "stopped" });
    },
  };
}
