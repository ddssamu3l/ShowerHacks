import test from "node:test";
import assert from "node:assert/strict";
import { PlacementDetector, type DetectedHand, type Point2 } from "./placement";
import type { Landmark } from "./types";

const chest = { x: .5, y: .66 }, leftShoulder = { x: .65, y: .45 }, rightShoulder = { x: .35, y: .45 };
function pose(left = chest, right = chest): Landmark[] {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
  const set = (i: number, p: Point2) => { points[i] = { ...p, visibility: .99 }; };
  set(0, { x: .5, y: .24 }); set(11, leftShoulder); set(12, rightShoulder);
  set(13, { x: .73, y: .73 }); set(14, { x: .27, y: .73 });
  set(15, left); set(16, right);
  return points;
}
function hand(side: "left" | "right", point: Point2): DetectedHand {
  return { handedness: side, handednessScore: .99, landmarks: Array.from({ length: 21 }, () => ({ ...point })) };
}
test("Stationary hand on shoulder highlights immediately", () => {
  const detector = new PlacementDetector();
  for (let at = 0; at <= 2000; at += 50) {
    const frame = detector.process(pose(rightShoulder, chest), [], at, 960, 720);
    assert.equal(frame.hands[0].zone, "right-shoulder");
    assert.equal(frame.hands[1].zone, "chest");
  }
});
test("Both hands can occupy the same chest region, even at identical coordinates", () => {
  const frame = new PlacementDetector().process(pose(), [hand("left", chest), hand("right", chest)], 0, 960, 720);
  assert.equal(frame.hands.length, 2);
  assert.deepEqual(frame.hands.map(p => p.zone), ["chest", "chest"]);
  assert.deepEqual(frame.hands.map(p => p.side), ["left", "right"]);
  assert.ok(frame.hands.every(p => p.source === "hand"));
});
test("Crossed arms retain anatomical hand identity when model result order changes", () => {
  const frame = new PlacementDetector().process(pose(rightShoulder, leftShoulder), [hand("right", leftShoulder), hand("left", rightShoulder)], 0, 960, 720);
  assert.equal(frame.hands[0].side, "left"); assert.equal(frame.hands[0].zone, "right-shoulder");
  assert.equal(frame.hands[1].side, "right"); assert.equal(frame.hands[1].zone, "left-shoulder");
});
test("A stationary hand on hair counts with the other hand on a shoulder", () => {
  const hair = { x: .5, y: .1 };
  const frame = new PlacementDetector().process(pose(hair, leftShoulder), [hand("left", hair), hand("right", leftShoulder)], 0, 960, 720);
  assert.deepEqual(frame.hands.map(p => p.zone), ["hair", "left-shoulder"]);
});
test("A hand can touch its own shoulder", () => {
  const frame = new PlacementDetector().process(pose(leftShoulder, rightShoulder), [], 0, 960, 720);
  assert.deepEqual(frame.hands.map(p => p.zone), ["left-shoulder", "right-shoulder"]);
});
test("Hands outside body regions remain visible without a forced target", () => {
  const air = { x: .05, y: .1 };
  const frame = new PlacementDetector().process(pose(air, air), [hand("left", air), hand("right", air)], 0, 960, 720);
  assert.ok(frame.hands.every(p => p.visible && p.zone === null));
});
test("Loss of a hand clears just that hand's highlight", () => {
  const detector = new PlacementDetector();
  detector.process(pose(rightShoulder, chest), [], 0, 960, 720);
  const points = pose(rightShoulder, chest); points[15].visibility = 0;
  const frame = detector.process(points, [], 50, 960, 720);
  assert.equal(frame.hands[0].visible, false); assert.equal(frame.hands[0].zone, null);
  assert.equal(frame.hands[1].zone, "chest");
});
test("Hand model points stay visible when body tracking is lost, with no invented region", () => {
  const frame = new PlacementDetector().process([], [hand("left", chest)], 0, 960, 720);
  assert.equal(frame.tracking, false); assert.equal(frame.hands[0].visible, true); assert.equal(frame.hands[0].zone, null);
});
test("Hand detection falls back to an explicitly identified arm estimate", () => {
  const frame = new PlacementDetector().process(pose(rightShoulder, chest), [hand("left", rightShoulder)], 0, 960, 720);
  assert.equal(frame.hands[0].source, "hand"); assert.equal(frame.hands[1].source, "pose");
});
test("Shoulder assignment is invariant under frame aspect ratio", () => {
  for (const [width, height] of [[960,720],[1280,720],[720,960]]) {
    const frame = new PlacementDetector().process(pose(rightShoulder, leftShoulder), [], 0, width, height);
    assert.deepEqual(frame.hands.map(p => p.zone), ["right-shoulder", "left-shoulder"]);
  }
});
