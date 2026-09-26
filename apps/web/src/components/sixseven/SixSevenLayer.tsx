"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import {
  applySixSevenSample,
  lastSixSevenCall,
  nextSixSevenCall,
  type SixSevenCall,
  type SixSevenHand,
  type SixSevenState,
} from "@vibecodemaxxing/game-engine";
import type { PoseFrame } from "../camera/CameraProvider";

/**
 * Six Seven overlay for the camera frame. Feeds both palms from CameraProvider
 * (already mirrored) to the beat detector and draws a 6 over the hand on the
 * left of the screen and a 7 over the hand on the right. Each beat pops the
 * called number and flashes the word. Practice mode rocks a synthetic pair of hands.
 */

interface SixSevenLayerProps {
  state: SixSevenState;
  poseRef: MutableRefObject<PoseFrame>;
  active: boolean;
  practice: boolean;
  onHands?: (count: number) => void;
  onBeat?: (call: SixSevenCall, beats: number) => void;
}

interface Digit { x: number; y: number; vy: number }

const SIGNAL = "#0099ff";
const FLASH_MS = 420;

/** Two synthetic palms rocking in anti-phase about once a second. */
function mockHands(tMs: number): SixSevenHand[] {
  const w = 0.09 * Math.sin((tMs / 1000) * 2 * Math.PI * 0.9);
  const sway = Math.sin(tMs / 1300) * 0.03;
  return [
    { side: "right", x: 0.3 + sway, y: 0.55 + w },
    { side: "left", x: 0.7 + sway, y: 0.55 - w },
  ];
}

function displayFont(): string {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mona").trim();
  return family ? `${family}, "Mona Sans", Inter, sans-serif` : '"Mona Sans", Inter, sans-serif';
}

export function SixSevenLayer({ state, poseRef, active, practice, onHands, onBeat }: SixSevenLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef(performance.now());
  const digitsRef = useRef<Digit[]>([]);
  const flashRef = useRef<{ call: SixSevenCall; at: number } | null>(null);
  const lastAppliedRef = useRef(-1);
  const onHandsRef = useRef(onHands);
  onHandsRef.current = onHands;
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;
  const activeRef = useRef(active);
  activeRef.current = active;
  const practiceRef = useRef(practice);
  practiceRef.current = practice;

  useEffect(() => {
    let raf = 0;
    const font = displayFont();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const now = performance.now();

      // 1. Hands -> beats. Engine coordinates are the mirrored video frame (0..1).
      let hands: SixSevenHand[] = [];
      let at = now;
      if (practiceRef.current) {
        hands = mockHands(now - startRef.current);
      } else {
        const pose = poseRef.current;
        at = pose.capturedAtMs;
        hands = pose.hands.map((hand) => ({ side: hand.side, x: hand.x, y: hand.y }));
      }
      if (activeRef.current && at > lastAppliedRef.current) {
        lastAppliedRef.current = at;
        const outcome = applySixSevenSample(state, { capturedAtMs: at, hands });
        if (outcome === "beat") {
          const call = lastSixSevenCall(state) ?? "six";
          flashRef.current = { call, at: now };
          onBeatRef.current?.(call, state.beats);
        }
        onHandsRef.current?.(hands.length);
      }

      // 2. Display mapping: the video is object-cover inside the frame.
      const video = canvas.parentElement?.querySelector("video");
      const vw = practiceRef.current ? 16 : video?.videoWidth || 0;
      const vh = practiceRef.current ? 9 : video?.videoHeight || 0;
      const scale = vw && vh ? Math.max(width / vw, height / vh) : 0;
      const offX = vw ? (width - vw * scale) / 2 : 0, offY = vh ? (height - vh * scale) / 2 : 0;
      const map = (p: { x: number; y: number }) => ({ x: offX + p.x * vw * scale, y: offY + p.y * vh * scale });

      // 3. Draw.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const flash = flashRef.current && now - flashRef.current.at < FLASH_MS ? flashRef.current : null;
      const flashT = flash ? (now - flash.at) / FLASH_MS : 1;
      const next = nextSixSevenCall(state);

      // Digits ride the hands: the hand on the left of the screen is the 6, the right one the 7.
      const ordered = scale ? [...hands].map(map).sort((a, b) => a.x - b.x) : [];
      const digits = digitsRef.current;
      ordered.forEach((p, i) => {
        const d = digits[i] ?? (digits[i] = { x: p.x, y: p.y, vy: 0 });
        d.x += (p.x - d.x) * 0.45;
        d.y += (p.y - d.y) * 0.45;
      });
      digits.length = ordered.length;
      const size = Math.max(64, Math.min(width, height) / 4.2);
      digits.forEach((d, i) => {
        const label = ordered.length === 2 ? (i === 0 ? "6" : "7") : "?";
        const call: SixSevenCall = i === 0 ? "six" : "seven";
        const hot = flash?.call === call;
        const pop = hot ? 1 + 0.35 * (1 - flashT) : 1;
        const pending = ordered.length === 2 && next === call && !hot;
        ctx.save();
        ctx.translate(d.x, d.y - size * 0.55);
        ctx.scale(pop, pop);
        ctx.font = `800 ${size}px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(4, size / 14);
        ctx.strokeStyle = "rgba(0,0,0,.55)";
        ctx.strokeText(label, 0, 0);
        ctx.fillStyle = hot ? SIGNAL : pending ? "#ffffff" : "rgba(255,255,255,.55)";
        ctx.fillText(label, 0, 0);
        ctx.restore();
        // A ring on the palm itself so the player sees what is tracked.
        ctx.beginPath();
        ctx.arc(d.x, d.y, 18, 0, Math.PI * 2);
        ctx.strokeStyle = hot ? SIGNAL : "rgba(255,255,255,.7)";
        ctx.lineWidth = 3;
        ctx.stroke();
      });

      // The word, dead center, on every beat.
      if (flash) {
        const word = flash.call === "six" ? "SIX" : "SEVEN";
        const rise = (1 - flashT) * 24;
        const alpha = flashT < 0.7 ? 1 : 1 - (flashT - 0.7) / 0.3;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `800 ${Math.max(40, width / 9)}px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 8;
        ctx.strokeStyle = "rgba(0,0,0,.6)";
        ctx.strokeText(word, width / 2, height * 0.14 - rise);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(word, width / 2, height * 0.14 - rise);
        ctx.restore();
      }

      // Streak chip, top right.
      if (state.streak >= 3) {
        const text = `${state.streak} in a row`;
        ctx.save();
        ctx.font = `600 14px ${font}`;
        const w = ctx.measureText(text).width + 22;
        ctx.fillStyle = "rgba(0,0,0,.6)";
        ctx.beginPath();
        ctx.roundRect(width - w - 12, 12, w, 28, 14);
        ctx.fill();
        ctx.fillStyle = SIGNAL;
        ctx.textBaseline = "middle";
        ctx.fillText(text, width - w - 1, 26);
        ctx.restore();
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [state, poseRef]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[2] size-full" aria-label="Six seven overlay" />;
}
