import { describe, it, expect } from "vitest";
import { createFog, applyWipe, advanceFog, freezeFog, clearedFraction, scoreFog, type WipeSample } from "./fog";

function sample(x: number, y: number, t: number, tracking = true): WipeSample {
  return { capturedAtMs: t, points: tracking ? [{ x, y }] : [], tracking };
}

/** Sweep the whole frame in rows, like a mock vision controller would. */
function sweep(fog: ReturnType<typeof createFog>, passes = 1, stepMs = 50) {
  let t = fog.lastSampleAtMs === Number.NEGATIVE_INFINITY ? 0 : fog.lastSampleAtMs;
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0.03; y <= 0.97; y += 0.06) {
      for (let x = 0.03; x <= 0.97; x += 0.03) {
        t += stepMs;
        applyWipe(fog, sample(x, y, t));
      }
      t += stepMs;
      applyWipe(fog, sample(0, 0, t, false)); // lift the hand between rows
    }
  }
}

describe("createFog", () => {
  it("starts fully fogged", () => {
    const fog = createFog();
    expect(fog.cells.length).toBe(32 * 18);
    expect(clearedFraction(fog)).toBe(0);
    expect(scoreFog(fog)).toBe(0);
  });
  it("rejects an empty grid", () => {
    expect(() => createFog({ cols: 0 })).toThrow();
  });
});

describe("applyWipe", () => {
  it("one wipe thins the fog under the hand and nowhere else", () => {
    const fog = createFog();
    applyWipe(fog, sample(0.5, 0.5, 100));
    const center = fog.cells[9 * 32 + 16];
    expect(center).toBeLessThan(1);
    expect(center).toBeGreaterThan(0);
    expect(fog.cells[0]).toBe(1); // top-left corner untouched
    expect(clearedFraction(fog)).toBeGreaterThan(0);
    expect(clearedFraction(fog)).toBeLessThan(0.05);
  });

  it("holding the hand still does not keep wiping", () => {
    const fog = createFog();
    applyWipe(fog, sample(0.5, 0.5, 100));
    const after1 = clearedFraction(fog);
    applyWipe(fog, sample(0.5, 0.5, 200));
    applyWipe(fog, sample(0.502, 0.5, 300)); // jitter below minMoveDistance
    expect(clearedFraction(fog)).toBe(after1);
  });

  it("moving the hand clears more", () => {
    const fog = createFog();
    applyWipe(fog, sample(0.3, 0.5, 100));
    const after1 = clearedFraction(fog);
    applyWipe(fog, sample(0.4, 0.5, 200));
    expect(clearedFraction(fog)).toBeGreaterThan(after1);
  });

  it("repeated passes over the same spot clear it fully", () => {
    const fog = createFog();
    for (let i = 0; i < 6; i++) {
      applyWipe(fog, sample(0.5, 0.5, i * 200 + 100));
      applyWipe(fog, sample(0.55, 0.5, i * 200 + 200));
    }
    expect(fog.cells[9 * 32 + 16]).toBe(0);
  });

  it("a full sweep clears most of the frame, two sweeps clear it all", () => {
    const fog = createFog();
    sweep(fog, 1);
    expect(clearedFraction(fog)).toBeGreaterThan(0.6);
    sweep(fog, 2);
    expect(clearedFraction(fog)).toBeGreaterThan(0.99);
    expect(scoreFog(fog)).toBeGreaterThan(99);
  });

  it("losing tracking resets continuity so a reappearing hand does not draw a line", () => {
    const fog = createFog();
    applyWipe(fog, sample(0.1, 0.5, 100));
    applyWipe(fog, sample(0.1, 0.5, 200, false));
    const before = clearedFraction(fog);
    applyWipe(fog, sample(0.9, 0.5, 300));
    // Only the new spot is wiped, cells between 0.1 and 0.9 stay opaque.
    expect(fog.cells[9 * 32 + 16]).toBe(1);
    expect(clearedFraction(fog)).toBeGreaterThan(before);
  });

  it("ignores out-of-frame and non-finite points", () => {
    const fog = createFog();
    expect(applyWipe(fog, { capturedAtMs: 100, points: [{ x: 1.5, y: 0.5 }, { x: Number.NaN, y: 0 }], tracking: true })).toBe(true);
    expect(clearedFraction(fog)).toBe(0);
  });

  it("rejects out-of-order, duplicate, future and stale samples", () => {
    const fog = createFog();
    expect(applyWipe(fog, sample(0.5, 0.5, 1000), 1050)).toBe(true);
    expect(applyWipe(fog, sample(0.6, 0.5, 1000), 1100)).toBe(false); // duplicate timestamp
    expect(applyWipe(fog, sample(0.6, 0.5, 900), 1100)).toBe(false); // out of order
    expect(applyWipe(fog, sample(0.6, 0.5, 2000), 1100)).toBe(false); // future
    expect(applyWipe(fog, sample(0.6, 0.5, 1100), 1500)).toBe(false); // 400 ms old
    expect(applyWipe(fog, sample(0.6, 0.5, 1200), 1300)).toBe(true);
  });

  it("two hands wipe two spots", () => {
    const fog = createFog();
    applyWipe(fog, { capturedAtMs: 100, points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }], tracking: true });
    expect(fog.cells[9 * 32 + 6]).toBeLessThan(1);
    expect(fog.cells[9 * 32 + 25]).toBeLessThan(1);
    expect(fog.cells[9 * 32 + 16]).toBe(1);
  });

  it("wipes reach the edges of the frame without throwing", () => {
    const fog = createFog();
    applyWipe(fog, sample(0, 0, 100));
    applyWipe(fog, sample(1, 1, 200));
    expect(fog.cells[0]).toBeLessThan(1);
    expect(fog.cells[fog.cells.length - 1]).toBeLessThan(1);
  });
});

describe("advanceFog", () => {
  it("does nothing when refog is off", () => {
    const fog = createFog();
    sweep(fog, 3);
    advanceFog(fog, 0);
    advanceFog(fog, 60_000);
    expect(clearedFraction(fog)).toBeGreaterThan(0.99);
  });

  it("adds fog back over time when enabled, capped at 1", () => {
    const fog = createFog({ refogPerSecond: 0.1 });
    sweep(fog, 3);
    advanceFog(fog, 0);
    advanceFog(fog, 5_000); // +0.5 everywhere
    expect(clearedFraction(fog)).toBeCloseTo(0.5, 1);
    advanceFog(fog, 60_000);
    expect(clearedFraction(fog)).toBe(0);
  });

  it("first call only sets the reference time", () => {
    const fog = createFog({ refogPerSecond: 1 });
    sweep(fog, 3);
    advanceFog(fog, 99_000);
    expect(clearedFraction(fog)).toBeGreaterThan(0.99);
  });
});

describe("freezeFog", () => {
  it("ignores wipes and refog after the deadline", () => {
    const fog = createFog({ refogPerSecond: 1 });
    applyWipe(fog, sample(0.5, 0.5, 100));
    advanceFog(fog, 100);
    const frozenAt = clearedFraction(fog);
    freezeFog(fog);
    expect(applyWipe(fog, sample(0.6, 0.5, 200))).toBe(false);
    advanceFog(fog, 10_000);
    expect(clearedFraction(fog)).toBe(frozenAt);
  });
});
