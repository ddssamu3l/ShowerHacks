const RENDER_DELAY_MS = 100, BUFFER = 60;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// The server's boss, rendered slightly in the past with interpolation. Produces frames
// shaped like BossBrain (x, z, facing, branch, time, attack, ...) for presentBoss().
export class CoopBoss {
  constructor() { this.reset(); }
  reset() { this.buffer = []; this.attacks = new Map(); this.renderedCount = 0; this.lastState = null; this.lastWalk = 0; }
  push(s, at = performance.now()) { this.buffer.push({ at, s }); if (this.buffer.length > BUFFER) this.buffer.shift(); }
  attackEvent(e) { this.attacks.set(e.count, e); if (this.attacks.size > 16) this.attacks.delete(this.attacks.keys().next().value); }
  view(now) {
    const buffer = this.buffer; if (!buffer.length) return null;
    const at = now - RENDER_DELAY_MS;
    let i = buffer.length - 1; while (i > 0 && buffer[i - 1].at > at) i--;
    const b = buffer[i], a = buffer[i - 1] ?? b, s = b.s, p = a.s;
    const k = a === b || at >= b.at ? 1 : Math.max(0, Math.min(1, (at - a.at) / Math.max(1, b.at - a.at)));
    const sameAction = p.st === s.st && p.a === s.a && p.ac === s.ac;
    const view = {
      x: p.x + (s.x - p.x) * k, z: p.z + (s.z - p.z) * k, facing: lerpAngle(p.f, s.f, k),
      state: s.st, branch: s.st, time: sameAction && s.bt >= p.bt ? p.bt + (s.bt - p.bt) * k : s.bt,
      attack: s.a, attackCount: s.ac, diveX: s.dx, diveZ: s.dz, difference: s.df, distance: 0, target: s.tg,
      walkCycle: sameAction && s.wc >= p.wc ? p.wc + (s.wc - p.wc) * k : s.wc,
      previousWalkCycle: 0, begun: null, ended: false,
    };
    if (view.walkCycle < this.lastWalk) this.lastWalk = view.walkCycle;
    view.previousWalkCycle = this.lastWalk; this.lastWalk = view.walkCycle;
    if (view.state === 'attack' && view.attackCount > this.renderedCount) {
      view.begun = this.attacks.get(view.attackCount) ?? { attack: view.attack, count: view.attackCount, targetX: view.x + Math.sin(view.facing) * 4, targetZ: view.z + Math.cos(view.facing) * 4, facing: view.facing };
      this.renderedCount = view.attackCount;
    }
    view.ended = this.lastState === 'attack' && view.state !== 'attack';
    this.lastState = view.state;
    return view;
  }
}
