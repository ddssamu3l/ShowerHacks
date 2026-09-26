import type { Landmark } from "@vibecodemaxxing/vision";
import type { WipePoint } from "@vibecodemaxxing/game-engine";

// MediaPipe Pose landmark indices.
const LEFT_WRIST = 15, RIGHT_WRIST = 16, LEFT_INDEX = 19, RIGHT_INDEX = 20;
const MIN_VISIBILITY = 0.45;

/**
 * Hand centers for the fog wiper, in raw video coordinates (0..1).
 * Uses the midpoint of wrist and index finger when both are visible,
 * the wrist alone otherwise. Returns up to two points.
 *
 * The fog canvas is CSS-mirrored the same way as the video, so no
 * horizontal flip is needed here.
 */
export function handPoints(landmarks: readonly Landmark[]): WipePoint[] {
  const out: WipePoint[] = [];
  for (const [wristIdx, indexIdx] of [[LEFT_WRIST, LEFT_INDEX], [RIGHT_WRIST, RIGHT_INDEX]] as const) {
    const wrist = landmarks[wristIdx];
    const index = landmarks[indexIdx];
    const wristOk = visible(wrist);
    const indexOk = visible(index);
    if (wristOk && indexOk) out.push({ x: (wrist.x + index.x) / 2, y: (wrist.y + index.y) / 2 });
    else if (wristOk) out.push({ x: wrist.x, y: wrist.y });
    else if (indexOk) out.push({ x: index.x, y: index.y });
  }
  return out;
}

function visible(p: Landmark | undefined): p is Landmark {
  return !!p && (p.visibility ?? 0) >= MIN_VISIBILITY && Number.isFinite(p.x) && Number.isFinite(p.y);
}
