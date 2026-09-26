import type { ActivityContext, ActivitySample } from "@vibecodemaxxing/contracts";
import type { ScrubTarget } from "./scrub-motion";
import { ActivityScoreWindow } from "./activity-score";

export const CHALLENGE_TARGETS: readonly ScrubTarget[] = ["chest", "hair", "left-arm", "right-shoulder", "right-pit", "left-shoulder", "right-arm", "left-pit"];
export const TARGET_LABELS: Record<ScrubTarget, string> = {
  hair: "Head", chest: "Chest & sides", "left-arm": "Left upper arm", "right-arm": "Right upper arm",
  "left-shoulder": "Left shoulder", "right-shoulder": "Right shoulder", "left-pit": "Left armpit", "right-pit": "Right armpit",
};
export const TARGET_HINTS: Record<ScrubTarget, string> = {
  hair: "Scrub the top or sides of your head.", chest: "Rub your chest or the sides of your torso.",
  "left-arm": "Use your right hand on your left upper arm.", "right-arm": "Use your left hand on your right upper arm.",
  "left-shoulder": "Rub your left shoulder with either hand.", "right-shoulder": "Rub your right shoulder with either hand.",
  "left-pit": "Raise your left arm. Scrub with your right hand.", "right-pit": "Raise your right arm. Scrub with your left hand.",
};
export const DEFAULT_ROUND_MS = 3000;
export const COMBO_QUALITY = .35;
export interface ChallengeRound {
  target: ScrubTarget; quality: number; coverage: number; points: number;
  multiplier: number; success: boolean; combo: number; endedAtMs: number;
}
export interface ChallengeSnapshot {
  phase: "countdown" | "active" | "finished";
  target: ScrubTarget | null; nextTarget: ScrubTarget | null;
  roundIndex: number; totalRounds: number; durationMs: number;
  remainingMs: number; quality: number; coverage: number; liveIntensity: number;
  score: number; roundPoints: number; multiplier: number; combo: number; bestCombo: number;
  results: ChallengeRound[];
}

/** Standalone prototype engine. Absolute deadlines; no camera or React dependencies. */
export class ScrubChallenge {
  private window: ActivityScoreWindow;
  private results: ChallengeRound[] = [];
  private combo = 0;
  private bestCombo = 0;
  private score = 0;
  private lastNow = -Infinity;
  private targets: ScrubTarget[];
  constructor(readonly startAtMs: number, readonly durationMs = DEFAULT_ROUND_MS, targets: readonly ScrubTarget[] = CHALLENGE_TARGETS) {
    if (!Number.isFinite(startAtMs) || !Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 30_000 || !targets.length || targets.some(target => !CHALLENGE_TARGETS.includes(target))) throw new Error("Invalid scrub challenge configuration.");
    this.targets = [...targets];
    this.window = this.makeWindow();
  }
  private get roundStart() { return this.startAtMs + this.results.length * this.durationMs; }
  private get multiplier() { return Math.min(2.5, 1 + this.combo * .25); }
  private makeWindow() {
    return new ActivityScoreWindow({ activityId: "scrub", targetId: this.targets[this.results.length] ?? null, startAtMs: this.roundStart, endAtMs: this.roundStart + this.durationMs });
  }
  getContext(): ActivityContext {
    return { targetId: this.targets[this.results.length] ?? null, windowStartedAtMs: this.roundStart, windowEndsAtMs: this.roundStart + this.durationMs };
  }
  private advance(now: number) {
    if (!Number.isFinite(now)) throw new Error("Challenge time must be finite.");
    this.lastNow = Math.max(this.lastNow, now);
    while (this.results.length < this.targets.length && this.lastNow >= this.roundStart + this.durationMs) {
      const endedAtMs = this.roundStart + this.durationMs;
      const { averageEfficiency: quality, activeCoverage: coverage } = this.window.snapshot(endedAtMs);
      const multiplier = this.multiplier, points = Math.round(1000 * quality * multiplier);
      const success = quality + 1e-9 >= COMBO_QUALITY;
      this.combo = success ? this.combo + 1 : 0;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.score += points;
      this.results.push({ target: this.targets[this.results.length], quality, coverage, points, multiplier, success, combo: this.combo, endedAtMs });
      // Neither motion nor a held score from the previous target carries into a new round.
      this.window = this.makeWindow();
    }
  }
  ingest(sample: ActivitySample, now: number): boolean {
    this.advance(now);
    if (this.results.length === this.targets.length || now < this.startAtMs) return false;
    return this.window.ingest(sample, now);
  }
  tick(now: number): ChallengeSnapshot {
    this.advance(now);
    const finished = this.results.length === this.targets.length;
    const countdown = this.lastNow < this.startAtMs;
    const { averageEfficiency: quality, activeCoverage: coverage, liveEfficiency } = this.window.snapshot(this.lastNow);
    return {
      phase: finished ? "finished" : countdown ? "countdown" : "active",
      target: finished ? null : this.targets[this.results.length], nextTarget: this.targets[this.results.length + 1] ?? null,
      roundIndex: this.results.length, totalRounds: this.targets.length, durationMs: this.durationMs,
      remainingMs: finished ? 0 : countdown ? this.startAtMs - this.lastNow : this.roundStart + this.durationMs - this.lastNow,
      quality, coverage, liveIntensity: liveEfficiency,
      score: this.score, roundPoints: Math.round(1000 * quality * this.multiplier), multiplier: this.multiplier,
      combo: this.combo, bestCombo: this.bestCombo, results: this.results.map(result => ({ ...result })),
    };
  }
}
