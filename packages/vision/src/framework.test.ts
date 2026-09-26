import test from "node:test";
import assert from "node:assert/strict";
import type { ActivitySample } from "@vibecodemaxxing/contracts";
import { TrackingFrameBuilder } from "./tracking";
import { ActivityScoreWindow } from "./activity-score";
import { createScrubActivity } from "./scrub-activity";
import { ScrubChallenge, CHALLENGE_TARGETS } from "./challenge";
import { challengeDemoPose } from "./challenge-demo";

const sample = (at: number, efficiency = 1, targetId = "chest"): ActivitySample => ({ schemaVersion: 1, activityId: "scrub", targetId, capturedAtMs: at, efficiency, confidence: 1, tracking: true });
test("Shared tracking gives named fingertips and camera-space velocity without losing anatomical identity", () => {
  const builder = new TrackingFrameBuilder();
  const pose = challengeDemoPose("chest", 0);
  const detection = (x: number) => ({ handedness: "left" as const, handednessScore: .99, landmarks: Array.from({ length: 21 }, (_, i) => ({ x: x + i * .001, y: .65 })) });
  const first = builder.process(pose, [detection(.5)], 0, 960, 720);
  assert.equal(first.coordinateSpace, "camera-normalized");
  assert.equal(first.body.landmarks.length, 33);
  assert.equal(first.hands.left.landmarks.length, 21);
  assert.equal(first.hands.left.fingers.index.tip, first.hands.left.joints.indexTip);
  assert.equal(first.hands.left.fingers.index.tip!.motion, null);
  const second = builder.process(pose, [detection(.52)], 50, 960, 720);
  assert.ok(Math.abs(second.hands.left.fingers.index.tip!.motion!.velocity.x - .4) < 1e-9);
  assert.equal(second.hands.left.side, "left");
});
test("Pose fallback exposes an estimated palm but never invents fingers; loss clears motion", () => {
  const builder = new TrackingFrameBuilder();
  const first = builder.process(challengeDemoPose("chest", 0), [], 0, 960, 720);
  assert.equal(first.hands.left.source, "pose");
  assert.ok(first.hands.left.palm);
  assert.ok(first.hands.left.landmarks.every(p => p === null));
  assert.equal(first.hands.left.fingers.index.tip, null);
  const lost = builder.process([], [], 50, 960, 720);
  assert.equal(lost.hands.left.palm, null);
  const returned = builder.process(challengeDemoPose("chest", 0), [], 100, 960, 720);
  assert.equal(returned.hands.left.palm!.motion, null);
});
test("Hands and fingers remain available without a body, and gaps clear point velocities", () => {
  const builder = new TrackingFrameBuilder();
  const hand = { handedness: "right" as const, handednessScore: .99, landmarks: Array.from({length:21}, () => ({x:.4,y:.4})) };
  const first = builder.process([], [hand], 0, 960, 720);
  assert.equal(first.body.tracked, false);
  assert.equal(first.hands.right.tracked, true);
  assert.ok(first.hands.right.fingers.index.tip);
  assert.equal(first.hands.right.bodyPart, null);
  const later = builder.process([], [hand], 1000, 960, 720);
  assert.equal(later.hands.right.fingers.index.tip!.motion, null);
  assert.throws(() => builder.process([], [hand], 1000, 960, 720));
});
test("Normalized scores are identical across window duration and frame rate", () => {
  for (const duration of [3000, 8000]) for (const step of [50, 100, 200]) {
    const score = new ActivityScoreWindow({ activityId: "scrub", targetId: "chest", startAtMs: 0, endAtMs: duration });
    for (let at = 0; at < duration; at += step) assert.ok(score.ingest(sample(at, .6), at));
    assert.equal(score.snapshot(duration).basePoints, 600);
  }
});
test("Missing frames expire after 250 ms, and low-confidence samples immediately stop scoring", () => {
  const score = new ActivityScoreWindow({ activityId: "scrub", targetId: "chest", startAtMs: 0, endAtMs: 1000 });
  score.ingest(sample(0), 0);
  assert.equal(score.snapshot(1000).basePoints, 250);
  score.ingest({ ...sample(100), confidence: .2 }, 100);
  assert.equal(score.snapshot(1000).basePoints, 100);
});
test("The shared scorer rejects wrong activities, targets, invalid values, stale and late samples", () => {
  const score = new ActivityScoreWindow({ activityId: "scrub", targetId: "chest", startAtMs: 0, endAtMs: 1000 });
  assert.equal(score.ingest({ ...sample(10), activityId: "fog" }, 10), false);
  assert.equal(score.ingest(sample(10, 1, "hair"), 10), false);
  assert.equal(score.ingest(sample(10, NaN), 10), false);
  assert.equal(score.ingest(sample(10, 2), 10), false);
  assert.equal(score.ingest(sample(10), 300), false);
  assert.equal(score.ingest(sample(20), 10), false);
  assert.equal(score.ingest(sample(900), 1000), false);
  assert.equal(score.ingest(sample(10), 10), true);
  assert.equal(score.ingest(sample(10), 20), false);
});
test("Targets switch at exact deadlines, success chains a multiplier, and a miss resets it", () => {
  const game = new ScrubChallenge(1000, 3000, ["chest", "hair", "left-arm"]);
  assert.equal(game.tick(999).phase, "countdown");
  for (let at = 1000; at < 4000; at += 50) game.ingest(sample(at, .8), at);
  const second = game.tick(4000);
  assert.equal(second.target, "hair"); assert.equal(second.remainingMs, 3000);
  assert.equal(second.score, 800); assert.equal(second.combo, 1); assert.equal(second.multiplier, 1.25);
  assert.equal(second.liveIntensity, 0);
  assert.equal(game.ingest(sample(3999), 4010), false);
  const third = game.tick(7000);
  assert.equal(third.combo, 0); assert.equal(third.multiplier, 1);
  assert.equal(third.results[1].points, 0);
  assert.equal(game.tick(10_000).phase, "finished");
});
test("A delayed timer cannot extend rounds or carry a held reading through missed targets", () => {
  const game = new ScrubChallenge(0, 3000, ["chest", "hair", "left-arm"]);
  game.ingest(sample(0), 0);
  const finished = game.tick(20_000);
  assert.equal(finished.phase, "finished");
  assert.deepEqual(finished.results.map(r => r.endedAtMs), [3000,6000,9000]);
  assert.equal(finished.results[1].points, 0);
  assert.equal(finished.results[2].points, 0);
});
test("A whole 24-second simulated run chains all targets and caps the multiplier", () => {
  const builder = new TrackingFrameBuilder(), activity = createScrubActivity();
  const game = new ScrubChallenge(3000);
  for (let at = 0; at < 27_000; at += 50) {
    const snapshot = game.tick(at);
    const frame = builder.process(challengeDemoPose(snapshot.target!, at), [], at, 960, 720, "mock");
    if (snapshot.phase === "active") game.ingest(activity.evaluate(frame, game.getContext()), at);
  }
  const finished = game.tick(27_000);
  assert.equal(finished.phase, "finished");
  assert.equal(finished.results.length, 8);
  assert.equal(finished.bestCombo, 8);
  assert.equal(finished.results[7].multiplier, 2.5);
  assert.ok(finished.score > 5000);
});
test("Two hands on the target share a capped score and a still hand does not cancel scrubbing", () => {
  const builder = new TrackingFrameBuilder(), activity = createScrubActivity();
  const score = new ActivityScoreWindow({ activityId: "scrub", targetId: "chest", startAtMs: 0, endAtMs: 3000 });
  for (let at = 0; at < 3000; at += 50) {
    const pose = challengeDemoPose("chest", at);
    pose[16] = { x:.5, y:.65, visibility:.99 };
    const frame = builder.process(pose, [], at, 960, 720);
    const value = activity.evaluate(frame, { targetId:"chest", windowStartedAtMs:0, windowEndsAtMs:3000 });
    assert.ok(value.efficiency >= 0 && value.efficiency <= 1);
    score.ingest(value, at);
  }
  assert.ok(score.snapshot(3000).basePoints > 350);
  assert.ok(score.snapshot(3000).basePoints <= 1000);
});

