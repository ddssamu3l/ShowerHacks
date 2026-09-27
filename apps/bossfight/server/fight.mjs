import { BossBrain } from '../src/boss-brain.js';
import { CleaningSurface } from '../src/cleaning.js';
import { BOTTLE_POSITIONS, WATER_RULES } from '../src/water-supply.js';

export const COOP = Object.freeze({
  countdownMs: 3000, cleanBroadcastMs: 66, maxStrokeSeconds: .25, maxBrushRadius: .3,
  lastCleanerChance: .3, pickupReach: 2.5, paintAllowance: 1.2,
});
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const vec3 = (v, limit) => Array.isArray(v) && v.length === 3 && v.every((x) => finite(x) && Math.abs(x) <= limit);

export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// One co-op fight: the server-side boss, shared cleaning, shared bottles and the result.
// Players report their own position, health and cleaning strokes; everything else is decided here.
export class Fight {
  constructor({ players, surface, now, random = Math.random, send }) {
    this.random = random; this.send = send; this.startAt = now + COOP.countdownMs; this.lastTick = this.startAt;
    this.players = new Map(players.map((p) => [p.id, { id: p.id, name: p.name, x: 0, z: 7, alive: true, reported: false, present: true, cleaned: 0, paint: 0 }]));
    this.scale = 1 / players.length;
    this.brain = new BossBrain(random);
    this.clean = new CleaningSurface(surface.positions, surface.normals, surface.indices);
    this.groupIndex = new Map(this.clean.groups.map((g, i) => [g, i]));
    this.dirty = new Set(); this.lastClean = 0;
    this.bottles = BOTTLE_POSITIONS.map(([x, z], id) => ({ id, x, z, readyAt: 0 }));
    this.targetId = null; this.lastCleaner = null; this.ended = false;
  }
  get living() { return [...this.players.values()].filter((p) => p.present && p.alive); }

  state(id, s) {
    const p = this.players.get(id); if (!p || this.ended) return;
    p.x = s.p[0]; p.z = s.p[2]; p.reported = true; p.alive = s.h > 0 && s.f !== 'dead';
    if (!p.alive && this.targetId === id) this.targetId = null;
    this.checkLoss();
  }
  remove(id) {
    const p = this.players.get(id); if (!p) return;
    p.present = false; if (this.targetId === id) this.targetId = null;
    this.checkLoss();
  }
  rejoin(id) { const p = this.players.get(id); if (p && !this.ended) p.present = true; }
  checkLoss() {
    const present = [...this.players.values()].filter((p) => p.present);
    if (!this.ended && present.length && present.every((p) => p.reported && !p.alive)) this.end(false, this.lastTick);
  }

  paint(id, msg, now) {
    const p = this.players.get(id);
    if (!p || !p.present || !p.alive || this.ended || now < this.startAt) return;
    const rate = msg.m === 'jet' ? 1.5 : msg.m === 'shower' ? .95 : 0;
    if (!rate || !vec3(msg.p, 3) || !vec3(msg.n, 1.01) || !finite(msg.r) || msg.r <= 0 || msg.r > COOP.maxBrushRadius || !finite(msg.dt) || msg.dt <= 0 || msg.dt > COOP.maxStrokeSeconds) return;
    // Spraying cannot outpace real time (small allowance for network bunching).
    const allowed = (now - this.startAt) / 1000 * COOP.paintAllowance + .5;
    if (p.paint + msg.dt > allowed) return;
    p.paint += msg.dt;
    const before = this.clean.cleanedArea;
    for (const group of this.clean.paint(msg.p, msg.n, msg.r, rate * this.scale, msg.dt)) this.dirty.add(this.groupIndex.get(group));
    const gained = this.clean.cleanedArea - before;
    if (gained > 0) { p.cleaned += gained; this.lastCleaner = id; }
    if (this.clean.won) { this.flushClean(); this.end(true, now); }
  }
  pickup(id, bottleId, now) {
    const p = this.players.get(id), bottle = this.bottles[bottleId];
    if (!p || !p.present || !p.alive || !bottle || this.ended || now < this.startAt || now < bottle.readyAt) return;
    if (Math.hypot(p.x - bottle.x, p.z - bottle.z) > COOP.pickupReach) return;
    bottle.readyAt = now + WATER_RULES.respawnSeconds * 1000;
    this.send({ type: 'bottle', id: bottle.id, by: id, respawn: WATER_RULES.respawnSeconds });
  }

  chooseTarget() {
    const living = this.living.filter((p) => p.reported);
    if (!living.length) return null;
    const cleaner = living.find((p) => p.id === this.lastCleaner);
    if (cleaner && living.length > 1 && this.random() < COOP.lastCleanerChance) return cleaner.id;
    const b = this.brain;
    return living.reduce((best, p) => Math.hypot(p.x - b.x, p.z - b.z) < Math.hypot(best.x - b.x, best.z - b.z) ? p : best).id;
  }
  tick(now) {
    if (this.ended || now < this.startAt) return;
    const dt = Math.min(.1, (now - this.lastTick) / 1000); this.lastTick = now;
    if (dt <= 0) return;
    const b = this.brain, before = b.state;
    if (!this.targetId || (b.state === 'turn' && this.retarget)) { this.targetId = this.chooseTarget(); this.retarget = false; }
    const target = this.players.get(this.targetId);
    if (target) {
      const begun = b.step(dt, target);
      if (begun) this.send({ type: 'attack', ...begun, target: target.id });
      if (b.settle()) this.retarget = true;
    }
    if (before === 'recover' && b.state === 'turn') this.retarget = true;
    this.send({ type: 'boss', s: { x: b.x, z: b.z, f: b.facing, st: b.state, bt: b.time, a: b.attack, ac: b.attackCount, dx: b.diveX, dz: b.diveZ, wc: b.walkCycle, df: b.difference, tg: this.targetId } });
    if (now - this.lastClean >= COOP.cleanBroadcastMs) this.flushClean(now);
  }
  flushClean(now = this.lastTick) {
    this.lastClean = now;
    if (!this.dirty.size) return;
    const g = [...this.dirty], c = g.map((i) => Math.round(this.clean.groups[i].clean * 1e4) / 1e4);
    this.dirty.clear();
    this.send({ type: 'clean', g, c, s: this.clean.stink });
  }
  end(won, now) {
    if (this.ended) return;
    this.ended = true;
    const total = [...this.players.values()].reduce((sum, p) => sum + p.cleaned, 0) || 1;
    this.send({ type: 'end', won, stink: this.clean.stink, seconds: Math.max(0, (now - this.startAt) / 1000),
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, share: p.cleaned / total })) });
  }
}
