"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Camera, Hand, RotateCcw, Play as PlayIcon } from "lucide-react";
import { createTracking, type TrackingController, type TrackingFrame, type VisionStatus } from "@vibecodemaxxing/vision";
import { HAND_JOINTS, POSE_JOINTS, type TrackedHand } from "@vibecodemaxxing/contracts";
import { createFogActivity, scoreFog, clearedFraction, type FogActivity, type FogState, type WipePoint } from "@vibecodemaxxing/game-engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "../fx/AnimatedNumber";
import { CameraMessage } from "../camera/CameraView";

type Mode = "camera" | "mock";
type Phase = "idle" | "wiping" | "done";

const ROUND_OPTIONS = [10, 15, 20, 30];
const MOCK_SIZE = { w: 960, h: 720 };

const statusCopy: Record<VisionStatus["state"], string> = {
  idle: "Camera off",
  initializing: "Allow the camera when your browser asks",
  ready: "",
  stopped: "Camera off",
  error: "",
};

interface Cursor extends WipePoint { angle: number; moving: boolean }

/** Synthetic hand that sweeps the frame row by row, for practice without a camera. */
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

/** Fog cells plus the sponge, drawn in source (camera) pixel space. The canvas is CSS-mirrored like the video. */
function drawFog(canvas: HTMLCanvasElement, scratch: HTMLCanvasElement, fog: FogState, width: number, height: number, hands: readonly Cursor[], sponge: HTMLImageElement | null, tMs: number) {
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
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

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.filter = `blur(${Math.max(4, width / 90)}px)`;
  const pad = width / 40;
  ctx.drawImage(scratch, -pad, -pad, width + pad * 2, height + pad * 2);
  ctx.restore();

  for (const p of hands) {
    const cx = p.x * width, cy = p.y * height;
    if (sponge && sponge.complete && sponge.naturalWidth > 0) {
      const size = Math.max(72, width / 7);
      const wobble = p.moving ? Math.sin(tMs / 60) * 0.12 : 0;
      const squash = p.moving ? 1 + Math.sin(tMs / 60) * 0.06 : 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(p.angle + wobble);
      ctx.scale(squash, 1 / squash);
      ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
      ctx.drawImage(sponge, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(14, width / 40), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,153,255,.95)"; ctx.lineWidth = 3; ctx.stroke();
    }
  }
}

function Meter({ label, value, onSpotlight }: { label: string; value: number; onSpotlight?: boolean }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="grid gap-1.5">
      <div className={cn("flex justify-between text-[13px] tabular-nums", onSpotlight ? "text-white/85" : "text-muted-foreground")}>
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <Progress value={percent} className={cn("h-2", onSpotlight && "bg-white/20")} indicatorClassName={cn("duration-150 ease-linear", onSpotlight ? "bg-white" : "bg-signal")} />
    </div>
  );
}

