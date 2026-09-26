"use client";

import { useEffect, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { applyWipe, advanceFog, type FogState, type WipePoint } from "@vibecodemaxxing/game-engine";
import type { PoseFrame } from "../camera/CameraProvider";

/**
 * Fog overlay for the main game's camera frame. Works in display space: the fog
 * grid covers the visible frame, and palms from CameraProvider (already mirrored)
 * are mapped through the same object-cover math CameraView uses. Drag with the
 * mouse to wipe when tracking is unavailable. Practice mode sweeps a synthetic hand.
 */

interface FogLayerProps {
  fog: FogState;
  poseRef: MutableRefObject<PoseFrame>;
  active: boolean;
  practice: boolean;
  onHands?: (count: number) => void;
}

interface Cursor extends WipePoint { angle: number; moving: boolean }

function mockHand(tMs: number): WipePoint {
  const rowPeriod = 1600, rows = 6;
  const row = Math.floor(tMs / rowPeriod) % rows;
  const phase = (tMs % rowPeriod) / rowPeriod;
  const x = row % 2 === 0 ? 0.08 + phase * 0.84 : 0.92 - phase * 0.84;
  const y = 0.12 + row * (0.76 / (rows - 1)) + Math.sin(tMs / 90) * 0.02;
  return { x, y };
}

function toCursors(points: readonly WipePoint[], previous: readonly Cursor[]): Cursor[] {
  return points.map((p, i) => {
    const prev = previous[i];
    if (!prev) return { ...p, angle: -0.35, moving: false };
    const dx = p.x - prev.x, dy = p.y - prev.y;
    const moving = dx * dx + dy * dy > 0.00004;
    const target = moving ? Math.max(-0.7, Math.min(0.7, Math.atan2(dy, dx) * 0.35)) : -0.35;
    return { ...p, angle: prev.angle + (target - prev.angle) * 0.35, moving };
  });
}

export function FogLayer({ fog, poseRef, active, practice, onHands }: FogLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const spongeRef = useRef<HTMLImageElement | null>(null);
  const cursorsRef = useRef<Cursor[]>([]);
  const startRef = useRef(performance.now());
  const lastPointerAt = useRef(0);
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

      // 1. Hands -> wipes.
      let points: WipePoint[] = [];
      if (activeRef.current) {
        advanceFog(fog, now);
        if (practiceRef.current) {
          points = [mockHand(now - startRef.current)];
        } else {
          const pose = poseRef.current;
          const video = canvas.parentElement?.querySelector("video");
          const vw = video?.videoWidth || 0, vh = video?.videoHeight || 0;
          if (vw && vh) {
            const scale = Math.max(width / vw, height / vh);
            const offX = (width - vw * scale) / 2, offY = (height - vh * scale) / 2;
            for (const hand of pose.hands) {
              points.push({ x: (offX + hand.x * vw * scale) / width, y: (offY + hand.y * vh * scale) / height });
            }
          }
        }
        if (points.length > 0 || now - lastPointerAt.current > 300) {
          applyWipe(fog, { capturedAtMs: now, points, tracking: points.length > 0 });
          cursorsRef.current = toCursors(points, cursorsRef.current);
          onHandsRef.current?.(points.length);
        }
      }

      // 2. Draw fog + sponge in display pixels.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      scratchRef.current ??= document.createElement("canvas");
      const scratch = scratchRef.current;
      if (scratch.width !== fog.cols || scratch.height !== fog.rows) { scratch.width = fog.cols; scratch.height = fog.rows; }
      const small = scratch.getContext("2d");
      const ctx = canvas.getContext("2d");
      if (!small || !ctx) return;
      const image = small.createImageData(fog.cols, fog.rows);
      for (let i = 0; i < fog.cells.length; i++) {
        image.data[i * 4] = 208; image.data[i * 4 + 1] = 224; image.data[i * 4 + 2] = 238;
        image.data[i * 4 + 3] = Math.round(fog.cells[i] * 238);
      }
      small.putImageData(image, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.filter = `blur(${Math.max(4, width / 90)}px)`;
      const pad = width / 40;
      ctx.drawImage(scratch, -pad, -pad, width + pad * 2, height + pad * 2);
      ctx.restore();

      const sponge = spongeRef.current;
      for (const c of cursorsRef.current) {
        const cx = c.x * width, cy = c.y * height;
        if (sponge && sponge.complete && sponge.naturalWidth > 0) {
          const size = Math.max(72, width / 7);
          const wobble = c.moving ? Math.sin(now / 60) * 0.12 : 0;
          const squash = c.moving ? 1 + Math.sin(now / 60) * 0.06 : 1;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(c.angle + wobble);
          ctx.scale(squash, 1 / squash);
          ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
          ctx.drawImage(sponge, -size / 2, -size / 2, size, size);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, 16, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(0,153,255,.95)"; ctx.lineWidth = 3; ctx.stroke();
        }
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [fog, poseRef]);

  const pointerWipe = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current || event.buttons === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const p = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
    lastPointerAt.current = performance.now();
    applyWipe(fog, { capturedAtMs: lastPointerAt.current, points: [p], tracking: true });
    cursorsRef.current = toCursors([p], cursorsRef.current);
    onHandsRef.current?.(1);
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
