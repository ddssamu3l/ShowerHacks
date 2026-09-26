"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { poseIndex, useCamera, type CameraStatus, type Point } from "./CameraProvider";
import { createFilth, drawFilth, filthAverage, scrubFilth } from "./filth";

const statusCopy: Record<CameraStatus, string> = {
  idle: "Camera off",
  starting: "Allow the camera when your browser asks",
  "loading-model": "Loading body tracking",
  ready: "",
  blocked: "Camera blocked. Allow it in the address bar, then reload.",
  missing: "No camera found. Plug one in, then reload.",
  "model-failed": "Body tracking didn't load. Reload the page to try again.",
};

interface CameraViewProps {
  children?: ReactNode;
  className?: string;
  bubbles?: boolean;
  /** Cover the player in filth that scrubbing under the water cleans off. */
  dirty?: boolean;
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

const bubbleColors = ["255, 255, 255", "0, 153, 255"];

export function CameraMessage({ children }: { children: ReactNode }) {
  return (
    <p className="pointer-events-none absolute inset-0 z-[3] grid place-items-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function CameraView({ children, className, bubbles = false, dirty = false, message: override, onBodyX }: CameraViewProps) {
  const { stream, status, poseRef } = useCamera();
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onBodyXRef = useRef(onBodyX);
  onBodyXRef.current = onBodyX;
  const bubblesOnRef = useRef(bubbles);
  bubblesOnRef.current = bubbles;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const filthRef = useRef(createFilth());
  const [filthy, setFilthy] = useState<number | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setInterval(() => {
      const filth = filthRef.current;
      setFilthy(filth.revealAt === null ? null : filthAverage(filth));
    }, 200);
    return () => window.clearInterval(timer);
  }, [dirty]);

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
      if (!vw || !vh) {
        onBodyXRef.current?.(null);
        drawFoam(ctx, dt);
        return;
      }

      const scale = Math.max(width / vw, height / vh);
      const offsetX = (width - vw * scale) / 2;
      const offsetY = (height - vh * scale) / 2;
      const map = (point: Point) => ({ x: offsetX + point.x * vw * scale, y: offsetY + point.y * vh * scale });

      onBodyXRef.current?.(pose.bodyX === null ? null : map({ x: pose.bodyX, y: 0 }).x / width);

      if (dirtyRef.current) {
        if (bubblesOnRef.current) scrubFilth(filthRef.current, pose.hands ?? [], dt, nowMs, map);
        drawFilth(ctx, filthRef.current, pose.regions, map, nowMs, reduce);
      }

      if (!pose.points) {
        drawFoam(ctx, dt);
        return;
      }

      const left = pose.points[poseIndex.LEFT_SHOULDER];
      const right = pose.points[poseIndex.RIGHT_SHOULDER];
      if (pose.tracking && left.visible && right.visible) {
        const a = map(left);
        const b = map(right);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const hand of pose.hands) {
        const palm = map(hand);
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        for (const tip of hand.tips) {
          const mapped = map(tip);
          ctx.beginPath();
          ctx.arc(mapped.x, mapped.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = "rgba(0, 153, 255, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        const lather = Math.max(hand.intensity, Math.min(1, hand.speed / 1.2));
        ctx.arc(palm.x, palm.y, 14 + lather * 10, 0, Math.PI * 2);
        ctx.stroke();

        if (!reduce && bubblesOnRef.current && lather > 0.15 && foam.length < 160) {
          const spawn = lather * 3;
          for (let count = 0; count < spawn; count++) {
            if (Math.random() > lather) continue;
            foam.push({
              x: palm.x + (Math.random() - 0.5) * 30,
              y: palm.y + (Math.random() - 0.5) * 20,
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
      {dirty && filthy !== null && (
        <span className="absolute top-3 left-3 z-[2] rounded-full bg-black/60 px-3 py-1 text-[13px] font-medium text-white tabular-nums backdrop-blur-md">
          {filthy > 0.005 ? `\u{1F4A9} ${Math.ceil(filthy * 100)}% filthy` : "\u2728 Squeaky clean"}
        </span>
      )}
      {message && <CameraMessage>{message}</CameraMessage>}
    </div>
  );
}
