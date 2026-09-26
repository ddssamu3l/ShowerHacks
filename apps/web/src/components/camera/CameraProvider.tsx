"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  createTracking,
  PlacementScrubDetector,
  type TrackingFrame,
  type TrackingPoint,
  type VisionStatus,
} from "@vibecodemaxxing/vision";
import type { BodyPart } from "@vibecodemaxxing/contracts";

const NOSE = 0;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;

export type CameraStatus = "idle" | "starting" | "loading-model" | "ready" | "blocked" | "missing" | "model-failed";

export interface Point {
  x: number;
  y: number;
}

export interface PosePoint extends Point {
  visible: boolean;
}

export interface HandPoint extends Point {
  zone: BodyPart | null;
  /** Scored scrub strength from the vision package, 0..1. */
  intensity: number;
  /** Raw palm speed in image heights per second, for effects only. */
  speed: number;
  tips: Point[];
}

export interface BodyRegion {
  part: BodyPart;
  center: Point;
  outline: Point[];
}

/** Mirrored to match the selfie preview: x = 0 is the left edge of the screen. */
export interface PoseFrame {
  capturedAtMs: number;
  points: PosePoint[] | null;
  tracking: boolean;
  confidence: number;
  bodyX: number | null;
  handsVisible: boolean;
  hands: HandPoint[];
  scrub: number;
  zone: BodyPart | null;
  regions: BodyRegion[];
}

interface CameraContextValue {
  status: CameraStatus;
  stream: MediaStream | null;
  poseRef: MutableRefObject<PoseFrame>;
  request: () => void;
  stop: () => void;
}

const emptyFrame: PoseFrame = {
  capturedAtMs: 0,
  points: null,
  tracking: false,
  confidence: 0,
  bodyX: null,
  handsVisible: false,
  hands: [],
  scrub: 0,
  zone: null,
  regions: [],
};

const errorStatus: Record<Extract<VisionStatus, { state: "error" }>["code"], CameraStatus> = {
  permission_denied: "blocked",
  camera_unavailable: "missing",
  model_failed: "model-failed",
};

const CameraContext = createContext<CameraContextValue | null>(null);

const mirror = (point: Point): Point => ({ x: 1 - point.x, y: point.y });

function toPoseFrame(frame: TrackingFrame, detector: PlacementScrubDetector, previousScrub: number): PoseFrame {
  const motion = detector.process(frame);
  const points = frame.body.landmarks.map((point) =>
    point ? { ...mirror(point), visible: true } : { x: 0, y: 0, visible: false },
  );

  const hands: HandPoint[] = [];
  for (const side of ["left", "right"] as const) {
    const hand = frame.hands[side];
    if (!hand.tracked || !hand.palm) continue;
    const scrub = motion.hands.find((item) => item.side === side);
    hands.push({
      ...mirror(hand.palm),
      zone: scrub?.zone ?? null,
      intensity: scrub?.intensity ?? 0,
      speed: hand.palm.motion?.speed ?? 0,
      tips: Object.values(hand.fingers).flatMap((finger) => (finger.tip ? [mirror(finger.tip)] : [])),
    });
  }

  const best = hands.reduce<HandPoint | null>(
    (top, hand) => (hand.zone && hand.intensity > (top?.intensity ?? 0) ? hand : top),
    null,
  );
  const anchors = [NOSE, LEFT_SHOULDER, RIGHT_SHOULDER]
    .map((index) => frame.body.landmarks[index])
    .filter((point): point is TrackingPoint => point !== null);

  return {
    capturedAtMs: frame.capturedAtMs,
    points,
    tracking: frame.body.tracked,
    confidence: frame.body.confidence,
    bodyX:
      frame.body.tracked && anchors.length
        ? 1 - anchors.reduce((sum, point) => sum + point.x, 0) / anchors.length
        : null,
    handsVisible: hands.length > 0,
    hands,
    scrub: previousScrub + ((best?.intensity ?? 0) - previousScrub) * 0.45,
    zone: best?.zone ?? null,
    regions: frame.body.regions.map((region) => ({
      part: region.part,
      center: mirror(region.center),
      outline: region.outline.map(mirror),
    })),
  };
}

export function CameraProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const poseRef = useRef<PoseFrame>({ ...emptyFrame });
  const sessionRef = useRef(0);
  const teardownRef = useRef<() => void>(() => {});
  const statusRef = useRef(status);
  statusRef.current = status;

  const stop = useCallback(() => {
    sessionRef.current += 1;
    teardownRef.current();
    teardownRef.current = () => {};
    poseRef.current = { ...emptyFrame };
    setStream(null);
    setStatus("idle");
  }, []);

  const request = useCallback(() => {
    if (["starting", "loading-model", "ready"].includes(statusRef.current)) return;
    const session = ++sessionRef.current;
    const current = () => session === sessionRef.current;
    setStatus("starting");

    const video = document.createElement("video");
    const onPlaying = () => {
      if (!current()) return;
      setStream(video.srcObject as MediaStream);
      setStatus((value) => (value === "starting" ? "loading-model" : value));
    };
    video.addEventListener("playing", onPlaying, { once: true });

    const detector = new PlacementScrubDetector();
    const tracker = createTracking({
      maxFrameAgeMs: 600, // slow CPU inference (~300 ms) must still count as a tracked hand
      video,
      onStatus: (next) => {
        if (!current()) return;
        if (next.state === "ready") setStatus("ready");
        if (next.state === "error") {
          setStream(null);
          setStatus(errorStatus[next.code]);
        }
      },
      onFrame: (frame) => {
        if (!current()) return;
        poseRef.current = toPoseFrame(frame, detector, poseRef.current.scrub);
      },
    });

    teardownRef.current = () => {
      video.removeEventListener("playing", onPlaying);
      tracker.stop();
    };
    tracker.start().catch(() => {});
  }, []);

  useEffect(() => () => teardownRef.current(), []);

  const value = useMemo(() => ({ status, stream, poseRef, request, stop }), [status, stream, request, stop]);
  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
}

export function useCamera() {
  const camera = useContext(CameraContext);
  if (!camera) throw new Error("useCamera needs CameraProvider");
  return camera;
}

export function usePoseSnapshot(hz = 10) {
  const { poseRef } = useCamera();
  const [snapshot, setSnapshot] = useState<PoseFrame>(poseRef.current);

  useEffect(() => {
    const timer = window.setInterval(() => setSnapshot(poseRef.current), 1000 / hz);
    return () => window.clearInterval(timer);
  }, [poseRef, hz]);

  return snapshot;
}

export const poseIndex = { NOSE, LEFT_SHOULDER, RIGHT_SHOULDER };
