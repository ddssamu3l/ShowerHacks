/**
 * Fog Wipe as an ActivityAdapter for the shared tracking framework
 * (packages/contracts/src/tracking.ts). The tracker calls `evaluate` once per
 * frame; the adapter wipes the fog grid with the tracked hands and reports the
 * cleared fraction as `efficiency`.
 *
 * Note for the game: unlike scrub, fog is cumulative. The turn score is the
 * cleared fraction at the deadline (`scoreFog`), not the time average that
 * ActivityScoreWindow computes. Read `fog` after the window ends.
 */

import type { ActivityAdapter, ActivityContext, ActivitySample, TrackingFrame, TrackedHand } from "@vibecodemaxxing/contracts";
import { advanceFog, applyWipe, clearedFraction, createFog, freezeFog, type FogConfig, type FogState, type WipePoint } from "./fog";

export interface FogActivityOptions extends Partial<FogConfig> {
  /** Which hand point drives the sponge. Default palm. */
  point?: "palm" | "indexTip";
}

export interface FogActivity extends ActivityAdapter {
  readonly id: "fog";
  /** Live grid for rendering. Replaced when a new window starts. */
  readonly fog: FogState;
  /** Last accepted hand points in camera-normalized (unmirrored) coordinates. */
  readonly hands: readonly WipePoint[];
}

export function createFogActivity(options: FogActivityOptions = {}): FogActivity {
  const { point = "palm", ...config } = options;
  let fog = createFog(config);
  let hands: WipePoint[] = [];
  let windowKey = "";

  const pick = (hand: TrackedHand): WipePoint | null => {
    if (!hand.tracked) return null;
    const p = point === "indexTip" ? hand.fingers.index.tip ?? hand.palm : hand.palm;
    return p ? { x: p.x, y: p.y } : null;
  };

  return {
    id: "fog",
    get fog() { return fog; },
    get hands() { return hands; },
    reset() {
      fog = createFog(config);
      hands = [];
      windowKey = "";
    },
    evaluate(frame: TrackingFrame, context: ActivityContext): ActivitySample {
      const key = `${context.windowStartedAtMs}:${context.windowEndsAtMs}:${context.targetId}`;
      if (key !== windowKey) {
        fog = createFog(config);
        advanceFog(fog, context.windowStartedAtMs);
        hands = [];
        windowKey = key;
      }

      const at = frame.capturedAtMs;
      const inWindow = at >= context.windowStartedAtMs && at < context.windowEndsAtMs;
      const points = [frame.hands.left, frame.hands.right].map(pick).filter((p): p is WipePoint => p !== null);
      const confidence = Math.max(0, frame.hands.left.tracked ? frame.hands.left.confidence : 0, frame.hands.right.tracked ? frame.hands.right.confidence : 0);

      if (inWindow) {
        advanceFog(fog, at);
        applyWipe(fog, { capturedAtMs: at, points, tracking: points.length > 0 });
      } else if (at >= context.windowEndsAtMs) {
        freezeFog(fog);
      }
      hands = points;

      const cleared = clearedFraction(fog);
      const tracking = points.length > 0;
      const label = !tracking ? "Show a hand to the camera" : cleared >= 0.95 ? "Spotless. Keep going for 100" : "Wipe the fog, keep the hand moving";
      return {
        schemaVersion: 1,
        activityId: "fog",
        targetId: context.targetId,
        capturedAtMs: at,
        tracking,
        confidence: tracking ? Math.max(0.5, confidence) : 0,
        efficiency: cleared,
        feedback: { label, level: !tracking ? "warning" : "active" },
        metrics: { cleared, hands: points.length },
      };
    },
  };
}
