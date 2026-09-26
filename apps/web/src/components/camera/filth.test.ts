import { describe, it, expect } from "vitest";
import { createFilth, filthAverage, scrubFilth } from "./filth";
import type { HandPoint } from "./CameraProvider";

const map = (p: { x: number; y: number }) => ({ x: p.x * 1280, y: p.y * 720 });
const hand = (x: number, y: number, extra: Partial<HandPoint> = {}): HandPoint => ({ x, y, side: "left", zone: null, intensity: 0, speed: 0, tips: [], ...extra });
const nose = { x: 0.5, y: 0.35 };

describe("head-only filth on a slow tracker", () => {
  it("is fully filthy from the start, before any body region is seen", () => {
    const f = createFilth(["hair", "face"]);
    expect(filthAverage(f)).toBe(1);
    expect([...f.level.keys()].sort()).toEqual(["face", "hair"]);
  });

  it("a hand moving near the nose washes the head even with no zone from the tracker", () => {
    const f = createFilth(["hair", "face"]);
    // 3 fps: sightings 330 ms apart, palm sweeping across the forehead.
    scrubFilth(f, [hand(0.42, 0.3)], 0.33, 1000, map, nose);
    scrubFilth(f, [hand(0.58, 0.3)], 0.33, 1330, map, nose);
    scrubFilth(f, [hand(0.42, 0.3)], 0.33, 1660, map, nose);
    expect(filthAverage(f)).toBeLessThan(0.9);
  });

  it("a hand far from the head does nothing", () => {
    const f = createFilth(["hair", "face"]);
    scrubFilth(f, [hand(0.2, 0.9)], 0.33, 1000, map, nose);
    scrubFilth(f, [hand(0.8, 0.9)], 0.33, 1330, map, nose);
    expect(filthAverage(f)).toBe(1);
  });

  it("a still hand on the head does nothing", () => {
    const f = createFilth(["hair", "face"]);
    for (let i = 0; i < 6; i++) scrubFilth(f, [hand(0.5, 0.3)], 0.33, 1000 + i * 330, map, nose);
    expect(filthAverage(f)).toBe(1);
  });

  it("scored scrubbing from the tracker still cleans at full rate", () => {
    const f = createFilth(["hair", "face"]);
    scrubFilth(f, [hand(0.5, 0.3, { zone: "hair", intensity: 1 })], 1, 1000, map, null);
    expect(filthAverage(f)).toBeCloseTo(1 - 0.22, 2);
  });
});
