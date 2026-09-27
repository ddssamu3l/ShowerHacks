import test from 'node:test';
import assert from 'node:assert/strict';
import { BossBrain, attackDuration } from '../src/boss-brain.js';
import { Fight, COOP, seededRandom } from '../server/fight.mjs';
import { PartyServer } from '../server/party.mjs';
import { loadBossSurface } from '../server/surface.mjs';
import { WATER_RULES, BOTTLE_POSITIONS } from '../src/water-supply.js';

const surface = await loadBossSurface();

function runBrain(brain, target, seconds, dt = 1 / 60) {
  const attacks = [];
  for (let t = 0; t < seconds; t += dt) { const begun = brain.step(dt, target); if (begun) attacks.push(begun); brain.settle(); }
  return attacks;
}

test('boss brain opens Swarm, YC, Stomp, Superman, then never repeats an attack back to back', () => {
  const brain = new BossBrain(seededRandom(1));
  const attacks = runBrain(brain, { x: 0, z: 4 }, 90).map((a) => a.attack);
  assert.deepEqual(attacks.slice(0, 4), ['agent_swarm', 'yc_beam', 'giant_stomp', 'jump_slam']);
  assert.ok(attacks.length > 12, `only ${attacks.length} attacks in 90 s`);
  for (let i = 1; i < attacks.length; i++) assert.notEqual(attacks[i], attacks[i - 1]);
});

test('boss brain walks toward a distant target, stays in the arena, and attacks last their full duration', () => {
  const brain = new BossBrain(seededRandom(2));
  const far = { x: 12, z: 12 }; let walked = false;
  for (let i = 0; i < 60 * 3; i++) { brain.step(1 / 60, far); brain.settle(); walked ||= brain.state === 'approach'; }
  assert.ok(walked, 'boss approached a far target');
  assert.ok(Math.hypot(brain.x - 12, brain.z - 12) < Math.hypot(0 - 12, -1 - 12), 'boss got closer');
  const b = new BossBrain(seededRandom(3)); let begun = null, frames = 0;
  while (!begun) { begun = b.step(1 / 60, { x: 0, z: 3 }); b.settle(); }
  while (b.state === 'attack') { b.step(1 / 60, { x: 0, z: 3 }); b.settle(); frames++; }
  assert.ok(Math.abs(frames / 60 - attackDuration(begun.attack)) < 2 / 60, `attack lasted ${frames / 60}s`);
  const clamp = new BossBrain(() => .99); runBrain(clamp, { x: 40, z: 40 }, 60);
  assert.ok(Math.abs(clamp.x) <= 14.5 + 1e-9 && Math.abs(clamp.z) <= 14.5 + 1e-9 || clamp.state === 'approach');
});

function fight(count = 2, random = seededRandom(9)) {
  const sent = []; let now = 0;
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const f = new Fight({ players, surface, now, random, send: (m) => sent.push(m) });
  const at = (ms) => { now = ms; f.tick(now); return now; };
  return { f, sent, at, players, get now() { return now; } };
}
const state = (x, z, h = 100, f = 'ready') => ({ p: [x, 0, z], r: 0, c: 'ready', t: 0, h, f, w: null });
// A brush on the boss's chest in rest-pose model space.
const vertex = 1234, stroke = (dt = .05, m = 'jet') => ({ p: [surface.positions[vertex * 3], surface.positions[vertex * 3 + 1], surface.positions[vertex * 3 + 2]], n: [surface.normals[vertex * 3], surface.normals[vertex * 3 + 1], surface.normals[vertex * 3 + 2]], r: .2, m, dt });

test('each extra washer makes the same spray clean proportionally less (2x and 3x boss)', () => {
  const cleaned = [1, 2, 3].map((count) => {
    const { f, at } = fight(count); at(COOP.countdownMs + 5000);
    for (let i = 0; i < 5; i++) f.paint('p0', stroke(.05), COOP.countdownMs + 5000);
    assert.ok(f.clean.groups.every((g) => g.clean < 1), 'stay below saturation so exposure is linear');
    return f.clean.cleanedArea;
  });
  assert.ok(cleaned[0] > 0);
  assert.ok(Math.abs(cleaned[1] - cleaned[0] / 2) / cleaned[0] < .02, `2 players: ${cleaned[1]} vs ${cleaned[0] / 2}`);
  assert.ok(Math.abs(cleaned[2] - cleaned[0] / 3) / cleaned[0] < .02, `3 players: ${cleaned[2]} vs ${cleaned[0] / 3}`);
});

test('strokes are validated and cannot outpace real time', () => {
  const { f, at } = fight(1); const start = COOP.countdownMs;
  f.paint('p0', stroke(), start - 1); assert.equal(f.clean.cleanedArea, 0, 'no cleaning during the countdown');
  at(start + 1000);
  for (const bad of [{ ...stroke(), r: 5 }, { ...stroke(), dt: 3 }, { ...stroke(), m: 'laser' }, { ...stroke(), p: [NaN, 0, 0] }, { ...stroke(), n: [9, 0, 0] }]) f.paint('p0', bad, start + 1000);
  assert.equal(f.clean.cleanedArea, 0, 'invalid strokes do nothing');
  for (let i = 0; i < 200; i++) f.paint('p0', stroke(.25), start + 1000);
  assert.ok(f.players.get('p0').paint <= 1 * COOP.paintAllowance + .5 + 1e-9, 'paid seconds capped by elapsed time');
});

