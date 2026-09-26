"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createMockVision, createVision, ZONES, ZONE_LABELS, type VisionController, type VisionFrame, type VisionStatus } from "@vibecodemaxxing/vision";
import { COMBO_WINDOW_MS, expireCombo, initialArcadeState, scoreWash, type ArcadeHit } from "@vibecodemaxxing/vision/arcade";
import styles from "./vision.module.css";

const zoneShort = { hair: "HAIR", chest: "CHEST", "left-arm": "L. ARM", "right-arm": "R. ARM", "left-pit": "L. PIT", "right-pit": "R. PIT" };
const initialFrame: VisionFrame = { capturedAtMs: 0, landmarks: [], markers: [], zone: null, tracking: false, confidence: 0, speed: 0, intensity: 0, progress: 0, scrubbing: false };

function Spark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2 3 14h8l-1 8L21 9h-8l1-7Z" fill="currentColor" /></svg>;
}
function CameraIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" /><path d="m8 6 2-3h4l2 3" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.6"/></svg>;
}

export function VisionArcade() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const controller = useRef<VisionController | null>(null);
  const stateRef = useRef(initialArcadeState());
  const session = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);
  const [score, setScore] = useState(initialArcadeState);
  const [status, setStatus] = useState<VisionStatus>({ state: "idle" });
  const [frame, setFrame] = useState(initialFrame);
  const [mode, setMode] = useState<"camera" | "mock">("camera");
  const [hit, setHit] = useState<ArcadeHit | null>(null);
  const [feed, setFeed] = useState<ArcadeHit[]>([]);
  const [clock, setClock] = useState(0);
  const [sound, setSound] = useState(false);
  const [sensitivity, setSensitivity] = useState(1.1);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const ready = status.state === "ready";
  const initializing = status.state === "initializing";
  const stale = clock - frame.capturedAtMs > 500;
  const tracking = ready && frame.tracking && !stale;
  const scrubbing = tracking && frame.scrubbing;
  const chainTime = score.combo ? Math.max(0, 1 - (clock - score.lastChangeAt) / COMBO_WINDOW_MS) : 0;
  const rank = score.multiplier >= 2.5 ? "S" : score.multiplier >= 2 ? "A" : score.multiplier >= 1.5 ? "B" : score.hits ? "C" : "—";

  useEffect(() => {
    const timer = setInterval(() => {
      const now = performance.now(); setClock(now);
      const next = expireCombo(stateRef.current, now);
      if (next !== stateRef.current) { stateRef.current = next; setScore(next); }
    }, 80);
    return () => { clearInterval(timer); session.current++; controller.current?.stop(); void audioRef.current?.close(); };
  }, []);

  const beep = useCallback((combo: number) => {
    const audio = audioRef.current;
    if (!soundRef.current || !audio || audio.state !== "running") return;
    const oscillator = audio.createOscillator(), volume = audio.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(330 + Math.min(combo, 8) * 85, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(800 + Math.min(combo, 8) * 100, audio.currentTime + .07);
    volume.gain.setValueAtTime(.045, audio.currentTime); volume.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .16);
    oscillator.connect(volume); volume.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .18);
  }, []);

  const stop = useCallback(() => {
    session.current++; controller.current?.stop(); controller.current = null;
    setStatus({ state: "stopped" }); setFrame(initialFrame); setHit(null);
  }, []);

  const start = useCallback(async (nextMode: "camera" | "mock") => {
    const generation = ++session.current;
    controller.current?.stop();
    if (!videoRef.current || !overlayRef.current) return;
    setMode(nextMode); setStatus({ state: "initializing" }); setFrame(initialFrame);
    stateRef.current = initialArcadeState(); setScore(stateRef.current); setHit(null); setFeed([]);
    const create = nextMode === "camera" ? createVision : createMockVision;
    const next = create({
      video: videoRef.current, overlay: overlayRef.current, sensitivity,
      onStatus: value => { if (generation === session.current) setStatus(value); },
      onSample: () => {},
      onFrame: value => { if (generation === session.current) setFrame(value); },
      onWash: event => {
        if (generation !== session.current) return;
        const result = scoreWash(stateRef.current, event);
        stateRef.current = result.state; setScore(result.state); setHit(result.hit);
        setFeed(previous => [result.hit, ...previous].slice(0, 4));
        beep(result.state.combo);
      },
    });
    controller.current = next;
    try { await next.start(); } catch (error) {
      if (generation !== session.current) return;
      setStatus(previous => previous.state === "error" ? previous : { state: "error", code: "model_failed", message: error instanceof Error ? error.message : "Unable to start tracking." });
    }
  }, [beep, sensitivity]);

  const toggleSound = () => {
    const enabled = !soundRef.current;
    soundRef.current = enabled; setSound(enabled);
    if (enabled) { audioRef.current ??= new AudioContext(); void audioRef.current.resume(); }
  };

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <a href="/" className={styles.brand}><span className={styles.brandIcon}><Spark size={18}/></span> SHOWERHACKS <span className={styles.separator}>/</span> <span className={styles.subbrand}>VISION ARCADE</span></a>
      <div className={styles.topActions}><span className={styles.local}><i/> ON-DEVICE</span><button className={styles.sound} onClick={toggleSound} aria-pressed={sound}>{sound ? "♫ SOUND ON" : "♫ SOUND OFF"}</button></div>
    </header>
    <section className={styles.intro}>
      <div><div className={styles.kicker}>FREE PLAY <span>01 / WEBCAM EDITION</span></div><h1>SCRUB <span>FIGHTER.</span></h1><p>Your hands. Your hitbox. Absolutely filthy combos.</p></div>
      <div className={styles.mission}><span>YOUR OPPONENT</span><strong>PERSONAL HYGIENE</strong><div><i/><i/><i/><i/><i/><i/><i/><i/></div></div>
    </section>
    <div className={styles.arena}>
      <section className={`${styles.camera} ${scrubbing ? styles.scrubbing : ""}`} aria-label="Webcam arena">
        <div className={styles.grid}/>
        <video ref={videoRef} className={`${styles.video} ${mode === "mock" ? styles.hidden : ""}`} muted playsInline aria-label="Mirrored webcam preview"/>
        <canvas ref={overlayRef} className={`${styles.overlay} ${!showSkeleton ? styles.hidden : ""}`} aria-label="Body tracking overlay"/>
        <div className={styles.vignette}/>
        <div className={styles.cameraTop}>
          <span className={`${styles.statusPill} ${tracking ? styles.statusGood : ""}`}><i/>{initializing ? "LOADING TRACKER" : ready ? mode === "mock" ? "SIMULATED DEMO" : tracking ? "BODY LOCKED" : "FINDING PLAYER" : "CAMERA OFF"}</span>
          <span className={styles.player}>P1 <span>●</span></span>
        </div>
        {!ready && <div className={styles.startScreen}>
          <div className={styles.cameraEmblem}><CameraIcon/></div>
          <span className={styles.smallLabel}>ENTER THE CLEAN ZONE</span>
          <h2>{initializing ? "GETTING YOU IN FRAME…" : "READY TO SCRUB?"}</h2>
          <p>{initializing ? "Allow camera access. The body tracker is warming up." : "Frame your head, shoulders, and arms. Scrub with your hands. Change spots to chain combos."}</p>
          {status.state === "error" && <div className={styles.error} role="alert">{status.message}</div>}
          {initializing ? <button className={styles.secondary} onClick={stop}>CANCEL</button> : <><button className={styles.primary} onClick={() => void start("camera")}><CameraIcon/> ENABLE CAMERA <span>↗</span></button><button className={styles.demoButton} onClick={() => void start("mock")}>TRY THE ANIMATED DEMO <span>→</span></button></>}
          <span className={styles.privacy}>Camera stays on this device. No video is uploaded.</span>
        </div>}
        {ready && !tracking && <div className={styles.framing}><span>STEP INTO THE ARENA</span><p>Keep both shoulders and your hands in view.</p></div>}
        {ready && hit && clock - hit.at < 1100 && <div key={hit.at} className={`${styles.hitPopup} ${hit.repeated ? styles.repeatPopup : ""}`} aria-live="polite"><span>{hit.title}</span><strong>+{hit.points}</strong><small>{ZONE_LABELS[hit.zone]} {hit.repeated ? "· DIMINISHING RETURNS" : "· CLEAN HIT"}</small></div>}
        {ready && <div className={styles.cameraBottom}>
          <div><span className={styles.smallLabel}>{mode === "mock" ? "DEMO REPLAY · NOT YOUR CAMERA" : "CURRENT TARGET"}</span><strong>{tracking && frame.zone ? ZONE_LABELS[frame.zone] : "FIND YOUR FLOW"}</strong><span className={styles.actionHint}>{scrubbing ? "SCRUBBING — KEEP IT MOVING" : frame.zone && tracking ? "RUB BACK AND FORTH TO LAND A HIT" : "HAND TO CHEST, ARM, OR HAIR"}</span></div>
          <div className={styles.progressRing} style={{ background: `conic-gradient(#d5ff69 ${frame.progress * 360}deg, #ffffff15 0deg)` }}><span>{scrubbing ? "GO!" : "RUB"}</span></div>
        </div>}
        <div className={styles.cornerTL}/><div className={styles.cornerBR}/>
      </section>
      <aside className={styles.dashboard}>
        <div className={styles.scoreCard}><div className={styles.cardHeading}><span>STYLE POINTS</span><Spark size={19}/></div><div className={styles.score}>{score.points.toLocaleString("en-US").padStart(6, "0")}</div><div className={styles.scoreMeta}><span>PERSONAL BEST CHAIN</span><strong>{score.bestCombo} <small>HITS</small></strong></div></div>
        <div className={styles.comboCard}><div className={styles.cardHeading}><span>COMBO DRIVE</span><span className={styles.multiplier}>×{score.multiplier.toFixed(1)}</span></div><div className={styles.comboRow}><strong>{String(score.combo).padStart(2, "0")}<span>HIT<br/>COMBO</span></strong><div className={styles.rank}>{rank}</div></div><div className={styles.comboTrack}><span style={{ width: `${chainTime * 100}%` }}/></div><p>{score.repetition >= 2 ? "That spot is clean. Move on!" : score.combo ? "Switch zones before the meter runs out." : "Land a scrub. Switch zones. Repeat."}</p></div>
        <div className={styles.speedCard}><div className={styles.cardHeading}><span>SCRUB VELOCITY</span><strong>{scrubbing ? Math.round(frame.intensity * 100) : 0}<small>%</small></strong></div><div className={styles.speedBars}>{Array.from({ length: 24 }, (_, i) => <i key={i} className={scrubbing && i / 24 < frame.intensity ? styles.barLit : ""}/>)}</div><div className={styles.speedLabels}><span>GENTLE RINSE</span><span>PRESSURE WASH</span></div></div>
        <div className={styles.feed}><span className={styles.smallLabel}>COMBAT LOG</span>{feed.length ? feed.map(item => <div key={item.at} className={styles.feedItem}><span>{ZONE_LABELS[item.zone]}<small>{item.repeated ? "REPEAT PENALTY" : item.title}</small></span><strong>+{item.points}</strong></div>) : <p>Awaiting your first clean hit.<br/>Make it a good one.</p>}</div>
      </aside>
    </div>
    <section className={styles.zoneSection}><div className={styles.zoneTitle}><span className={styles.smallLabel}>THE MOVE LIST</span><span>VARIETY = MULTIPLIER</span></div><div className={styles.zones}>{ZONES.map((zone, index) => <div key={zone} className={`${styles.zone} ${tracking && frame.zone === zone ? styles.activeZone : ""}`}><span className={styles.zoneNumber}>0{index + 1}</span><strong>{zoneShort[zone]}</strong><span className={styles.zoneCount}>{score.zoneHits[zone] ? `${score.zoneHits[zone]} HITS` : zone.includes("pit") ? "RAISE ARM" : zone.includes("arm") ? "OPPOSITE HAND" : "SCRUB HERE"}</span><i/></div>)}</div></section>
    <footer className={styles.footer}>
      <div className={styles.controls}><label><input type="checkbox" checked={showSkeleton} onChange={event => setShowSkeleton(event.target.checked)}/> BODY OVERLAY</label><label className={styles.sensitivity}>SENSITIVITY <input type="range" min=".6" max="1.6" step=".1" value={sensitivity} disabled={ready || initializing} onChange={event => setSensitivity(Number(event.target.value))} aria-label="Scrub sensitivity"/><span>{sensitivity.toFixed(1)}</span></label></div>
      <div className={styles.footerActions}>{ready && <><span className={styles.telemetry}>{tracking ? `${Math.round(frame.confidence * 100)}% LOCK` : "NO LOCK"}{frame.inferenceMs ? ` · ${Math.round(frame.inferenceMs)}ms` : ""}</span><button onClick={() => { stateRef.current = initialArcadeState(); setScore(stateRef.current); setFeed([]); setHit(null); }}>RESET SCORE</button><button onClick={stop}>STOP {mode === "mock" ? "DEMO" : "CAMERA"}</button></>}</div>
    </footer>
    <p className={styles.footnote}>LAND A HIT: rub a visible body zone for a moment. CHAIN IT: change zones. DON’T CAMP: repeating one spot reduces points.</p>
  </main>;
}
