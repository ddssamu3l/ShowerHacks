import { describe, it, expect } from "vitest";
import { TYPING_SCORING, type KeystrokeEvent } from "@vibecodemaxxing/contracts";
import { scoreTyping, diffChars, liveAccuracy, levenshtein, parTimeMs, timeLimitMs } from "./typing";

// 38 code points. Par at 40 wpm = 11.4 s, limit = 3x par = 34.2 s, decay ~8.77 pts/s.
const PROMPT = "Refactor the auth module and add tests";

function run(submitted: string, durationMs: number, keystrokes?: KeystrokeEvent[]) {
  return scoreTyping({ target: PROMPT, submitted, durationMs, keystrokes });
}

function keys(text: string, gapMs = 100): KeystrokeEvent[] {
  return Array.from(text).map((key, i) => ({ key, atMs: i * gapMs }));
}

describe("levenshtein", () => {
  it("is 0 for equal input", () => {
    expect(levenshtein(["a", "b"], ["a", "b"])).toBe(0);
  });
  it("counts insert, delete, substitute", () => {
    expect(levenshtein(Array.from("kitten"), Array.from("sitting"))).toBe(3);
    expect(levenshtein([], Array.from("abc"))).toBe(3);
    expect(levenshtein(Array.from("abc"), [])).toBe(3);
  });
  it("works on code points, not UTF-16 units", () => {
    expect(levenshtein(Array.from("a😀b"), Array.from("ab"))).toBe(1);
  });
});

describe("time limit", () => {
  it("40 wpm on 38 chars is 11.4 s par, 34.2 s limit", () => {
    expect(parTimeMs(38, 40)).toBeCloseTo(11_400, 0);
    expect(timeLimitMs(38)).toBeCloseTo(34_200, 0);
  });
  it("returns 0 for non-positive wpm", () => {
    expect(parTimeMs(38, 0)).toBe(0);
  });
});

describe("scoreTyping: speed", () => {
  it("instant perfect typing gives full points and score 100", () => {
    const r = run(PROMPT, 0);
    expect(r.speed).toBe(1);
    expect(r.speedPoints).toBe(TYPING_SCORING.maxSpeedPoints);
    expect(r.accuracyPoints).toBe(TYPING_SCORING.maxAccuracyPoints);
    expect(r.penaltyPoints).toBe(0);
    expect(r.score).toBe(100);
    expect(r.timeLimitMs).toBeCloseTo(34_200, 0);
  });

  it("speed points drop linearly every second", () => {
    const at10 = run(PROMPT, 10_000).speedPoints;
    const at20 = run(PROMPT, 20_000).speedPoints;
    expect(at10).toBeCloseTo(212.3, 0);
    expect(at20).toBeCloseTo(124.6, 0);
    expect(at10 - at20).toBeCloseTo(87.7, 0);
  });

  it("speed hits zero at the limit and stays there", () => {
    expect(run(PROMPT, 34_200).speedPoints).toBe(0);
    const r = run(PROMPT, 90_000);
    expect(r.speedPoints).toBe(0);
    expect(r.score).toBe(40); // accuracy only: 200 / 500
    expect(r.notes.some((n) => n.startsWith("Over the"))).toBe(true);
  });

  it("limit scales with prompt length", () => {
    const short = scoreTyping({ target: "fix bug", submitted: "fix bug", durationMs: 5000 });
    const long = scoreTyping({ target: PROMPT + " " + PROMPT, submitted: PROMPT + " " + PROMPT, durationMs: 5000 });
    expect(short.timeLimitMs).toBeLessThan(long.timeLimitMs);
    expect(short.speedPoints).toBeLessThan(long.speedPoints);
  });

  it("tolerates negative or non-finite durations", () => {
    expect(run(PROMPT, -5).durationMs).toBe(0);
    expect(run(PROMPT, Number.NaN).durationMs).toBe(0);
  });

  it("honors a custom config", () => {
    const r = scoreTyping({ target: PROMPT, submitted: PROMPT, durationMs: 15_000 }, { ...TYPING_SCORING, parWpm: 20, timeLimitFactor: 1 });
    // par at 20 wpm = 22.8 s, limit = 22.8 s -> 15 s leaves 34% speed
    expect(r.timeLimitMs).toBeCloseTo(22_800, 0);
    expect(r.speed).toBeCloseTo(0.342, 2);
  });
});