test('clean updates are batched to all players and a 90% clean ends the fight as a win', () => {
  const { f, sent, at } = fight(1); let t = at(COOP.countdownMs + 100);
  f.paint('p0', stroke(), t); at(t += 100);
  const update = sent.find((m) => m.type === 'clean');
  assert.ok(update.g.length > 0 && update.g.length === update.c.length && update.s < 1);
  for (const g of f.clean.groups) g.clean = 1;
  f.clean.cleanedArea = f.clean.totalArea * .95;
  f.paint('p0', stroke(), t);
  const end = sent.find((m) => m.type === 'end');
  assert.equal(end.won, true); assert.equal(end.players[0].id, 'p0');
  const bossCount = sent.filter((m) => m.type === 'boss').length; at(t + 1000);
  assert.equal(sent.filter((m) => m.type === 'boss').length, bossCount, 'the boss stops after the end');
});

test('the boss targets the closest living player, sometimes the last cleaner, and ignores the fallen', () => {
  const { f, at } = fight(3, () => .99);
  f.state('p0', state(0, 3)); f.state('p1', state(10, 10)); f.state('p2', state(-14, 12));
  at(COOP.countdownMs + 50);
  assert.equal(f.targetId, 'p0');
  f.state('p0', state(0, 3, 0, 'dead'));
  at(COOP.countdownMs + 100);
  assert.equal(f.targetId, 'p1', 'a fallen target is replaced by the next closest');
  const g = fight(2, () => .1); g.f.state('p0', state(0, 3)); g.f.state('p1', state(12, 12)); g.f.lastCleaner = 'p1';
  g.at(COOP.countdownMs + 50);
  assert.equal(g.f.targetId, 'p1', 'last cleaner chosen when the roll is under 30%');
});

test('the run is lost only when every present player has fallen; leavers do not count', () => {
  const { f, sent, at } = fight(3); at(COOP.countdownMs + 50);
  f.state('p0', state(0, 3, 0, 'dead')); f.state('p1', state(1, 3, 0, 'dead'));
  assert.equal(sent.some((m) => m.type === 'end'), false, 'p2 has not reported yet');
  f.state('p2', state(2, 3));
  assert.equal(sent.some((m) => m.type === 'end'), false);
  f.remove('p2');
  const end = sent.find((m) => m.type === 'end');
  assert.equal(end?.won, false);
});

test('bottles are shared: first come first served, then they respawn', () => {
  const { f, sent, at } = fight(2); const t = at(COOP.countdownMs + 100);
  const [bx, bz] = BOTTLE_POSITIONS[0];
  f.state('p0', state(bx, bz)); f.state('p1', state(bx + .5, bz));
  f.pickup('p0', 0, t); f.pickup('p1', 0, t);
  const grants = sent.filter((m) => m.type === 'bottle');
  assert.deepEqual(grants.map((m) => m.by), ['p0']);
  assert.equal(grants[0].respawn, WATER_RULES.respawnSeconds);
  f.pickup('p1', 0, t + WATER_RULES.respawnSeconds * 1000);
  assert.deepEqual(sent.filter((m) => m.type === 'bottle').map((m) => m.by), ['p0', 'p1']);
  f.state('p0', state(bx + 9, bz)); f.pickup('p0', 1, t);
  assert.equal(sent.filter((m) => m.type === 'bottle').length, 2, 'too far from that bottle');
});

test('rooms run the fight: start announces the cleaning layout, ticks stream the boss, leaving ends it', () => {
  let clock = 0; const party = new PartyServer({ surface, now: () => clock, random: () => .5 });
  const client = () => { const inbox = []; const c = party.connect((m) => inbox.push(m)); c.inbox = inbox; c.say = (m) => party.message(c, JSON.stringify(m)); return c; };
  const a = client(), b = client(); a.say({ type: 'create', name: 'Ana' });
  b.say({ type: 'join', code: a.inbox.find((m) => m.type === 'room').room.code, name: 'Ben' });
  a.say({ type: 'start' });
  const start = a.inbox.find((m) => m.type === 'start');
  assert.equal(start.groups, party.rooms.values().next().value.sim.clean.groups.length);
  a.say({ type: 'state', s: state(0, 4) }); b.say({ type: 'state', s: state(2, 5) });
  for (clock = 0; clock <= COOP.countdownMs + 2000; clock += 33) party.tick(clock);
  assert.ok(b.inbox.filter((m) => m.type === 'boss').length > 50);
  a.say({ type: 'paint', ...stroke() });
  party.tick(clock += 100);
  assert.ok(b.inbox.some((m) => m.type === 'clean'), 'cleaning reaches teammates');
  a.say({ type: 'back' }); b.say({ type: 'back' });
  assert.equal(party.rooms.values().next().value.sim, null, 'fight discarded when everyone is back');
});