for (const target of CHALLENGE_TARGETS) test(`Shared tracking → scrub adapter → scorer recognizes ${target}`, () => {
  const builder = new TrackingFrameBuilder(), activity = createScrubActivity();
  const game = new ScrubChallenge(0, 3000, [target]);
  for (let at = 0; at < 3000; at += 50) {
    const frame = builder.process(challengeDemoPose(target, at), [], at, 960, 720, "mock");
    game.ingest(activity.evaluate(frame, game.getContext()), at);
  }
  const result = game.tick(3000).results[0];
  assert.ok(result.success, `${target}: ${JSON.stringify(result)}`);
});
for (const kind of ["stationary", "body movement", "jitter", "wrong target"] as const) test(`No scrub reward for ${kind}`, () => {
  const builder = new TrackingFrameBuilder(), activity = createScrubActivity();
  const game = new ScrubChallenge(0, 3000, ["chest"]);
  for (let at = 0; at < 3000; at += 50) {
    let pose = challengeDemoPose(kind === "wrong target" ? "hair" : "chest", kind === "wrong target" ? at : 0);
    if (kind === "body movement") pose = pose.map(p => ({ ...p, x: p.x + Math.sin(at / 200) * .05, y: p.y + Math.cos(at / 200) * .03 }));
    if (kind === "jitter") pose[15].x += Math.sin(at / 50) * .001;
    const frame = builder.process(pose, [], at, 960, 720);
    game.ingest(activity.evaluate(frame, game.getContext()), at);
  }
  assert.equal(game.tick(3000).score, 0);
});
