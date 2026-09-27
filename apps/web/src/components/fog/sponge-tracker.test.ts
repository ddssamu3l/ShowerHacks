import { describe, it, expect } from "vitest";
import { SpongeTracker } from "./sponge-tracker";

describe("SpongeTracker", () => {
  it("glides toward the sample instead of jumping", () => {
    const t = new SpongeTracker();
    t.observe("left", 0.2, 0.5, 1000, 1000);
    t.update(1000);
    t.observe("left", 0.6, 0.5, 1300, 1300); // 300 ms later, 0.4 to the right
    const first = t.update(1316)[0];
    expect(first.x).toBeGreaterThan(0.2);
    expect(first.x).toBeLessThan(0.6);
    let last = first;
    for (let now = 1332; now <= 1600; now += 16) last = t.update(now)[0];
    expect(last.x).toBeGreaterThan(0.55);
  });

  it("leads a moving hand ahead of the stale sample", () => {
    const t = new SpongeTracker();
    t.observe("left", 0.2, 0.5, 1000, 1000);
    t.observe("left", 0.4, 0.5, 1250, 1250); // 0.8 units/s to the right
    let c = t.update(1250)[0];
    for (let now = 1266; now <= 1550; now += 16) c = t.update(now)[0];
    // 300 ms after the sample the target is 0.4 + 0.8 * 0.3 * 0.8 = 0.592; the sponge should be well past 0.4.
    expect(c.x).toBeGreaterThan(0.5);
    expect(c.moving).toBe(true);
  });

  it("snaps after a long gap instead of gliding across the frame", () => {
    const t = new SpongeTracker();
    t.observe("left", 0.1, 0.5, 1000, 1000);
    t.update(1000);
    t.observe("left", 0.9, 0.5, 3000, 3000); // 2 s gap
    const c = t.update(3016)[0];
    expect(c.x).toBeCloseTo(0.9, 1);
  });

  it("keeps a hand for a moment after it vanishes, then drops it", () => {
    const t = new SpongeTracker();
    t.observe("left", 0.5, 0.5, 1000, 1000);
    expect(t.update(1500)).toHaveLength(1);
    expect(t.update(1800)).toHaveLength(0);
  });

  it("direct cursors follow exactly", () => {
    const t = new SpongeTracker();
    t.place("mouse", 0.3, 0.3, 1000);
    t.place("mouse", 0.7, 0.7, 1016);
    const c = t.update(1016)[0];
    expect(c.x).toBe(0.7);
    expect(c.y).toBe(0.7);
  });
});
