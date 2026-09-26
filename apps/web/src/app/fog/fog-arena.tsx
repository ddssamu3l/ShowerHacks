"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createVision, type VisionController, type VisionFrame, type VisionStatus } from "@vibecodemaxxing/vision";
import { createFog, applyWipe, advanceFog, freezeFog, clearedFraction, scoreFog, FOG_DEFAULTS, type FogState, type WipePoint } from "@vibecodemaxxing/game-engine";
import { handPoints } from "./hand-points";
import base from "../vision/vision.module.css";
import styles from "./fog.module.css";

type Mode = "camera" | "mock";
type Phase = "idle" | "wiping" | "done";

const ROUND_OPTIONS = [10, 15, 20, 30];
const FOG_RGB = "196, 212, 222";

function CameraIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" /><path d="m8 6 2-3h4l2 3" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.6"/></svg>;
}

/** Synthetic hand that sweeps the frame row by row, for the no-camera demo. */
function mockHand(tMs: number): WipePoint {
  const rowPeriod = 1600, rows = 6;
  const row = Math.floor(tMs / rowPeriod) % rows;
  const phase = (tMs % rowPeriod) / rowPeriod;
  const x = row % 2 === 0 ? 0.08 + phase * 0.84 : 0.92 - phase * 0.84;
  const y = 0.12 + row * (0.76 / (rows - 1)) + Math.sin(tMs / 90) * 0.02;
  return { x, y };
}

/** Draw the fog grid onto the canvas, soft-edged. Cells are in raw video space. */
function drawFog(canvas: HTMLCanvasElement, scratch: HTMLCanvasElement, fog: FogState, width: number, height: number, hands: readonly WipePoint[]) {
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  if (scratch.width !== fog.cols || scratch.height !== fog.rows) { scratch.width = fog.cols; scratch.height = fog.rows; }
  const small = scratch.getContext("2d");
  const ctx = canvas.getContext("2d");
  if (!small || !ctx) return;

  const image = small.createImageData(fog.cols, fog.rows);
  for (let i = 0; i < fog.cells.length; i++) {
    const a = fog.cells[i];
    image.data[i * 4] = 196; image.data[i * 4 + 1] = 212; image.data[i * 4 + 2] = 222;
    image.data[i * 4 + 3] = Math.round(a * 235);
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
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, Math.max(14, width / 40), 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(213,255,105,.85)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#d5ff69"; ctx.fill();
  }
}

