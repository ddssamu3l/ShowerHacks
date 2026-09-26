import type { ActivitySample, ActivityWindowConfig, ActivityWindowScore } from "@vibecodemaxxing/contracts";

export const ACTIVITY_SAMPLE_TTL_MS = 250;
export class ActivityScoreWindow {
  private samples: ActivitySample[] = [];
  private config: ActivityWindowConfig;
  constructor(config: ActivityWindowConfig) {
    if (!config.activityId || !Number.isFinite(config.startAtMs) || !Number.isFinite(config.endAtMs) || config.endAtMs <= config.startAtMs || (config.maxPoints !== undefined && (!Number.isFinite(config.maxPoints) || config.maxPoints < 0))) throw new Error("Invalid activity scoring window.");
    this.config = { ...config };
  }
  ingest(sample: ActivitySample, receivedAtMs: number): boolean {
    const { startAtMs, endAtMs, activityId, targetId } = this.config, at = sample.capturedAtMs;
    if (!Number.isFinite(receivedAtMs) || sample.schemaVersion !== 1 || sample.activityId !== activityId || sample.targetId !== targetId || typeof sample.tracking !== "boolean" || !Number.isFinite(at) || at < startAtMs || at >= endAtMs || at > receivedAtMs || receivedAtMs >= endAtMs || receivedAtMs - at > ACTIVITY_SAMPLE_TTL_MS || at <= (this.samples.at(-1)?.capturedAtMs ?? -Infinity) || ![sample.efficiency, sample.confidence].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return false;
    this.samples.push({ ...sample });
    return true;
  }
  snapshot(now: number): ActivityWindowScore {
    if (!Number.isFinite(now)) throw new Error("Activity score time must be finite.");
    const { startAtMs, endAtMs } = this.config, until = Math.min(endAtMs, now);
    let weighted = 0, tracked = 0, active = 0;
    for (let i = 0; i < this.samples.length; i++) {
      const sample = this.samples[i];
      const end = Math.min(until, this.samples[i + 1]?.capturedAtMs ?? until, sample.capturedAtMs + ACTIVITY_SAMPLE_TTL_MS);
      const ms = Math.max(0, end - sample.capturedAtMs);
      if (!sample.tracking || sample.confidence < .5) continue;
      weighted += ms * sample.efficiency; tracked += ms;
      if (sample.efficiency > 0) active += ms;
    }
    const last = this.samples.at(-1), duration = endAtMs - startAtMs;
    const averageEfficiency = weighted / duration;
    return { averageEfficiency, basePoints: Math.round(averageEfficiency * (this.config.maxPoints ?? 1000)), trackingCoverage: tracked / duration, activeCoverage: active / duration,
      liveEfficiency: last && now >= last.capturedAtMs && now < endAtMs && now - last.capturedAtMs < ACTIVITY_SAMPLE_TTL_MS && last.tracking && last.confidence >= .5 ? last.efficiency : 0 };
  }
}
