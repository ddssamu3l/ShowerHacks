import { describe, it, expect } from "vitest";
import {
  applySixSevenSample,
  createSixSeven,
  freezeSixSeven,
  lastSixSevenCall,
  nextSixSevenCall,
  scoreSixSeven,
  sixSevenProgress,
  type SixSevenSample,
  type SixSevenState,
} from "./sixseven";

const both = (t: number, yLeft: number, yRight: number, xLeft = 0.3, xRight = 0.7): SixSevenSample => ({
  capturedAtMs: t,
  hands: [{ side: "left", x: xLeft, y: yLeft }, { side: "right", x: xRight, y: yRight }],
});

/** Feed `cycles` full six-seven cycles at `hz`, sampled at `fps`. Returns beats landed. */
function rock(state: SixSevenState, { cycles = 5, hz = 1, fps = 15, amplitude = 0.08, antiPhase = true, from = 0 } = {}) {
  let beats = 0;
  const frames = Math.round((cycles / hz) * fps);
  for (let i = 0; i <= frames; i++) {
    const t = from + (i / fps) * 1000;
    const s = amplitude * Math.sin(2 * Math.PI * hz * (i / fps));
    const yLeft = 0.5 + s;
    const yRight = antiPhase ? 0.5 - s : 0.5 + s;
    if (applySixSevenSample(state, both(t, yLeft, yRight)) === "beat") beats++;
  }
  return beats;
}

describe("createSixSeven", () => {
  it("derives the target from the turn length", () => {
    expect(createSixSeven({ durationMs: 15_000 }).targetBeats).toBe(24);
    expect(createSixSeven({ durationMs: 10_000 }).targetBeats).toBe(16);
    expect(createSixSeven({ targetBeats: 5 }).targetBeats).toBe(5);
  });
  it("starts at zero", () => {
    const s = createSixSeven({ durationMs: 10_000 });
    expect(s.beats).toBe(0);
    expect(sixSevenProgress(s)).toBe(0);
    expect(lastSixSevenCall(s)).toBeNull();
    expect(nextSixSevenCall(s)).toBe("six");
  });
  it("rejects an empty target", () => {
    expect(() => createSixSeven({ targetBeats: 0 })).toThrow();
  });
});

describe("applySixSevenSample", () => {
  it("counts two beats per anti-phase cycle", () => {
    const s = createSixSeven({ targetBeats: 100 });
    const beats = rock(s, { cycles: 5 });
    expect(beats).toBeGreaterThanOrEqual(9);
    expect(beats).toBeLessThanOrEqual(11);
    expect(s.beats).toBe(beats);
  });

  it("alternates six and seven", () => {
    const s = createSixSeven({ targetBeats: 100 });
    const calls: string[] = [];
    const fps = 15;
    for (let i = 0; i <= 45; i++) {
      const t = (i / fps) * 1000;
      const w = 0.08 * Math.sin(2 * Math.PI * (i / fps));
      if (applySixSevenSample(s, both(t, 0.5 + w, 0.5 - w)) === "beat") calls.push(lastSixSevenCall(s)!);
    }
    expect(calls.length).toBeGreaterThan(3);
    calls.forEach((call, i) => expect(call).toBe(i % 2 === 0 ? "six" : "seven"));
  });

  it("ignores hands moving together", () => {
    const s = createSixSeven({ targetBeats: 100 });
    expect(rock(s, { cycles: 5, antiPhase: false })).toBe(0);
  });

  it("ignores tiny jitter", () => {
    const s = createSixSeven({ targetBeats: 100 });
    expect(rock(s, { cycles: 10, amplitude: 0.015 })).toBe(0);
  });

  it("needs both hands", () => {
    const s = createSixSeven({ targetBeats: 100 });
    for (let i = 0; i <= 45; i++) {
      const w = 0.1 * Math.sin(2 * Math.PI * (i / 15));
      const out = applySixSevenSample(s, { capturedAtMs: (i / 15) * 1000, hands: [{ side: "left", x: 0.3, y: 0.5 + w }] });
      expect(out).toBe("idle");
    }
    expect(s.beats).toBe(0);
  });

  it("ignores two readings of one hand", () => {
    const s = createSixSeven({ targetBeats: 100 });
    for (let i = 0; i <= 45; i++) {
      const w = 0.1 * Math.sin(2 * Math.PI * (i / 15));
      applySixSevenSample(s, both((i / 15) * 1000, 0.5 + w, 0.5 - w, 0.5, 0.52));
    }
    expect(s.beats).toBe(0);
  });

  it("does not draw a swing across a tracking gap", () => {
    const s = createSixSeven({ targetBeats: 100 });
    applySixSevenSample(s, both(0, 0.4, 0.6));
    applySixSevenSample(s, both(66, 0.4, 0.6));
    applySixSevenSample(s, { capturedAtMs: 132, hands: [] }); // hands lost
    // Hands come back with the gap flipped: that is not a beat, it is a new baseline.
    expect(applySixSevenSample(s, both(198, 0.6, 0.4))).toBe("idle");
    expect(s.beats).toBe(0);
  });

  it("rejects out-of-order, future and stale samples", () => {
    const s = createSixSeven({ targetBeats: 100 });
    expect(applySixSevenSample(s, both(1000, 0.5, 0.5))).toBe("idle");
    expect(applySixSevenSample(s, both(900, 0.5, 0.5))).toBe("rejected");
    expect(applySixSevenSample(s, both(1000, 0.5, 0.5))).toBe("rejected");
    expect(applySixSevenSample(s, both(1500, 0.5, 0.5), 1400)).toBe("rejected");
    expect(applySixSevenSample(s, both(1100, 0.5, 0.5), 2000)).toBe("rejected");
    expect(applySixSevenSample(s, both(1200, 0.5, 0.5), 1300)).toBe("idle");
    expect(applySixSevenSample(s, { capturedAtMs: NaN, hands: [] })).toBe("rejected");
  });

  it("tracks streaks and breaks them on a long pause", () => {
    const s = createSixSeven({ targetBeats: 100 });
    rock(s, { cycles: 3 });
    const first = s.streak;
    expect(first).toBe(s.beats);
    expect(s.bestStreak).toBe(first);
    rock(s, { cycles: 1, from: 10_000 });
    expect(s.streak).toBeLessThan(first);
    expect(s.bestStreak).toBe(first);
  });
});

describe("scoring", () => {
  it("progress is beats over target, capped at 1", () => {
    const s = createSixSeven({ targetBeats: 4 });
    rock(s, { cycles: 1 });
    expect(sixSevenProgress(s)).toBeCloseTo(s.beats / 4, 5);
    rock(s, { cycles: 6, from: 2000 });
    expect(sixSevenProgress(s)).toBe(1);
    expect(scoreSixSeven(s)).toBe(100);
  });

  it("freezing stops the count", () => {
    const s = createSixSeven({ targetBeats: 100 });
    rock(s, { cycles: 2 });
    const before = s.beats;
    freezeSixSeven(s);
    expect(rock(s, { cycles: 2, from: 5000 })).toBe(0);
    expect(s.beats).toBe(before);
    expect(applySixSevenSample(s, both(99_999, 0.5, 0.5))).toBe("rejected");
  });
});
