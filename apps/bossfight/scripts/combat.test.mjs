import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatState, ATTACKS, capsulesTouch, segmentDistanceSq } from '../src/combat.js';
import { CLIPS } from '../src/motion.js';

test('roll is invulnerable immediately, then has a vulnerable recovery', () => {
  const fight = new CombatState(); assert.equal(fight.roll([1, 0]), true);
  assert.equal(fight.hit('sweep', 25), false);
  fight.tick(.419); assert.equal(fight.invulnerable, true);
  fight.tick(.42); assert.equal(fight.invulnerable, false); assert.equal(fight.canMove, false);
  assert.equal(fight.roll([0, 1]), false);
  fight.tick(.8); assert.equal(fight.state, 'ready'); assert.equal(fight.canMove, true);
});
test('a hit knocks down and protects through the complete get-up animation', () => {
  const fight = new CombatState(); assert.equal(fight.hit('kick-1', 25), true);
  assert.equal(fight.health, 75); assert.equal(fight.state, 'knockedDown');
  assert.equal(fight.roll([1, 0]), false); assert.equal(fight.hit('slam', 40), false);
  fight.tick(.9); assert.equal(fight.state, 'gettingUp'); assert.equal(fight.invulnerable, true);
  fight.tick(2.14); assert.equal(fight.hit('charge', 27), false); assert.equal(fight.canMove, false);
  fight.tick(2.15); assert.equal(fight.state, 'ready'); assert.equal(fight.invulnerable, false);
});
test('a late buffered roll starts at get-up completion without a vulnerable frame', () => {
  const fight = new CombatState(); fight.hit('slam', 35); fight.tick(1.6);
  assert.equal(fight.roll([-1, 0]), false);
  fight.tick(2.0); assert.equal(fight.roll([-1, 0]), true);
  fight.tick(2.15); assert.equal(fight.state, 'rolling'); assert.equal(fight.invulnerable, true);
  assert.deepEqual(fight.rollDirection, [-1, 0]); assert.equal(fight.hit('stomp', 30), false);
});
test('one attack window cannot apply damage twice; a new attack can', () => {
  const fight = new CombatState(); fight.hit('attack:1', 20); fight.tick(2.16);
  assert.equal(fight.hit('attack:1', 20), false); assert.equal(fight.hit('attack:2', 20), true); assert.equal(fight.health, 60);
});
test('death finishes the fall and cannot transition into get-up or rolling', () => {
  const fight = new CombatState(); fight.hit('fatal', 120); assert.equal(fight.health, 0);
  fight.tick(.9); assert.equal(fight.state, 'dead'); fight.tick(100);
  assert.equal(fight.state, 'dead'); assert.equal(fight.roll([0, 1]), false);
  fight.reset(); assert.equal(fight.health, 100); assert.equal(fight.state, 'ready');
});
test('damage windows fall within the authored strike phases', () => {
  for (const [id, attack] of Object.entries(ATTACKS)) {
    const clip = CLIPS.boss.find((clip) => clip.id === id);
    for (const window of attack.windows) {
      assert.ok(window.start >= clip.phases[0]); assert.ok(window.end <= clip.phases[1] + 1e-8); assert.ok(window.start < window.end);
    }
  }
});
test('capsule collision covers crossing sweeps, separated attacks, and zero-length segments', () => {
  const player = { start: [0, .3, 0], end: [0, 1.5, 0], radius: .3 };
  assert.equal(capsulesTouch({ start: [-2, .8, 0], end: [2, .8, 0], radius: .4 }, player), true);
  assert.equal(capsulesTouch({ start: [-2, 3, 0], end: [2, 3, 0], radius: .4 }, player), false);
  assert.equal(segmentDistanceSq([0, 0, 0], [0, 0, 0], [0, 2, 0], [0, 2, 0]), 4);
  assert.equal(segmentDistanceSq([0, 0, 0], [0, 2, 0], [1, 0, 0], [1, 2, 0]), 1);
});
