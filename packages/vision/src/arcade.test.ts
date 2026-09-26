import test from "node:test";
import assert from "node:assert/strict";
import { initialArcadeState, scoreWash, expireCombo } from "./arcade";
import type { WashZone } from "./types";

test("Distinct zones build a capped multiplier", () => {
  let state = initialArcadeState();
  const zones: WashZone[] = ["hair", "chest", "left-arm", "right-pit", "right-arm"];
  zones.forEach((zone, i) => { state = scoreWash(state, { zone, capturedAtMs: i * 1000, intensity: 1, confidence: 1 }).state; });
  assert.equal(state.multiplier, 2.5); assert.equal(state.combo, 5); assert.equal(state.bestCombo, 5);
});
test("Camping earns diminishing points and does not extend combo lifetime", () => {
  let state = initialArcadeState();
  const points: number[] = [];
  for (let i = 0; i < 4; i++) {
    const result = scoreWash(state, { zone: "chest", capturedAtMs: i * 1000, intensity: 1, confidence: 1 });
    state = result.state; points.push(result.hit.points);
  }
  assert.ok(points.every((p, i) => i === 0 || p < points[i - 1]));
  assert.equal(state.combo, 1); assert.equal(state.lastChangeAt, 0);
  assert.equal(expireCombo(state, 6501).combo, 0);
});
test("Alternating only two spots cannot earn the top tier", () => {
  let state = initialArcadeState();
  for (let i = 0; i < 12; i++) state = scoreWash(state, { zone: i % 2 ? "chest" : "hair", capturedAtMs: i * 1000, intensity: 1, confidence: 1 }).state;
  assert.equal(state.multiplier, 1.5);
});
test("Expired combo restarts while keeping total score and record", () => {
  const first = scoreWash(initialArcadeState(), { zone: "hair", capturedAtMs: 0, intensity: .8, confidence: 1 }).state;
  const next = scoreWash(first, { zone: "chest", capturedAtMs: 7000, intensity: .8, confidence: 1 }).state;
  assert.equal(next.combo, 1); assert.equal(next.multiplier, 1); assert.ok(next.points > first.points);
});
