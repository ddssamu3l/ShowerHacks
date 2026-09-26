import test from "node:test";
import assert from "node:assert/strict";
import { ScrubDetector } from "./detector";
import { mockPose } from "./mock";
import { ZONES, type Landmark, type WashEvent } from "./types";

function observe(makePose: (at: number) => Landmark[], duration = 3000) {
  const detector = new ScrubDetector();
  const hits: WashEvent[] = [];
  for (let at = 0; at <= duration; at += 50) {
    const { wash } = detector.process(makePose(at), at, 960, 720);
    if (wash) hits.push(wash);
  }
  return hits;
}

for (const zone of ZONES) test(`Repeated scrubbing recognizes ${zone}`, () => {
  const hits = observe(at => mockPose(zone, at));
  assert.ok(hits.length >= 2, `Expected repeated hits, got ${JSON.stringify(hits)}`);
  assert.ok(hits.every(hit => hit.zone === zone), JSON.stringify(hits));
});

test("A still hand touching the chest cannot score", () => {
  assert.equal(observe(() => mockPose("chest", 0)).length, 0);
});
test("A resting hand cannot steal the target from a hand scrubbing hair", () => {
  const hits = observe(at => mockPose("hair", at).map((p, i) => i === 16 ? { ...p, x: .5, y: .58 } : p));
  assert.ok(hits.length >= 2);
  assert.ok(hits.every(hit => hit.zone === "hair"));
});
test("Moving the whole body with a stationary relative hand cannot score", () => {
  assert.equal(observe(at => mockPose("chest", 0).map(p => ({ ...p, x: p.x + Math.sin(at / 200) * .05, y: p.y + Math.cos(at / 200) * .03 }))).length, 0);
});
test("Very small tracking jitter cannot score", () => {
  assert.equal(observe(at => mockPose("chest", 0).map((p, i) => i === 15 ? { ...p, x: p.x + Math.sin(at / 90) * .001 } : p)).length, 0);
});
test("Poor visibility prevents hits", () => {
  assert.equal(observe(at => mockPose("chest", at).map(p => ({ ...p, visibility: .2 }))).length, 0);
});
test("Body-scale normalization preserves hits", () => {
  const regular = observe(at => mockPose("chest", at));
  const smaller = observe(at => mockPose("chest", at).map(p => ({ ...p, x: .5 + (p.x - .5) * .7, y: .5 + (p.y - .5) * .7 })));
  assert.equal(smaller.length, regular.length);
});
test("A hand waving away from the body cannot score", () => {
  assert.equal(observe(at => mockPose("chest", at).map((p, i) => i === 15 ? { ...p, x: .93 + Math.sin(at / 100) * .04, y: .15 } : p)).length, 0);
});
test("A lost pose clears motion history", () => {
  const detector = new ScrubDetector();
  for (let at = 0; at < 1200; at += 50) detector.process(mockPose("chest", at), at, 960, 720);
  const absent = detector.process([], 1200, 960, 720);
  assert.equal(absent.frame.tracking, false);
  assert.equal(absent.wash, undefined);
  for (let at = 1250; at < 2250; at += 50) assert.equal(detector.process(mockPose("chest", 0), at, 960, 720).wash, undefined);
});
