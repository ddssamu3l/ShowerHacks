import type { ActivityAdapter, ActivityContext, ActivitySample, TrackingFrame } from "@vibecodemaxxing/contracts";
import { PlacementScrubDetector } from "./scrub-motion";

/** Reference activity: body-region placement + motion -> the shared activity scoring envelope. */
export function createScrubActivity(): ActivityAdapter {
  const detector = new PlacementScrubDetector();
  let windowKey = "";
  return {
    id: "scrub",
    reset() { detector.reset(); windowKey = ""; },
    evaluate(frame: TrackingFrame, context: ActivityContext): ActivitySample {
      const key = `${context.windowStartedAtMs}:${context.windowEndsAtMs}:${context.targetId}`;
      if (key !== windowKey) { detector.reset(); windowKey = key; }
      const motion = detector.process(frame);
      const inWindow = frame.capturedAtMs >= context.windowStartedAtMs && frame.capturedAtMs < context.windowEndsAtMs;
      const hands = motion.hands.filter(hand => hand.zone === context.targetId && hand.confidence >= .5);
      const intensity = inWindow ? Math.max(0, ...hands.map(hand => hand.intensity)) : 0;
      const onTarget = inWindow && hands.length > 0;
      const label = !motion.tracking ? "Keep your shoulders and hands in view" : !onTarget ? "Move a hand to the target" : intensity ? "Scrubbing! Keep it moving" : "Rub back and forth or in circles";
      return { schemaVersion: 1, activityId: "scrub", targetId: context.targetId, capturedAtMs: frame.capturedAtMs,
        tracking: motion.tracking, confidence: motion.tracking ? frame.body.confidence : 0, efficiency: intensity,
        feedback: { label, level: intensity ? "active" : onTarget ? "idle" : "warning" },
        metrics: { onTarget: onTarget ? 1 : 0, speed: Math.max(0, ...hands.map(hand => hand.speed)) },
      };
    },
  };
}
