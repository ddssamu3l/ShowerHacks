"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { poseIndex, useCamera, type CameraStatus } from "./CameraProvider";

const statusCopy: Record<CameraStatus, string> = {
  idle: "Camera off",
  starting: "Allow the camera when your browser asks",
  "loading-model": "Loading body tracking",
  ready: "",
  blocked: "Camera blocked. Allow it in the address bar, then reload.",
  missing: "No camera found. Plug one in, then reload.",
  "model-failed": "Body tracking didn't load. Check your connection, then reload.",
};

interface CameraViewProps {
  children?: ReactNode;
  className?: string;
  bubbles?: boolean;
  message?: string;
  onBodyX?: (x: number | null) => void;
}

interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  color: string;
}

const bubbleColors = ["255, 255, 255", "0, 153, 255", "212, 77, 240"];

export function CameraMessage({ children }: { children: ReactNode }) {
  return (
    <p className="pointer-events-none absolute inset-0 z-[3] grid place-items-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function CameraView({ children, className, bubbles = false, message: override, onBodyX }: CameraViewProps) {
  const { stream, status, poseRef } = useCamera();
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onBodyXRef = useRef(onBodyX);
  onBodyXRef.current = onBodyX;
  const bubblesOnRef = useRef(bubbles);
  bubblesOnRef.current = bubbles;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const foam: Bubble[] = [];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const drawFoam = (ctx: CanvasRenderingContext2D, dt: number) => {
      for (let index = foam.length - 1; index >= 0; index--) {
        const bubble = foam[index];
        bubble.life -= dt;
        if (bubble.life <= 0) {
          foam.splice(index, 1);
          continue;
        }
        bubble.x += bubble.vx * dt;
        bubble.y += bubble.vy * dt;
        const alpha = Math.min(1, bubble.life / 0.4) * 0.85;
        ctx.strokeStyle = `rgba(${bubble.color}, ${alpha})`;
        ctx.fillStyle = `rgba(${bubble.color}, ${alpha * 0.18})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const nowMs = performance.now();
      const dt = Math.min((nowMs - last) / 1000, 1 / 20);
      last = nowMs;
      const frame = frameRef.current;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!frame || !canvas) return;

      const width = frame.clientWidth;
      const height = frame.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
      if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const pose = poseRef.current;
      const vw = video?.videoWidth || 0;
      const vh = video?.videoHeight || 0;
      if (!pose.points || !vw || !vh) {
        onBodyXRef.current?.(null);
        drawFoam(ctx, dt);
        return;
      }

      const scale = Math.max(width / vw, height / vh);
      const offsetX = (width - vw * scale) / 2;
      const offsetY = (height - vh * scale) / 2;
      const map = (index: number) => {
        const point = pose.points![index];
        return { x: offsetX + point.x * vw * scale, y: offsetY + point.y * vh * scale, visible: point.visible };
      };

      const nose = map(poseIndex.NOSE);
      const left = map(poseIndex.LEFT_SHOULDER);
      const right = map(poseIndex.RIGHT_SHOULDER);
      onBodyXRef.current?.(pose.tracking ? (nose.x + left.x + right.x) / 3 / width : null);

      if (pose.tracking) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const index of [poseIndex.LEFT_WRIST, poseIndex.RIGHT_WRIST]) {
        const wrist = map(index);
        if (!wrist.visible) continue;
        ctx.strokeStyle = "rgba(0, 153, 255, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(wrist.x, wrist.y, 14 + pose.scrub * 10, 0, Math.PI * 2);
        ctx.stroke();

        if (!reduce && bubblesOnRef.current && pose.scrub > 0.15 && foam.length < 140) {
          const spawn = pose.scrub * 3;
          for (let count = 0; count < spawn; count++) {
            if (Math.random() > pose.scrub) continue;
            foam.push({
              x: wrist.x + (Math.random() - 0.5) * 30,
              y: wrist.y + (Math.random() - 0.5) * 20,
              vx: (Math.random() - 0.5) * 40,
              vy: -30 - Math.random() * 60,
              r: 3 + Math.random() * 7,
              life: 0.6 + Math.random() * 0.8,
              color: bubbleColors[Math.floor(Math.random() * bubbleColors.length)],
            });
          }
        }
      }
      drawFoam(ctx, dt);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [poseRef]);

  const message = override ?? statusCopy[status];

  return (
    <div
      className={cn("relative isolate aspect-[3/4] overflow-hidden rounded-[20px] bg-card ring-1 ring-border", className)}
      ref={frameRef}
    >
      {stream && (
        <video ref={videoRef} className="absolute inset-0 size-full -scale-x-100 object-cover" muted playsInline autoPlay />
      )}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[1] size-full" />
      {children}
      {message && <CameraMessage>{message}</CameraMessage>}
    </div>
  );
}
