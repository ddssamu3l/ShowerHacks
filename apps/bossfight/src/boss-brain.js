import { SPELLS, DIVE, diveDestination } from './spell-rules.js';
import { CLIPS } from './motion.js';
import { walkCyclesForDistance } from './boss-walk.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const attackDuration = (id) => SPELLS[id]?.duration ?? CLIPS.boss.find((c) => c.id === id).duration;

// The boss's decisions: facing, walking, attack choice and timing. No rendering, so the
// browser (solo) and the co-op server run the same rules. `branch` is the state the
// frame started in, which is what the renderer poses.
export class BossBrain {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset() {
    Object.assign(this, { state: 'turn', branch: 'turn', time: 0, facing: 0, x: 0, z: -1, attack: 'giant_stomp', attackCount: 0, lastAttack: '',
      startX: 0, startZ: 0, diveX: 0, diveZ: 0, walkCycle: 0, previousWalkCycle: 0, difference: 0, distance: 0 });
  }
  // Advances one frame toward `target` ({x, z}). Returns the new attack when one begins.
  step(dt, target) {
    this.branch = this.state; this.time += dt;
    this.difference = angleDiff(Math.atan2(target.x - this.x, target.z - this.z), this.facing);
    this.distance = Math.hypot(target.x - this.x, target.z - this.z);
    let begun = null;
    if (this.state === 'turn') {
      this.facing += clamp(this.difference, -2.8 * dt, 2.8 * dt);
      if (Math.abs(this.difference) < .04 && this.time > .35) {
        if (this.distance > 5.5 && (this.attackCount === 0 || this.attackCount % 3 === 0)) { this.state = 'approach'; this.time = 0; this.walkCycle = 0; }
        else begun = this.select(target);
      }
    } else if (this.state === 'approach') {
      this.facing += clamp(this.difference, -2.8 * dt, 2.8 * dt);
      const moved = Math.min(dt * (this.distance > 6 ? 5.6 : 4.5), Math.max(0, this.distance - 3.8));
      this.x += Math.sin(this.facing) * moved; this.z += Math.cos(this.facing) * moved;
      this.previousWalkCycle = this.walkCycle; this.walkCycle += walkCyclesForDistance(moved, 5.55);
      if (this.distance <= 3.85 || this.time > 1.3) { this.state = 'turn'; this.time = .35; }
    } else if (this.state === 'attack') {
      if (SPELLS[this.attack] && this.time < SPELLS[this.attack].trackUntil) this.facing += clamp(this.difference, -2.4 * dt, 2.4 * dt);
      if (this.attack === 'jump_slam') {
        if (this.time < DIVE.trackUntil) {
          [this.diveX, , this.diveZ] = diveDestination([this.startX, 0, this.startZ], [target.x, 0, target.z]);
          this.facing = Math.atan2(this.diveX - this.startX, this.diveZ - this.startZ);
        }
        const k = smooth((this.time - DIVE.takeoff) / (DIVE.land - DIVE.takeoff));
        this.x = this.startX + (this.diveX - this.startX) * k; this.z = this.startZ + (this.diveZ - this.startZ) * k;
      } else { this.x = this.startX; this.z = this.startZ; }
      this.x = clamp(this.x, -14.5, 14.5); this.z = clamp(this.z, -14.5, 14.5);
    } else if (this.time > .55) { this.state = 'turn'; this.time = 0; }
    return begun;
  }
  // Ends a finished attack after the frame has been rendered. Returns true when it ended.
  settle() {
    if (this.state !== 'attack' || this.time < attackDuration(this.attack)) return false;
    this.state = 'recover'; this.time = 0; return true;
  }
  select(target) {
    // Spell-heavy rotation; old kicks, swats, fist slams and melee charge are retired.
    let pool = this.distance > 7 ? ['yc_beam', 'agent_swarm', 'jump_slam', 'claude_drop'] : ['yc_beam', 'agent_swarm', 'giant_stomp', 'jump_slam', 'claude_drop'];
    if (this.attackCount === 0) pool = ['agent_swarm']; else if (this.attackCount === 1) pool = ['yc_beam']; else if (this.attackCount === 2) pool = ['giant_stomp']; else if (this.attackCount === 3) pool = ['jump_slam'];
    pool = pool.filter((id) => id !== this.lastAttack);
    this.attack = pool[Math.floor(this.random() * pool.length)]; this.lastAttack = this.attack;
    this.time = 0; this.state = 'attack'; this.startX = this.x; this.startZ = this.z; this.attackCount++;
    if (this.attack === 'jump_slam') [this.diveX, , this.diveZ] = diveDestination([this.startX, 0, this.startZ], [target.x, 0, target.z]);
    return { attack: this.attack, count: this.attackCount, targetX: target.x, targetZ: target.z, facing: this.facing };
  }
}
