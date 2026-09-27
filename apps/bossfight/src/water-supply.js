// Game-time resource rules. Returns paid spray seconds so the last partial
// frame cannot clean for longer than the water remaining in the tank.
export const WATER_RULES = Object.freeze({ capacity: 100, showerPerSecond: 6, jetPerSecond: 9, low: 25, refill: 45, respawnSeconds: 12, pickupRadius: 1.2 });
export const BOTTLE_POSITIONS = Object.freeze([[0, 4], [-6, 8], [7, 7], [-10, -2], [10, -5], [1, -11]]);

export class WaterReserve {
  constructor() { this.reset(); }
  reset() { this.amount = WATER_RULES.capacity; }
  get empty() { return this.amount <= 1e-8; }
  get low() { return this.amount <= WATER_RULES.low; }
  consume(mode, seconds, active = true) {
    if (!active || !Number.isFinite(seconds) || seconds <= 0 || this.empty) return 0;
    const rate = mode === 'shower' ? WATER_RULES.showerPerSecond : mode === 'jet' ? WATER_RULES.jetPerSecond : 0;
    if (!rate) return 0;
    const spent = Math.min(this.amount, rate * seconds);
    this.amount = Math.max(0, this.amount - spent);
    if (this.amount < 1e-8) this.amount = 0;
    return spent / rate;
  }
  refill(amount = WATER_RULES.refill) {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const added = Math.min(amount, WATER_RULES.capacity - this.amount);
    this.amount += added;
    return added;
  }
}

export class BottleSupply {
  constructor() { this.reset(); }
  reset() { this.bottles = BOTTLE_POSITIONS.map(([x, z], id) => ({ id, x, z, readyAt: 0 })); }
  available(bottle, now) { return now >= bottle.readyAt; }
  collect(position, now, reserve, canCollect = true) {
    if (!canCollect || !Number.isFinite(now) || now < 0 || reserve.amount >= WATER_RULES.capacity - 1e-8) return null;
    for (const bottle of this.bottles) {
      if (!this.available(bottle, now) || Math.hypot(position.x - bottle.x, position.z - bottle.z) > WATER_RULES.pickupRadius) continue;
      const added = reserve.refill();
      if (added <= 0) return null;
      bottle.readyAt = now + WATER_RULES.respawnSeconds;
      return { ...bottle, added };
    }
    return null;
  }
  nearest(position, now) {
    let nearest = null;
    for (const bottle of this.bottles) {
      if (!this.available(bottle, now)) continue;
      const distance = Math.hypot(position.x - bottle.x, position.z - bottle.z);
      if (!nearest || distance < nearest.distance) nearest = { ...bottle, distance };
    }
    return nearest;
  }
}