describe("scoreTyping: accuracy and penalties", () => {
  it("compares exactly: case and whitespace count", () => {
    expect(run("refactor the auth module and add tests", 0).errors).toBe(1);
    expect(run("Refactor  the auth module and add tests", 0).errors).toBe(1);
  });

  it("typos are squared in accuracy and also cost a flat penalty", () => {
    // 2 subs -> accuracy 36/38 = 0.947 -> squared 0.8975 -> 179.5 pts, penalty 2 * 5
    const r = run("Refactor the auht module and add tests", 0);
    expect(r.errors).toBe(2);
    expect(r.accuracyPoints).toBeCloseTo(179.5, 1);
    expect(r.penaltyPoints).toBe(10);
    expect(r.score).toBeCloseTo((300 + 179.5 - 10) / 5, 1);
    expect(r.notes).toContain("2 typos");
  });

  it("over-long garbage floors accuracy at zero", () => {
    const r = run("x".repeat(200), 0);
    expect(r.accuracy).toBe(0);
    expect(r.accuracyPoints).toBe(0);
  });

  it("empty submission has zero accuracy", () => {
    expect(run("", 0).accuracy).toBe(0);
  });

  it("counts backspaces as corrections and gaps over 2 s as long pauses", () => {
    const log: KeystrokeEvent[] = [
      { key: "R", atMs: 0 },
      { key: "Backspace", atMs: 3_000 },
      { key: "Backspace", atMs: 3_100 },
      { key: "R", atMs: 6_000 },
    ];
    const r = run(PROMPT, 0, log);
    expect(r.longPauses).toBe(2);
    expect(r.corrections).toBe(2);
    expect(r.penaltyPoints).toBe(2 * 15 + 2 * 3);
    expect(r.score).toBeCloseTo((500 - 36) / 5, 5);
    expect(r.notes).toContain("2 long pauses");
    expect(r.notes).toContain("2 corrections");
  });

  it("no keystroke log means no pause or correction penalties", () => {
    const r = run(PROMPT, 30_000);
    expect(r.longPauses).toBe(0);
    expect(r.corrections).toBe(0);
  });

  it("steady typing has no long pauses", () => {
    expect(run(PROMPT, 3_800, keys(PROMPT, 100)).longPauses).toBe(0);
  });

  it("caps the penalty and never goes below zero", () => {
    const awful: KeystrokeEvent[] = Array.from({ length: 60 }, (_, i) => ({ key: "Backspace", atMs: i * 5_000 }));
    const r = run("", 300_000, awful);
    expect(r.penaltyPoints).toBe(150);
    expect(r.score).toBe(0);
  });
});

describe("diffChars", () => {
  it("marks a perfect match all correct", () => {
    expect(diffChars("abc", "abc").map((c) => c.state)).toEqual(["correct", "correct", "correct"]);
  });
  it("marks a substitution as wrong", () => {
    const d = diffChars("abc", "axc");
    expect(d.map((c) => c.state)).toEqual(["correct", "wrong", "correct"]);
    expect(d[1].char).toBe("x");
  });
  it("a dropped letter does not poison the rest of the line", () => {
    const states = diffChars("hello world", "helo world").map((c) => c.state);
    expect(states.filter((s) => s === "missing")).toHaveLength(1);
    expect(states.filter((s) => s === "correct")).toHaveLength(10);
  });
  it("marks extra characters", () => {
    expect(diffChars("ab", "abc")[2]).toEqual({ char: "c", state: "extra" });
  });
});

describe("liveAccuracy", () => {
  it("is 1 before typing starts", () => {
    expect(liveAccuracy(PROMPT, "")).toBe(1);
  });
  it("only compares the prefix typed so far", () => {
    expect(liveAccuracy(PROMPT, "Refactor")).toBe(1);
    expect(liveAccuracy(PROMPT, "Refactr")).toBeLessThan(1);
  });
});
