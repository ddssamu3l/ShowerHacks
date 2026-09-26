import type { VisionOptions } from "@vibecodemaxxing/contracts";
import type { PlacementFrame } from "./placement";

export const ZONES = ["hair", "chest", "left-arm", "right-arm", "left-pit", "right-pit"] as const;
export type WashZone = typeof ZONES[number];
export const ZONE_LABELS: Record<WashZone, string> = {
  hair: "HAIR", chest: "CHEST", "left-arm": "LEFT ARM", "right-arm": "RIGHT ARM",
  "left-pit": "LEFT PIT", "right-pit": "RIGHT PIT",
};

export interface Landmark { x: number; y: number; z?: number; visibility?: number }
export interface WashEvent {
  zone: WashZone;
  capturedAtMs: number;
  intensity: number;
  confidence: number;
}
export interface ZoneMarker { zone: WashZone; x: number; y: number }
export interface VisionFrame {
  capturedAtMs: number;
  landmarks: Landmark[];
  markers: ZoneMarker[];
  zone: WashZone | null;
  tracking: boolean;
  confidence: number;
  speed: number; // shoulder-widths / second
  intensity: number;
  progress: number;
  scrubbing: boolean;
  inferenceMs?: number;
}
export interface ArcadeVisionOptions extends VisionOptions {
  mode?: "scrub" | "placement";
  onPlacement?: (frame: PlacementFrame) => void;
  onFrame?: (frame: VisionFrame) => void;
  onWash?: (event: WashEvent) => void;
  sensitivity?: number; // 0.6..1.6, higher accepts gentler movement
  assetBase?: string;
  /** Results older than this on arrival are treated as no detection. Default 250 ms; raise for slow CPU inference. */
  maxFrameAgeMs?: number;
}
