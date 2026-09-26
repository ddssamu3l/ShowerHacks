import { describe, it, expect } from "vitest";
import { HAND_JOINTS, POSE_JOINTS, type TrackingFrame, type TrackedHand, type TrackingPoint } from "@vibecodemaxxing/contracts";
import { createFogActivity } from "./fog-activity";
import { scoreFog } from "./fog";

const noHand = (side: "left" | "right"): TrackedHand => ({
  side, tracked: false, source: "none", confidence: 0, palm: null, wrist: null, bodyPart: null,
  landmarks: Array(21).fill(null),
  joints: Object.fromEntries(HAND_JOINTS.map((j) => [j, null])) as TrackedHand["joints"],
  fingers: { thumb: { joints: [], tip: null }, index: { joints: [], tip: null }, middle: { joints: [], tip: null }, ring: { joints: [], tip: null }, pinky: { joints: [], tip: null } },
});

const hand = (side: "left" | "right", x: number, y: number, tip?: { x: number; y: number }): TrackedHand => {
  const palm: TrackingPoint = { x, y, motion: null };
  const h = noHand(side);
  return { ...h, tracked: true, source: "hand", confidence: 0.9, palm, wrist: palm, fingers: { ...h.fingers, index: { joints: [], tip: tip ? { ...tip, motion: null } : null } } };
};

function frame(at: number, left: TrackedHand | null, right: TrackedHand | null = null): TrackingFrame {
  return {
    schemaVersion: 1, capturedAtMs: at, width: 960, height: 540, coordinateSpace: "camera-normalized", inputMode: "mock",
    body: { tracked: true, confidence: 0.9, landmarks: Array(33).fill(null), joints: Object.fromEntries(POSE_JOINTS.map((j) => [j, null])) as TrackingFrame["body"]["joints"], regions: [] },
    hands: { left: left ?? noHand("left"), right: right ?? noHand("right") },
  };
}

const ctx = { targetId: null, windowStartedAtMs: 1000, windowEndsAtMs: 11_000 };

describe("createFogActivity", () => {
  it("starts opaque and wipes with a moving palm", () => {
    const a = createFogActivity();
    const s0 = a.evaluate(frame(1000, hand("left", 0.3, 0.5)), ctx);
    expect(s0.activityId).toBe("fog");
    expect(s0.tracking).toBe(true);
    expect(s0.efficiency).toBeGreaterThan(0);
    const s1 = a.evaluate(frame(1100, hand("left", 0.4, 0.5)), ctx);
    expect(s1.efficiency).toBeGreaterThan(s0.efficiency);
    expect(a.hands).toEqual([{ x: 0.4, y: 0.5 }]);
  });

  it("reports untracked with zero confidence when no hand is visible", () => {
    const a = createFogActivity();
    const s = a.evaluate(frame(1000, null), ctx);
    expect(s.tracking).toBe(false);
    expect(s.confidence).toBe(0);
    expect(s.feedback?.level).toBe("warning");
  });

  it("uses both hands", () => {
    const a = createFogActivity();
    a.evaluate(frame(1000, hand("left", 0.2, 0.5), hand("right", 0.8, 0.5)), ctx);
    expect(a.hands).toHaveLength(2);
    expect(a.fog.cells[9 * 32 + 6]).toBeLessThan(1);
    expect(a.fog.cells[9 * 32 + 25]).toBeLessThan(1);
  });

  it("can drive the sponge from the index fingertip", () => {
    const a = createFogActivity({ point: "indexTip" });
    a.evaluate(frame(1000, hand("left", 0.2, 0.5, { x: 0.8, y: 0.5 })), ctx);
    expect(a.hands).toEqual([{ x: 0.8, y: 0.5 }]);
  });

  it("resets the grid when the window changes", () => {
    const a = createFogActivity();
    a.evaluate(frame(1000, hand("left", 0.3, 0.5)), ctx);
    a.evaluate(frame(1100, hand("left", 0.5, 0.5)), ctx);
    expect(scoreFog(a.fog)).toBeGreaterThan(0);
    const next = { targetId: null, windowStartedAtMs: 20_000, windowEndsAtMs: 30_000 };
    const s = a.evaluate(frame(20_000, null), next);
    expect(s.efficiency).toBe(0);
    expect(scoreFog(a.fog)).toBe(0);
  });

  it("freezes at the deadline so late frames do not change the score", () => {
    const a = createFogActivity();
    a.evaluate(frame(1000, hand("left", 0.3, 0.5)), ctx);
    a.evaluate(frame(1100, hand("left", 0.5, 0.5)), ctx);
    const before = scoreFog(a.fog);
    a.evaluate(frame(11_000, hand("left", 0.7, 0.5)), ctx);
    a.evaluate(frame(11_100, hand("left", 0.9, 0.5)), ctx);
    expect(scoreFog(a.fog)).toBe(before);
    expect(a.fog.frozen).toBe(true);
  });

  it("frames before the window do not wipe", () => {
    const a = createFogActivity();
    a.evaluate(frame(500, hand("left", 0.3, 0.5)), ctx);
    a.evaluate(frame(600, hand("left", 0.5, 0.5)), ctx);
    expect(scoreFog(a.fog)).toBe(0);
  });
});