export function FogArena() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const controller = useRef<VisionController | null>(null);
  const fogRef = useRef<FogState>(createFog());
  const handsRef = useRef<WipePoint[]>([]);
  const session = useRef(0);
  const deadlineRef = useRef<number | null>(null);
  const mockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mockStart = useRef(0);

  const [mode, setMode] = useState<Mode>("camera");
  const [status, setStatus] = useState<VisionStatus>({ state: "idle" });
  const [phase, setPhase] = useState<Phase>("idle");
  const [roundSec, setRoundSec] = useState(15);
  const [refog, setRefog] = useState(false);
  const [cleared, setCleared] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [inferenceMs, setInferenceMs] = useState<number | undefined>();
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const initializing = status.state === "initializing";

  const redraw = useCallback(() => {
    const canvas = fogCanvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;
    scratchRef.current ??= document.createElement("canvas");
    // Camera: match the video's pixel size so object-fit lines the fog up with the picture.
    // Mock: match the container so the fog fills the box.
    const useVideo = mode === "camera" && video && video.videoWidth > 0;
    const w = useVideo ? video.videoWidth : canvas.clientWidth || 960;
    const h = useVideo ? video.videoHeight : canvas.clientHeight || 540;
    drawFog(canvas, scratchRef.current, fogRef.current, w, h, handsRef.current);
  }, [mode]);

  // Round clock: refog, deadline, live percentage, redraw.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const fog = fogRef.current;
      if (phase === "wiping") {
        advanceFog(fog, now);
        const deadline = deadlineRef.current ?? now;
        const left = Math.max(0, deadline - now);
        setRemainingMs(left);
        if (left <= 0) {
          freezeFog(fog);
          setFinalScore(scoreFog(fog));
          setPhase("done");
        }
      }
      setCleared(clearedFraction(fog));
      redraw();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, redraw]);

  useEffect(() => () => { session.current++; controller.current?.stop(); if (mockTimer.current) clearInterval(mockTimer.current); }, []);

  const onFrame = useCallback((frame: VisionFrame) => {
    const points = handPoints(frame.landmarks);
    handsRef.current = points;
    setTracking(points.length > 0);
    setInferenceMs(frame.inferenceMs);
    if (phase !== "wiping") return;
    applyWipe(fogRef.current, { capturedAtMs: frame.capturedAtMs, points, tracking: points.length > 0 }, performance.now());
  }, [phase]);
  const onFrameRef = useRef(onFrame);
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);

  const stopAll = useCallback(() => {
    session.current++;
    controller.current?.stop(); controller.current = null;
    if (mockTimer.current) { clearInterval(mockTimer.current); mockTimer.current = null; }
    setStatus({ state: "stopped" }); setPhase("idle"); setTracking(false); handsRef.current = [];
  }, []);

  const enableCamera = useCallback(async () => {
    const generation = ++session.current;
    controller.current?.stop();
    if (!videoRef.current) return;
    setMode("camera"); setStatus({ state: "initializing" });
    const next = createVision({
      video: videoRef.current,
      onStatus: value => { if (generation === session.current) setStatus(value); },
      onSample: () => {},
      onFrame: value => { if (generation === session.current) onFrameRef.current(value); },
    });
    controller.current = next;
    try { await next.start(); } catch (error) {
      if (generation !== session.current) return;
      setStatus(previous => previous.state === "error" ? previous : { state: "error", code: "model_failed", message: error instanceof Error ? error.message : "Unable to start tracking." });
    }
  }, []);

  const startRound = useCallback((nextMode: Mode) => {
    fogRef.current = createFog({ refogPerSecond: refog ? 0.03 : 0 });
    const now = performance.now();
    advanceFog(fogRef.current, now);
    deadlineRef.current = now + roundSec * 1000;
    setFinalScore(null); setCleared(0); setRemainingMs(roundSec * 1000);
    setMode(nextMode);
    if (nextMode === "mock") {
      controller.current?.stop(); controller.current = null;
      setStatus({ state: "ready" });
      mockStart.current = now;
      if (mockTimer.current) clearInterval(mockTimer.current);
      mockTimer.current = setInterval(() => {
        const t = performance.now();
        const p = mockHand(t - mockStart.current);
        handsRef.current = [p]; setTracking(true);
        if (deadlineRef.current !== null && t <= deadlineRef.current) {
          applyWipe(fogRef.current, { capturedAtMs: t, points: [p], tracking: true }, t);
        }
      }, 1000 / 15);
    }
    setPhase("wiping");
  }, [refog, roundSec]);

  const resetRound = useCallback(() => {
    if (mockTimer.current) { clearInterval(mockTimer.current); mockTimer.current = null; }
    fogRef.current = createFog();
    deadlineRef.current = null;
    setPhase("idle"); setFinalScore(null); setCleared(0); setRemainingMs(0);
    if (mode === "mock") { setStatus({ state: "idle" }); setTracking(false); handsRef.current = []; }
  }, [mode]);

  const pct = Math.round(cleared * 100);
  const secondsLeft = (remainingMs / 1000).toFixed(1);
  const timeFrac = roundSec > 0 ? remainingMs / (roundSec * 1000) : 0;
  const cameraReady = status.state === "ready" && mode === "camera";
  const statusText = initializing ? "LOADING TRACKER" : mode === "mock" && phase !== "idle" ? "SIMULATED HAND" : cameraReady ? (tracking ? "HAND LOCKED" : "SHOW ME A HAND") : "CAMERA OFF";

  return <main className={base.page}>
    <header className={base.topbar}>
      <a href="/" className={base.brand}><span className={base.brandIcon}>☁</span> SHOWERHACKS <span className={base.separator}>/</span> <span className={base.subbrand}>FOG WIPE</span></a>
      <div className={base.topActions}><span className={base.local}><i/> ON-DEVICE</span><a className={styles.switch} href="/vision">SCRUB FIGHTER →</a></div>
    </header>
    <section className={base.intro}>
      <div><div className={base.kicker}>ACTIVITY <span>02 / FOGGED MIRROR</span></div><h1>WIPE <span>IT.</span></h1><p>The agent is working. The mirror is fogged. Clear it before the agent finishes.</p></div>
      <div className={base.mission}><span>YOUR OPPONENT</span><strong>CONDENSATION</strong><div><i/><i/><i/><i/><i/><i/><i/><i/></div></div>
    </section>
    <div className={base.arena}>
      <section className={`${base.camera} ${phase === "wiping" && tracking ? base.scrubbing : ""}`} aria-label="Fogged camera">
        <div className={base.grid}/>
        <video ref={videoRef} className={`${base.video} ${mode === "mock" ? base.hidden : ""}`} muted playsInline aria-label="Mirrored webcam preview"/>
        {mode === "mock" && phase !== "idle" && <div className={styles.mockBackdrop}><span>SIMULATED · NOT YOUR CAMERA</span></div>}
        <canvas ref={fogCanvasRef} className={`${base.overlay} ${styles.fog} ${phase === "idle" ? base.hidden : ""}`} aria-label="Fog overlay"/>
        <div className={base.cameraTop}>
          <span className={`${base.statusPill} ${tracking && phase === "wiping" ? base.statusGood : ""}`}><i/>{statusText}</span>
          {phase !== "idle" && <span className={styles.timer}><b style={{ width: `${timeFrac * 100}%` }}/><span>{phase === "done" ? "AGENT DONE" : `${secondsLeft}s`}</span></span>}
        </div>

        {phase === "idle" && !cameraReady && <div className={base.startScreen}>
          <div className={base.cameraEmblem}><CameraIcon/></div>
          <span className={base.smallLabel}>STEAM ROOM</span>
          <h2>{initializing ? "WARMING UP THE MIRROR…" : "READY TO WIPE?"}</h2>
          <p>{initializing ? "Allow camera access. The hand tracker is loading." : "Enable the camera, then start a round. Wipe the fog with your hand like a bathroom mirror. Standing still does nothing."}</p>
          {status.state === "error" && <div className={base.error} role="alert">{status.message}</div>}
          {initializing ? <button className={base.secondary} onClick={stopAll}>CANCEL</button> : <><button className={base.primary} onClick={() => void enableCamera()}><CameraIcon/> ENABLE CAMERA <span>↗</span></button><button className={base.demoButton} onClick={() => startRound("mock")}>TRY THE SIMULATED HAND <span>→</span></button></>}
          <span className={base.privacy}>Camera stays on this device. No video is uploaded.</span>
        </div>}

        {phase === "idle" && cameraReady && <div className={base.startScreen}>
          <span className={base.smallLabel}>CAMERA READY</span>
          <h2>{tracking ? "HAND LOCKED. GO?" : "SHOW ME A HAND"}</h2>
          <p>Round length below is the fake agent's duration. Fog drops when you press start.</p>
          <button className={base.primary} onClick={() => startRound("camera")}>START {roundSec}s ROUND <span>→</span></button>
        </div>}

        {phase === "done" && <div className={`${base.startScreen} ${styles.result}`}>
          <span className={base.smallLabel}>AGENT FINISHED</span>
          <h2>{pct >= 95 ? "SPOTLESS." : pct >= 70 ? "CLEAN ENOUGH." : pct >= 40 ? "STILL STEAMY." : "CAN'T SEE A THING."}</h2>
          <div className={styles.bigScore}>{finalScore !== null ? finalScore.toFixed(1) : "0.0"}<small>/ 100</small></div>
          <p>{pct}% of the mirror cleared in {roundSec}s. This is the turn's activity score, same scale as the shower score.</p>
          <div className={styles.resultActions}><button className={base.primary} onClick={() => startRound(mode)}>AGAIN <span>↻</span></button><button className={base.secondary} onClick={resetRound}>BACK</button></div>
        </div>}

        {phase === "wiping" && <div className={base.cameraBottom}>
          <div><span className={base.smallLabel}>{mode === "mock" ? "DEMO SWEEP · NOT YOUR CAMERA" : "CLEARED"}</span><strong>{pct}%</strong><span className={base.actionHint}>{tracking ? "KEEP THE HAND MOVING" : "HAND NOT VISIBLE"}</span></div>
          <div className={base.progressRing} style={{ background: `conic-gradient(#d5ff69 ${cleared * 360}deg, #ffffff15 0deg)` }}><span>{pct}</span></div>
        </div>}
        <div className={base.cornerTL}/><div className={base.cornerBR}/>
      </section>

      <aside className={base.dashboard}>
        <div className={base.scoreCard}><div className={base.cardHeading}><span>CLEARED</span><span>{phase === "done" ? "FINAL" : phase === "wiping" ? "LIVE" : "—"}</span></div><div className={base.score}>{pct}<small className={styles.pctSign}>%</small></div><div className={base.scoreMeta}><span>TURN SCORE</span><strong>{finalScore !== null ? finalScore.toFixed(1) : (cleared * 100).toFixed(1)} <small>/ 100</small></strong></div></div>
        <div className={base.comboCard}><div className={base.cardHeading}><span>ROUND</span><span className={base.multiplier}>{roundSec}s</span></div>
          <div className={styles.roundPicker}>{ROUND_OPTIONS.map(s => <button key={s} className={s === roundSec ? styles.roundOn : ""} disabled={phase === "wiping"} onClick={() => setRoundSec(s)}>{s}s</button>)}</div>
          <label className={styles.toggle}><input type="checkbox" checked={refog} disabled={phase === "wiping"} onChange={e => setRefog(e.target.checked)}/> FOG CREEPS BACK (hard mode)</label>
          <p>Round length stands in for the agent's turn duration. In the real game the engine sets it from the session file.</p>
        </div>
        <div className={base.speedCard}><div className={base.cardHeading}><span>WIPE RULES</span><strong>{FOG_DEFAULTS.cols}×{FOG_DEFAULTS.rows}</strong></div>
          <ul className={styles.rules}><li>One pass thins, three passes clear.</li><li>A still hand wipes nothing.</li><li>Score = % clear when the agent finishes.</li></ul>
        </div>
      </aside>
    </div>
    <footer className={base.footer}>
      <div className={base.controls}><span className={base.smallLabel}>ENGINE: createFog / applyWipe / scoreFog · docs/fog-wipe-mode.md</span></div>
      <div className={base.footerActions}>{(cameraReady || mode === "mock") && <><span className={base.telemetry}>{tracking ? "HAND LOCK" : "NO LOCK"}{inferenceMs ? ` · ${Math.round(inferenceMs)}ms` : ""}</span>{phase !== "idle" && <button onClick={resetRound}>RESET ROUND</button>}<button onClick={stopAll}>STOP</button></>}</div>
    </footer>
    <p className={base.footnote}>WIPE: move a hand across the fogged preview. Wrist and index finger are tracked. SCORE: fraction of the frame cleared at the deadline, 0–100, drops straight into the turn's activity slot.</p>
  </main>;
}
