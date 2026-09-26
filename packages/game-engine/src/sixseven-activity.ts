/**
 * Six Seven as an ActivityAdapter for the shared tracking framework
 * (packages/contracts/src/tracking.ts). The tracker calls `evaluate` once per
 * frame; the adapter feeds both palms to the beat detector and reports the
 * progress toward the turn's beat target as `efficiency`.
 *
 * Like fog, the score is cumulative: read `sixSevenProgress(activity.state)`
 * at the deadline, not ActivityScoreWindow's time average.
 */

import type { ActivityAdapter, ActivityContext, ActivitySample, TrackingFrame } from "@vibecodemaxxing/contracts";
import {
  applySixSevenSample,
  createSixSeven,
  freezeSixSeven,
  lastSixSevenCall,
  sixSevenProgress,
  type SixSevenConfig,
  type SixSevenHand,
  type SixSevenState,
} from "./sixseven";

export type SixSevenActivityOptions = Partial<SixSevenConfig>;

export interface SixSevenActivity extends ActivityAdapter {
  readonly id: "sixseven";
  /** Live detector state. Replaced when a new window starts. */
  readonly state: SixSevenState;
  /** Palms seen in the last frame, camera-normalized (unmirrored). */
  readonly hands: readonly SixSevenHand[];
}

export function createSixSevenActivity(options: SixSevenActivityOptions = {}): SixSevenActivity {
  let state = createSixSeven({ targetBeats: 1, ...options });
  let hands: SixSevenHand[] = [];
  let windowKey = "";

  return {
    id: "sixseven",
    get state() { return state; },
    get hands() { return hands; },
    reset() {
      state = createSixSeven({ targetBeats: 1, ...options });
      hands = [];
      windowKey = "";
    },
    evaluate(frame: TrackingFrame, context: ActivityContext): ActivitySample {
      const key = `${context.windowStartedAtMs}:${context.windowEndsAtMs}:${context.targetId}`;
      if (key !== windowKey) {
        state = createSixSeven({ durationMs: Math.max(1000, context.windowEndsAtMs - context.windowStartedAtMs), ...options });
        hands = [];
        windowKey = key;
      }

      const at = frame.capturedAtMs;
      const inWindow = at >= context.windowStartedAtMs && at < context.windowEndsAtMs;
      hands = (["left", "right"] as const).flatMap((side) => {
        const hand = frame.hands[side];
        return hand.tracked && hand.palm ? [{ side, x: hand.palm.x, y: hand.palm.y }] : [];
      });
      const confidence = Math.max(0, ...(["left", "right"] as const).map((side) => (frame.hands[side].tracked ? frame.hands[side].confidence : 0)));

      let beat = false;
      if (inWindow) {
        beat = applySixSevenSample(state, { capturedAtMs: at, hands }) === "beat";
      } else if (at >= context.windowEndsAtMs) {
        freezeSixSeven(state);
      }

      const tracking = hands.length === 2;
      const progress = sixSevenProgress(state);
      const label = !tracking
        ? "Show both hands, palms up"
        : beat
          ? (lastSixSevenCall(state) === "six" ? "Six!" : "Seven!")
          : progress >= 1
            ? "Maxed. Keep the streak alive"
            : "Rock the hands: six... seven";
      return {
        schemaVersion: 1,
        activityId: "sixseven",
        targetId: context.targetId,
        capturedAtMs: at,
        tracking,
        confidence: tracking ? Math.max(0.5, confidence) : 0,
        efficiency: progress,
        feedback: { label, level: !tracking ? "warning" : beat ? "active" : "idle" },
        metrics: { beats: state.beats, target: state.targetBeats, streak: state.streak, hands: hands.length },
      };
    },
  };
}
