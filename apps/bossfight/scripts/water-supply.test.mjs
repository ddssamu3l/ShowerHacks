import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { WaterReserve, BottleSupply, WATER_RULES } from '../src/water-supply.js';
import { traceWater, HOSE } from '../src/water.js';

test('reserve drains only during paid firing and the focused jet uses more water', () => {
 const water = new WaterReserve();
 assert.equal(water.consume('shower', 3, false), 0); assert.equal(water.amount, 100);
 assert.equal(water.consume('shower', 1), 1); assert.equal(water.amount, 94);
 assert.equal(water.consume('jet', 1), 1); assert.equal(water.amount, 85);
});
test('empty tanks cannot clean; a partial last frame gets only its remaining exposure', () => {
 const water = new WaterReserve(); water.consume('jet', 11);
 assert.equal(water.amount, 1); assert.ok(Math.abs(water.consume('jet', 1) - 1 / 9) < 1e-9);
 assert.equal(water.amount, 0); assert.equal(water.empty, true); assert.equal(water.consume('shower', 1), 0);
 assert.equal(water.refill(), 45); assert.equal(water.empty, false);
});
test('resource use is frame-rate independent and invalid input is ignored', () => {
 const a = new WaterReserve(), b = new WaterReserve();
 for (let i = 0; i < 300; i++) a.consume('jet', 1 / 60);
 for (let i = 0; i < 100; i++) b.consume('jet', 1 / 20);
 assert.ok(Math.abs(a.amount - b.amount) < 1e-8);
 const before = a.amount; for (const seconds of [NaN, Infinity, -1]) a.consume('jet', seconds);
 a.consume('invalid', 2); a.refill(NaN); assert.equal(a.amount, before);
});
test('walking over a bottle refills once, clamps at capacity, then respawns in game time', () => {
 const water = new WaterReserve(), supply = new BottleSupply(), location = { x: 0, z: 4 };
 assert.equal(supply.collect(location, 0, water), null); // Full tanks leave pickups available.
 water.consume('jet', 5); assert.equal(supply.collect(location, 2, water).added, 45); assert.equal(water.amount, 100);
 water.consume('jet', 1); assert.equal(supply.collect(location, 3, water), null);
 assert.equal(supply.collect(location, 2 + WATER_RULES.respawnSeconds - .001, water), null);
 assert.equal(supply.collect(location, 2 + WATER_RULES.respawnSeconds, water).added, 9); assert.equal(water.amount, 100);
});
test('pickup collection honors distance and player state; restart restores pickups and reserve', () => {
 const water = new WaterReserve(), supply = new BottleSupply(); water.consume('shower', 10);
 assert.equal(supply.collect({ x: 3, z: 4 }, 0, water), null);
 assert.equal(supply.collect({ x: 0, z: 4 }, 0, water, false), null);
 assert.equal(supply.nearest({ x: 0, z: 7 }, 0).id, 0);
 supply.collect({ x: 0, z: 4 }, 0, water); assert.notEqual(supply.nearest({ x: 0, z: 7 }, 1).id, 0);
 supply.reset(); water.reset(); assert.equal(water.amount, 100); assert.equal(supply.nearest({ x: 0, z: 7 }, 0).id, 0);
});
test('high-pressure water stops at the first boss hit and at the floor', () => {
 const origin = new T.Vector3(0, 1, 0), velocity = new T.Vector3(0, 0, HOSE.jet.speed);
 const surface = { cast(a, b) { if (a.z <= 4 && b.z >= 4) { const f = (4 - a.z) / (b.z - a.z); return { point: a.clone().lerp(b, f), distance: a.distanceTo(b) * f }; } return null; } };
 const result = traceWater(surface, origin, velocity, .5);
 assert.ok(result.hit); assert.ok(Math.abs(result.time - 4 / HOSE.jet.speed) < 1e-8);
 const floor = traceWater({ cast: () => null }, origin, new T.Vector3(0, -10, 0), 1);
 assert.equal(floor.hit, null); assert.ok(floor.time < .1);
});
