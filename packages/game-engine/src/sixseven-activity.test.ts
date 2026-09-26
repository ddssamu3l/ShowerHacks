import { describe, it, expect } from "vitest";
import { HAND_JOINTS, POSE_JOINTS, type TrackingFrame, type TrackedHand, type TrackingPoint } from "@vibecodemaxxing/contracts";
import { createSixSevenActivity } from "./sixseven-activity";

const noHand = (side: "left" | "right"): TrackedHand => ({
  side, tracked: false, source: "none", confidence: 0, palm: null, wrist: null, bodyPart: null,
  landmarks: Array(21).fill(null),
  joints: Object.fromEntries(HAND_JOINTS.map((j) => [j, null])) as TrackedHand["joints"],
  fingers: { thumb: { joints: [], tip: null }, index: { joints: [], tip: null }, middle: { joints: [], tip: null }, ring: { joints: [], tip: null }, pinky: { joints: [], tip: null } },
});

const hand = (side: "left" | "right", x: number, y: number): TrackedHand => {
  const palm: TrackingPoint = { x, y, motion: null };
  return { ...noHand(side), tracked: true, source: "hand", confidence: 0.9, palm, wrist: palm };
};

function frame(at: number, left: TrackedHand | null, right: TrackedHand | null = null): TrackingFrame {
  return {
    schemaVersion: 1, capturedAtMs: at, width: 960, height: 540, coordinateSpace: "camera-normalized", inputMode: "mock",
    body: { tracked: true, confidence: 0.9, landmarks: Array(33).fill(null), joints: Object.fromEntries(POSE_JOINTS.map((j) => [j, null])) as TrackingFrame["body"]["joints"], regions: [] },
    hands: { left: left ?? noHand("left"), right: right ?? noHand("right") },
  };
}

const ctx = { targetId: null, windowStartedAtMs: 1000, windowEndsAtMs: 11_000 };

function rockFrames(a: ReturnType<typeof createSixSevenActivity>, from: number, cycles: number) {
  const fps = 15;
  let beats = 0;
  for (let i = 0; i <= cycles * fps; i++) {
    const w = 0.08 * Math.sin(2 * Math.PI * (i / fps));
    const s = a.evaluate(frame(from + (i / fps) * 1000, hand("left", 0.3, 0.5 + w), hand("right", 0.7, 0.5 - w)), ctx);
    if (s.feedback?.level === "active") beats++;
  }
  return beats;
}

describe("createSixSevenActivity", () => {
  it("sets the target from the window length", () => {
    const a = createSixSevenActivity();
    a.evaluate(frame(1000, null), ctx);
    expect(a.state.targetBeats).toBe(16);
  });

  it("warns without two hands", () => {
    const a = createSixSevenActivity();
    const s = a.evaluate(frame(1000, hand("left", 0.3, 0.5)), ctx);
    expect(s.tracking).toBe(false);
    expect(s.confidence).toBe(0);
    expect(s.feedback?.level).toBe("warning");
  });

  it("counts beats and reports progress", () => {
    const a = createSixSevenActivity();
    const beats = rockFrames(a, 1000, 4);
    expect(beats).toBeGreaterThanOrEqual(7);
    expect(a.state.beats).toBe(beats);
    const s = a.evaluate(frame(5100, hand("left", 0.3, 0.5), hand("right", 0.7, 0.5)), ctx);
    expect(s.efficiency).toBeCloseTo(Math.min(1, beats / 16), 5);
    expect(s.metrics?.beats).toBe(beats);
  });

  it("resets on a new window", () => {
    const a = createSixSevenActivity();
    rockFrames(a, 1000, 2);
    expect(a.state.beats).toBeGreaterThan(0);
    const next = { targetId: null, windowStartedAtMs: 20_000, windowEndsAtMs: 35_000 };
    const s = a.evaluate(frame(20_000, null), next);
    expect(s.efficiency).toBe(0);
    expect(a.state.targetBeats).toBe(24);
  });

  it("freezes at the deadline", () => {
    const a = createSixSevenActivity();
    rockFrames(a, 1000, 2);
    const before = a.state.beats;
    rockFrames(a, 11_000, 2);
    expect(a.state.beats).toBe(before);
    expect(a.state.frozen).toBe(true);
  });
});
