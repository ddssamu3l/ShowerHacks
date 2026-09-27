"use client";

import { useEffect, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { applyWipe, advanceFog, type FogState, type WipePoint } from "@vibecodemaxxing/game-engine";
import type { PoseFrame } from "../camera/CameraProvider";
import { SpongeTracker, type SpongeCursor } from "./sponge-tracker";

/**
 * Fog overlay for the main game's camera frame. Works in display space: the fog
 * grid covers the visible frame, and palms from CameraProvider (already mirrored)
 * are mapped through the same object-cover math CameraView uses.
 *
 * The sponge is driven by SpongeTracker: tracker samples arrive 3-20 times a second,
 * the sponge glides toward a velocity-predicted target every render frame, and the
 * wipe follows the sponge. Drag with the mouse to wipe when tracking is unavailable.
 * Practice mode sweeps a synthetic hand.
 */

interface FogLayerProps {
  fog: FogState;
  poseRef: MutableRefObject<PoseFrame>;
  active: boolean;
  practice: boolean;
  onHands?: (count: number) => void;
}

/** Wipes are applied at this cadence so each step moves more than the engine's minimum distance. */
const WIPE_EVERY_MS = 40;

function mockHand(tMs: number): WipePoint {
  const rowPeriod = 1600, rows = 6;
  const row = Math.floor(tMs / rowPeriod) % rows;
  const phase = (tMs % rowPeriod) / rowPeriod;
  const x = row % 2 === 0 ? 0.08 + phase * 0.84 : 0.92 - phase * 0.84;
  const y = 0.12 + row * (0.76 / (rows - 1)) + Math.sin(tMs / 90) * 0.02;
  return { x, y };
}

/** Blur the fog grid once per change into an offscreen canvas at display size. */
function renderFogImage(target: HTMLCanvasElement, scratch: HTMLCanvasElement, fog: FogState, width: number, height: number) {
  if (target.width !== width || target.height !== height) { target.width = width; target.height = height; }
  if (scratch.width !== fog.cols || scratch.height !== fog.rows) { scratch.width = fog.cols; scratch.height = fog.rows; }
  const small = scratch.getContext("2d");
  const ctx = target.getContext("2d");
  if (!small || !ctx) return;
  const image = small.createImageData(fog.cols, fog.rows);
  for (let i = 0; i < fog.cells.length; i++) {
    image.data[i * 4] = 208; image.data[i * 4 + 1] = 224; image.data[i * 4 + 2] = 238;
    image.data[i * 4 + 3] = Math.round(fog.cells[i] * 238);
  }
  small.putImageData(image, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.filter = `blur(${Math.max(4, width / 90)}px)`;
  const pad = width / 40;
  ctx.drawImage(scratch, -pad, -pad, width + pad * 2, height + pad * 2);
  ctx.restore();
}

function drawSponges(ctx: CanvasRenderingContext2D, cursors: readonly SpongeCursor[], sponge: HTMLImageElement | null, width: number, height: number, now: number) {
  for (const c of cursors) {
    const cx = c.x * width, cy = c.y * height;
    if (sponge && sponge.complete && sponge.naturalWidth > 0) {
      const size = Math.max(72, width / 7);
      const wobble = c.moving ? Math.sin(now / 60) * 0.12 : 0;
      const squash = c.moving ? 1 + Math.sin(now / 60) * 0.06 : 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(c.angle + wobble);
      ctx.scale(squash, 1 / squash);
      ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
      ctx.drawImage(sponge, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,153,255,.95)"; ctx.lineWidth = 3; ctx.stroke();
    }
  }
}

export function FogLayer({ fog, poseRef, active, practice, onHands }: FogLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const fogImageRef = useRef<HTMLCanvasElement | null>(null);
  const fogImageVersion = useRef(-1);
  const spongeRef = useRef<HTMLImageElement | null>(null);
  const trackerRef = useRef(new SpongeTracker());
  const startRef = useRef(performance.now());
  const lastPoseAt = useRef(-Infinity);
  const lastWipeAt = useRef(-Infinity);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onHandsRef = useRef(onHands);
  onHandsRef.current = onHands;
  const activeRef = useRef(active);
  activeRef.current = active;
  const practiceRef = useRef(practice);
  practiceRef.current = practice;

  useEffect(() => {
    const image = new Image();
    image.src = "/fog/sponge.png";
    spongeRef.current = image;
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const now = performance.now();
      const tracker = trackerRef.current;

      // 1. Feed the sponge tracker.
      if (activeRef.current) {
        advanceFog(fog, now);
        if (practiceRef.current) {
          const p = mockHand(now - startRef.current);
          tracker.place("mock", p.x, p.y, now);
        } else {
          const pose = poseRef.current;
          if (pose.capturedAtMs !== lastPoseAt.current) {
            lastPoseAt.current = pose.capturedAtMs;
            videoRef.current ??= canvas.parentElement?.querySelector("video") ?? null;
            const video = videoRef.current;
            const vw = video?.videoWidth || 0, vh = video?.videoHeight || 0;
            if (vw && vh) {
              const scale = Math.max(width / vw, height / vh);
              const offX = (width - vw * scale) / 2, offY = (height - vh * scale) / 2;
              for (const hand of pose.hands) {
                tracker.observe(hand.side ?? "hand", (offX + hand.x * vw * scale) / width, (offY + hand.y * vh * scale) / height, pose.capturedAtMs, now);
              }
            }
          }
        }
      }

      // 2. Glide the sponges and wipe under them at a fixed cadence.
      const cursors = tracker.update(now);
      if (activeRef.current && now - lastWipeAt.current >= WIPE_EVERY_MS) {
        lastWipeAt.current = now;
        applyWipe(fog, { capturedAtMs: now, points: cursors.map(({ x, y }) => ({ x, y })), tracking: cursors.length > 0 });
        onHandsRef.current?.(cursors.length);
      }

      // 3. Draw: cached blurred fog + sponges.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; fogImageVersion.current = -1; }
      scratchRef.current ??= document.createElement("canvas");
      fogImageRef.current ??= document.createElement("canvas");
      if (fogImageVersion.current !== fog.version) {
        renderFogImage(fogImageRef.current, scratchRef.current, fog, pw, ph);
        fogImageVersion.current = fog.version;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pw, ph);
      ctx.drawImage(fogImageRef.current, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSponges(ctx, cursors, spongeRef.current, width, height, now);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [fog, poseRef]);

  const pointerWipe = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current || event.buttons === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const p = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
    trackerRef.current.place("mouse", p.x, p.y, performance.now());
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[2] size-full cursor-crosshair touch-none"
      aria-label="Fog overlay"
      onPointerDown={pointerWipe}
      onPointerMove={pointerWipe}
    />
  );
}