export function FogWipe() {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const spongeRef = useRef<HTMLImageElement | null>(null);
  const trackerRef = useRef<TrackingController | null>(null);
  const activityRef = useRef<FogActivity>(createFogActivity());
  const cursorsRef = useRef<Cursor[]>([]);
  const windowRef = useRef<{ startAtMs: number; endAtMs: number } | null>(null);
  const session = useRef(0);
  const mockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameTimes = useRef<number[]>([]);
  const lastPointerAt = useRef(0);

  const [mode, setMode] = useState<Mode>("camera");
  const [status, setStatus] = useState<VisionStatus>({ state: "idle" });
  const [phase, setPhase] = useState<Phase>("idle");
  const [roundSec, setRoundSec] = useState(15);
  const [hardMode, setHardMode] = useState(false);
  const [cleared, setCleared] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [fps, setFps] = useState(0);
  const [inferenceMs, setInferenceMs] = useState<number | undefined>();
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const cameraReady = status.state === "ready" && mode === "camera";
  const initializing = status.state === "initializing";
  const wiping = phase === "wiping";
  const practice = mode === "mock";

  useEffect(() => {
    const image = new Image();
    image.src = "/fog/sponge.png";
    spongeRef.current = image;
  }, []);

  // One frame handler for the tracker; ref so the effect below doesn't restart the camera.
  const onFrame = useCallback((frame: TrackingFrame) => {
    const now = performance.now();
    const times = frameTimes.current;
    times.push(now);
    while (times.length && now - times[0] > 1000) times.shift();
    setFps(times.length);
    setInferenceMs(frame.inferenceMs);

    const activity = activityRef.current;
    const window = windowRef.current;
    if (window && phase === "wiping") {
      activity.evaluate(frame, { targetId: null, windowStartedAtMs: window.startAtMs, windowEndsAtMs: window.endAtMs });
      // Keep the mouse sponge on screen while the tracker sees no hand.
      if (activity.hands.length > 0 || now - lastPointerAt.current > 300) {
        cursorsRef.current = toCursors(activity.hands, cursorsRef.current);
        setTracking(activity.hands.length > 0);
      }
    } else {
      const palms = [frame.hands.left, frame.hands.right].filter((h) => h.tracked && h.palm).map((h) => ({ x: h.palm!.x, y: h.palm!.y }));
      cursorsRef.current = toCursors(palms, cursorsRef.current);
      setTracking(palms.length > 0);
    }
  }, [phase]);
  const onFrameRef = useRef(onFrame);
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);

  const startCamera = useCallback(async () => {
    const generation = ++session.current;
    trackerRef.current?.stop();
    if (!videoRef.current) return;
    setMode("camera");
    setStatus({ state: "initializing" });
    const tracker = createTracking({
      video: videoRef.current,
      maxFrameAgeMs: 600, // CPU inference can take ~300 ms per frame; a late hand still wipes.
      onStatus: (value) => { if (generation === session.current) setStatus(value); },
      onFrame: (frame) => { if (generation === session.current) onFrameRef.current(frame); },
    });
    trackerRef.current = tracker;
    try { await tracker.start(); } catch (error) {
      if (generation !== session.current) return;
      setStatus((previous) => previous.state === "error" ? previous : { state: "error", code: "model_failed", message: error instanceof Error ? error.message : "Unable to start tracking." });
    }
  }, []);

  // Camera on page open. Cleanup handles StrictMode's double mount.
  useEffect(() => {
    void startCamera();
    return () => { session.current++; trackerRef.current?.stop(); trackerRef.current = null; if (mockTimer.current) clearInterval(mockTimer.current); };
  }, [startCamera]);

  // Draw loop and round clock.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const activity = activityRef.current;
      const window = windowRef.current;
      if (phase === "wiping" && window) {
        const left = Math.max(0, window.endAtMs - now);
        setRemainingMs(left);
        if (left <= 0) {
          // Deadline: freeze via a final evaluate-free path and read the score.
          activity.fog.frozen = true;
          setFinalScore(scoreFog(activity.fog));
          setPhase("done");
        }
      }
      setCleared(clearedFraction(activity.fog));

      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas) return;
      scratchRef.current ??= document.createElement("canvas");
      const useVideo = mode === "camera" && video && video.videoWidth > 0;
      const w = useVideo ? video.videoWidth : MOCK_SIZE.w;
      const h = useVideo ? video.videoHeight : MOCK_SIZE.h;
      drawFog(canvas, scratchRef.current, activity.fog, w, h, phase === "idle" ? [] : cursorsRef.current, spongeRef.current, now);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, mode]);

  const startRound = useCallback((nextMode: Mode) => {
    const now = performance.now();
    activityRef.current = createFogActivity({ refogPerSecond: hardMode ? 0.03 : 0 });
    windowRef.current = { startAtMs: now, endAtMs: now + roundSec * 1000 };
    cursorsRef.current = [];
    setFinalScore(null); setCleared(0); setRemainingMs(roundSec * 1000);
    setMode(nextMode);
    if (nextMode === "mock") {
      session.current++;
      trackerRef.current?.stop(); trackerRef.current = null;
      setStatus({ state: "ready" });
      if (mockTimer.current) clearInterval(mockTimer.current);
      mockTimer.current = setInterval(() => {
        const t = performance.now();
        const win = windowRef.current;
        if (!win) return;
        const p = mockHand(t - win.startAtMs);
        const activity = activityRef.current;
        // Drive the adapter with a minimal synthetic frame: one tracked "left" palm.
        activity.evaluate(mockFrame(t, p), { targetId: null, windowStartedAtMs: win.startAtMs, windowEndsAtMs: win.endAtMs });
        cursorsRef.current = toCursors(activity.hands, cursorsRef.current);
        setTracking(true);
      }, 1000 / 15);
    }
    setPhase("wiping");
  }, [hardMode, roundSec]);

  const resetRound = useCallback(() => {
    if (mockTimer.current) { clearInterval(mockTimer.current); mockTimer.current = null; }
    activityRef.current = createFogActivity();
    windowRef.current = null;
    cursorsRef.current = [];
    setPhase("idle"); setFinalScore(null); setCleared(0); setRemainingMs(0);
    if (mode === "mock") { setTracking(false); void startCamera(); }
  }, [mode, startCamera]);

  // Mouse / touch fallback: drag over the fog. Maps element pixels back to camera-normalized, unmirrored coordinates.
  const pointerWipe = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (phase !== "wiping" || event.buttons === 0) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.max(rect.width / canvas.width, rect.height / canvas.height); // object-cover
    const drawW = canvas.width * scale, drawH = canvas.height * scale;
    const offX = (rect.width - drawW) / 2, offY = (rect.height - drawH) / 2;
    const px = event.clientX - rect.left - offX, py = event.clientY - rect.top - offY;
    const p = { x: 1 - px / drawW, y: py / drawH };
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
    const win = windowRef.current;
    if (!win) return;
    const activity = activityRef.current;
    lastPointerAt.current = performance.now();
    activity.evaluate(mockFrame(lastPointerAt.current, p, "camera"), { targetId: null, windowStartedAtMs: win.startAtMs, windowEndsAtMs: win.endAtMs });
    cursorsRef.current = toCursors(activity.hands, cursorsRef.current);
    setTracking(true);
  }, [phase]);

  const pct = Math.round(cleared * 100);
  const timeFrac = roundSec > 0 ? remainingMs / (roundSec * 1000) : 0;
  const hot = wiping && tracking;
  const message = status.state === "error" ? status.message : practice ? (wiping ? "Practice. A simulated hand is wiping." : "") : statusCopy[status.state];

  return (
    <div className="grid h-svh grid-cols-[minmax(0,1fr)_minmax(300px,380px)] grid-rows-[auto_minmax(0,1fr)] gap-3 p-3 max-lg:h-auto max-lg:grid-cols-1">
      <header className="col-span-2 flex h-14 items-center justify-between gap-4 px-2 max-lg:col-span-1">
        <div className="flex items-center gap-3">
          <a href="/" className="font-display text-xl font-medium tracking-[-0.04em]">Vibecodemaxxing</a>
          <Badge variant="secondary">Fog Wipe · activity 02</Badge>
          {practice && <Badge variant="secondary">Practice · not on the leaderboard</Badge>}
        </div>
        <dl className="flex gap-6">
          <div className="grid justify-items-end">
            <dt className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">Cleared</dt>
            <dd className="font-mono text-xl text-signal tabular-nums"><AnimatedNumber value={pct} format={(v) => `${Math.round(v)}%`} /></dd>
          </div>
          <div className="grid justify-items-end">
            <dt className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">Turn score</dt>
            <dd className="font-mono text-xl tabular-nums"><AnimatedNumber value={finalScore ?? cleared * 100} format={(v) => v.toFixed(1)} /></dd>
          </div>
        </dl>
      </header>

      <section className="relative min-h-0 select-none max-lg:aspect-[4/3]" aria-label="Fogged camera">
        <div ref={frameRef} className="relative isolate size-full overflow-hidden rounded-[20px] bg-card ring-1 ring-border">
          <video ref={videoRef} className={cn("absolute inset-0 size-full -scale-x-100 object-cover", practice && "invisible")} muted playsInline autoPlay />
          {practice && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,#1a2430,#0d1117_70%)]" />}
          <canvas
            ref={canvasRef}
            className={cn("absolute inset-0 z-[1] size-full -scale-x-100 touch-none object-cover", phase === "idle" ? "invisible" : "cursor-crosshair")}
            onPointerDown={pointerWipe}
            onPointerMove={pointerWipe}
          />
          {message && phase !== "done" && <CameraMessage>{message}</CameraMessage>}

          {phase !== "idle" && (
            <div className="absolute top-4 right-4 z-[2] w-[min(220px,40%)]">
              <div className="mb-1.5 flex justify-between font-mono text-[12px] tabular-nums text-white/85">
                <span>{phase === "done" ? "Agent finished" : "Agent working"}</span>
                <span>{(remainingMs / 1000).toFixed(1)}s</span>
              </div>
              <Progress value={timeFrac * 100} className="h-1.5 bg-white/20" indicatorClassName="bg-white duration-100 ease-linear" />
            </div>
          )}

          {phase === "done" && (
            <div className="absolute inset-0 z-[3] grid place-items-center bg-black/60 backdrop-blur-sm">
              <Card className="spotlight-water w-[min(420px,calc(100%-2rem))] rounded-[20px] text-white ring-0">
                <CardContent className="grid gap-4 text-center">
                  <p className="text-[13px] font-medium tracking-[0.06em] text-white/80 uppercase">Agent finished</p>
                  <p className="font-display text-[clamp(3.5rem,8vw,5.5rem)] leading-none font-medium tracking-[-0.05em]">
                    <AnimatedNumber value={finalScore ?? 0} mode="count" format={(v) => v.toFixed(1)} />
                  </p>
                  <p className="text-sm text-white/85">
                    {pct >= 95 ? "Spotless." : pct >= 70 ? "Clean enough." : pct >= 40 ? "Still steamy." : "Can't see a thing."} {pct}% of the mirror cleared in {roundSec}s. Same 0–100 scale as the shower score.
                  </p>
                  <div className="flex justify-center gap-2">
                    <Button size="lg" onClick={() => startRound(mode)}><RotateCcw data-icon="inline-start" /> Again</Button>
                    <Button size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={resetRound}>Back</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <Card className={cn(
          "absolute bottom-4 left-4 z-10 w-[min(300px,calc(100%-2rem))] overflow-visible rounded-[20px] transition-[background-color,box-shadow] duration-300",
          hot ? "spotlight-water text-white ring-0" : "bg-black/60 ring-white/10 backdrop-blur-md",
          wiping && !hot && "ring-signal/50",
        )}>
          <CardContent className="grid gap-3">
            <p className={cn("text-[15px] font-medium", wiping && !hot && "animate-[nudge_1.6s_var(--ease-out)_infinite] text-signal")}>
              {phase === "idle"
                ? cameraReady ? (tracking ? "Hand locked. Start a round." : "Show a hand to the camera.") : practice ? "Practice mode." : "Waiting for the camera."
                : phase === "done" ? "Fog frozen at the deadline."
                : tracking ? "Wipe! Keep the hand moving." : "Hand not visible. Or drag with the mouse."}
            </p>
            <Meter label="Cleared" value={cleared} onSpotlight={hot} />
            {phase !== "idle" && <Meter label="Time left" value={timeFrac} onSpotlight={hot} />}
          </CardContent>
        </Card>
      </section>

      <aside className="grid min-h-0 content-start gap-3" aria-label="Round setup">
        <Card className="rounded-[20px]">
          <CardContent className="grid gap-4">
            <div className="grid gap-1">
              <p className="font-heading text-base font-medium">Round</p>
              <p className="text-sm text-muted-foreground">Stands in for the agent&rsquo;s turn. In the game the engine sets it from the session file.</p>
            </div>
            <div className="flex gap-2">
              {ROUND_OPTIONS.map((s) => (
                <Button key={s} size="sm" variant={s === roundSec ? "default" : "outline"} disabled={wiping} onClick={() => setRoundSec(s)}>{s}s</Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="accent-[var(--signal)]" checked={hardMode} disabled={wiping} onChange={(e) => setHardMode(e.target.checked)} />
              Fog creeps back (hard mode)
            </label>
            <div className="grid gap-2">
              <Button size="lg" disabled={wiping || (!cameraReady && status.state !== "error")} onClick={() => startRound("camera")}>
                <PlayIcon data-icon="inline-start" /> Start {roundSec}s round
              </Button>
              <Button size="lg" variant="secondary" disabled={wiping} onClick={() => startRound("mock")}>
                <Hand data-icon="inline-start" /> Practice with a simulated hand
              </Button>
              {(status.state === "error" || status.state === "stopped") && !wiping && (
                <Button size="lg" variant="outline" onClick={() => void startCamera()}><Camera data-icon="inline-start" /> Retry camera</Button>
              )}
              {status.state === "error" && (
                <p className="text-xs text-muted-foreground">Blocked? Allow the camera in the address bar and retry. Starting a round without the tracker still works with the mouse.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[20px]">
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <p className="font-heading text-base font-medium text-foreground">How it scores</p>
            <p>One pass thins the fog, three passes clear it. A still hand wipes nothing.</p>
            <p>Score is the percentage of the frame that is clear when the agent finishes, 0 to 100, straight into the turn&rsquo;s activity slot.</p>
            <p className="font-mono text-xs">
              {cameraReady ? `${tracking ? "hand lock" : "no lock"} · ${fps} fps${inferenceMs ? ` · ${Math.round(inferenceMs)} ms` : ""}` : initializing ? "loading tracker…" : practice ? "simulated" : "camera off"}
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minimal synthetic TrackingFrame with one palm, for practice mode and the mouse fallback.
// ---------------------------------------------------------------------------

const emptyHand = (side: "left" | "right"): TrackedHand => ({
  side, tracked: false, source: "none", confidence: 0, palm: null, wrist: null, bodyPart: null,
  landmarks: Array(21).fill(null),
  joints: Object.fromEntries(HAND_JOINTS.map((j) => [j, null])) as TrackedHand["joints"],
  fingers: { thumb: { joints: [], tip: null }, index: { joints: [], tip: null }, middle: { joints: [], tip: null }, ring: { joints: [], tip: null }, pinky: { joints: [], tip: null } },
});

function mockFrame(at: number, p: WipePoint, inputMode: "camera" | "mock" = "mock"): TrackingFrame {
  const palm = { x: p.x, y: p.y, motion: null };
  return {
    schemaVersion: 1, capturedAtMs: at, width: MOCK_SIZE.w, height: MOCK_SIZE.h, coordinateSpace: "camera-normalized", inputMode,
    body: { tracked: false, confidence: 0, landmarks: Array(33).fill(null), joints: Object.fromEntries(POSE_JOINTS.map((j) => [j, null])) as TrackingFrame["body"]["joints"], regions: [] },
    hands: { left: { ...emptyHand("left"), tracked: true, source: "hand", confidence: 1, palm, wrist: palm }, right: emptyHand("right") },
  };
}
