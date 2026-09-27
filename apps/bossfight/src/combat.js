// Prototype timing inspired by the requested Souls combat rules. These values
// are authored for our clips, not claimed frame data from a particular title.
export const PLAYER_COMBAT = { health: 100, rollDuration: .8, rollInvulnerability: .42, knockdownDuration: .9, getupDuration: 1.25, rollBuffer: .18 };
export const ATTACKS = {
  sweep: { damage: 24, windows: [{ start: .75, end: 1.08, bones: ['RightForeArm', 'RightHand'], radius: .48 }] },
  slam: { damage: 35, windows: [{ start: .99, end: 1.15, bones: ['LeftHand', 'RightHand'], radius: .68 }] },
  kick: { damage: 25, windows: [{ start: .70, end: .92, bones: ['RightFoot', 'RightToeBase'], radius: .50 }] },
  stomp: { damage: 30, windows: [{ start: .85, end: .98, bones: ['RightFoot', 'RightToeBase'], radius: .62 }] },
  charge: { damage: 27, windows: [1.05, 1.45, 1.85].map((at, i) => ({ start: at - .08, end: at + .08, bones: [i % 2 ? 'LeftFoot' : 'RightFoot', i % 2 ? 'LeftToeBase' : 'RightToeBase'], radius: .62 })) },
  jump_slam: { damage: 40, windows: [{ start: 1.36, end: 1.60, bones: ['Spine2', 'LeftHand'], radius: .8 }, { start: 1.36, end: 1.60, bones: ['Spine2', 'RightHand'], radius: .8 }] },
};

export class CombatState {
  constructor() { this.reset(); }
  reset() { this.health = PLAYER_COMBAT.health; this.state = 'ready'; this.stateAt = 0; this.now = 0; this.bufferedRoll = null; this.rollDirection = [0, 1]; this.hits = new Set(); this.lastHit = null; }
  get elapsed() { return this.now - this.stateAt; }
  get invulnerable() { return ['knockedDown', 'gettingUp', 'dead'].includes(this.state) || (this.state === 'rolling' && this.elapsed < PLAYER_COMBAT.rollInvulnerability); }
  get canMove() { return this.state === 'ready'; }
  startRoll(direction) { this.state = 'rolling'; this.stateAt = this.now; this.rollDirection = [...direction]; this.bufferedRoll = null; }
  roll(direction) {
    if (this.state === 'ready') { this.startRoll(direction); return true; }
    if (this.state === 'gettingUp' && this.elapsed >= PLAYER_COMBAT.getupDuration - PLAYER_COMBAT.rollBuffer) { this.bufferedRoll = [...direction]; return true; }
    return false;
  }
  tick(now) {
    if (!Number.isFinite(now) || now < this.now) throw new Error('Combat clock must be monotonic');
    this.now = now;
    // Carry the exact transition deadline forward even on a late frame.
    for (let i = 0; i < 4; i++) {
      const duration = this.state === 'rolling' ? PLAYER_COMBAT.rollDuration : this.state === 'knockedDown' ? PLAYER_COMBAT.knockdownDuration : this.state === 'gettingUp' ? PLAYER_COMBAT.getupDuration : Infinity;
      if (this.elapsed < duration) break;
      this.stateAt += duration;
      if (this.state === 'knockedDown') this.state = this.health <= 0 ? 'dead' : 'gettingUp';
      else if (this.state === 'gettingUp' && this.bufferedRoll) { this.state = 'rolling'; this.rollDirection = this.bufferedRoll; this.bufferedRoll = null; }
      else this.state = 'ready';
    }
  }
  hit(id, damage) {
    if (this.invulnerable || this.hits.has(id) || !Number.isFinite(damage) || damage <= 0) return false;
    this.hits.add(id); if (this.hits.size > 64) this.hits.delete(this.hits.values().next().value);
    this.health = Math.max(0, this.health - damage); this.state = 'knockedDown'; this.stateAt = this.now;
    this.bufferedRoll = null; this.lastHit = { id, at: this.now, damage }; return true;
  }
}

// Squared distance between two finite line segments. Used for a swept attack
// capsule versus the player's upright hurt capsule, including parallel cases.
export function segmentDistanceSq(p1, q1, p2, q2) {
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) return dot(r, r);
  if (a <= 1e-9) t = clamp(f / e);
  else {
    const c = dot(d1, r);
    if (e <= 1e-9) s = clamp(-c / a);
    else {
      const b = dot(d1, d2), denominator = a * e - b * b;
      s = denominator > 1e-9 ? clamp((b * f - c * e) / denominator) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a); }
    }
  }
  const difference = r.map((v, i) => v + s * d1[i] - t * d2[i]);
  return dot(difference, difference);
}
export function capsulesTouch(a, b) { return segmentDistanceSq(a.start, a.end, b.start, b.end) <= (a.radius + b.radius) ** 2; }
