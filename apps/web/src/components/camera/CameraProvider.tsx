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
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

const MEDIAPIPE_VERSION = "1.0.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const NOSE = 0;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;

export type CameraStatus = "idle" | "starting" | "loading-model" | "ready" | "blocked" | "missing" | "model-failed";

export interface PosePoint {
  x: number;
  y: number;
  visible: boolean;
}

export interface PoseFrame {
  capturedAtMs: number;
  points: PosePoint[] | null;
  tracking: boolean;
  handsVisible: boolean;
  scrub: number;
}

interface CameraContextValue {
  status: CameraStatus;
  stream: MediaStream | null;
  poseRef: MutableRefObject<PoseFrame>;
  request: () => void;
  stop: () => void;
}

const emptyFrame: PoseFrame = { capturedAtMs: 0, points: null, tracking: false, handsVisible: false, scrub: 0 };

const CameraContext = createContext<CameraContextValue | null>(null);

function distance(a: PosePoint, b: PosePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
    setStatus("starting");

    void (async () => {
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
      } catch (error) {
        if (session !== sessionRef.current) return;
        const name = error instanceof DOMException ? error.name : "";
        setStatus(name === "NotFoundError" || name === "OverconstrainedError" ? "missing" : "blocked");
        return;
      }
      if (session !== sessionRef.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = media;
      void video.play().catch(() => {});

      let landmarker: PoseLandmarker | null = null;
      let raf = 0;
      teardownRef.current = () => {
        cancelAnimationFrame(raf);
        landmarker?.close();
        video.pause();
        video.srcObject = null;
        media.getTracks().forEach((track) => track.stop());
      };
      setStream(media);
      setStatus("loading-model");

      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
        landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      } catch {
        if (session === sessionRef.current) setStatus("model-failed");
        return;
      }
      if (session !== sessionRef.current) {
        landmarker.close();
        return;
      }
      setStatus("ready");

      let lastVideoTime = -1;
      let lastWrists: { left: PosePoint; right: PosePoint; at: number } | null = null;
      let scrub = 0;

      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;
        const capturedAtMs = performance.now();
        const result = landmarker.detectForVideo(video, capturedAtMs);
        const raw = result.landmarks[0];

        if (!raw) {
          scrub *= 0.8;
          lastWrists = null;
          poseRef.current = { capturedAtMs, points: null, tracking: false, handsVisible: false, scrub };
          return;
        }

        const points = raw.map((point) => ({ x: 1 - point.x, y: point.y, visible: (point.visibility ?? 0) > 0.5 }));
        const tracking = points[NOSE].visible && points[LEFT_SHOULDER].visible && points[RIGHT_SHOULDER].visible;
        const left = points[LEFT_WRIST];
        const right = points[RIGHT_WRIST];
        const handsVisible = left.visible || right.visible;

        let target = 0;
        const shoulderWidth = Math.max(distance(points[LEFT_SHOULDER], points[RIGHT_SHOULDER]), 0.05);
        if (lastWrists && handsVisible) {
          const dt = Math.max((capturedAtMs - lastWrists.at) / 1000, 1 / 120);
          const moves: number[] = [];
          if (left.visible) moves.push(distance(left, lastWrists.left));
          if (right.visible) moves.push(distance(right, lastWrists.right));
          const speed = moves.reduce((sum, move) => sum + move, 0) / moves.length / dt / shoulderWidth;
          target = Math.min(1, speed / 2.5);
        }
        scrub += (target - scrub) * 0.2;
        lastWrists = { left, right, at: capturedAtMs };
        poseRef.current = { capturedAtMs, points, tracking, handsVisible, scrub };
      };
      loop();
    })();
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

export const poseIndex = { NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_WRIST, RIGHT_WRIST };
