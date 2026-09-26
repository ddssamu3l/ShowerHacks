"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createVision, createMockVision, PLACEMENT_LABELS, PLACEMENT_ZONES, type PlacementFrame, type VisionController, type VisionStatus } from "@vibecodemaxxing/vision";
import styles from "./placement.module.css";

const empty: PlacementFrame = { capturedAtMs: 0, tracking: false, landmarks: [], hands: [], regions: [] };
function HandIcon() {
  return <svg viewBox="0 0 32 32" width="30" height="30" fill="none" aria-hidden="true"><path d="M9 16V8a2 2 0 0 1 4 0v7V5a2 2 0 0 1 4 0v10V7a2 2 0 0 1 4 0v9V11a2 2 0 0 1 4 0v10c0 6-4 9-9 9-4 0-6-2-8-5l-5-8a2 2 0 0 1 3-2l3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export function HandPlacementViewer() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<VisionController | null>(null);
  const generation = useRef(0);
  const lastFrameAt = useRef(0);
  const [frame, setFrame] = useState<PlacementFrame>(empty);
  const [status, setStatus] = useState<VisionStatus>({ state: "idle" });
  const [mode, setMode] = useState<"camera" | "mock">("camera");
  const [stale, setStale] = useState(false);
  const ready = status.state === "ready";
  const loading = status.state === "initializing";
  const live = ready && !stale;
  const visible = live ? frame.hands.filter(hand => hand.visible) : [];
  const placements = visible.filter(hand => hand.zone);
  const sameZone = placements.length === 2 && placements[0].zone === placements[1].zone;

  useEffect(() => {
    const timer = setInterval(() => {
      const expired = performance.now() - lastFrameAt.current > 500;
      setStale(expired);
      if (expired && canvas.current) canvas.current.getContext("2d")?.clearRect(0, 0, canvas.current.width, canvas.current.height);
    }, 200);
    return () => { clearInterval(timer); generation.current++; controller.current?.stop(); };
  }, []);

  const stop = useCallback(() => {
    generation.current++; controller.current?.stop(); controller.current = null;
    setStatus({ state: "stopped" }); setFrame(empty);
  }, []);
  const start = useCallback(async (nextMode: "camera" | "mock") => {
    const id = ++generation.current;
    controller.current?.stop();
    if (!video.current || !canvas.current) return;
    setMode(nextMode); setFrame(empty); setStatus({ state: "initializing" });
    const next = (nextMode === "camera" ? createVision : createMockVision)({
      mode: "placement", video: video.current, overlay: canvas.current,
      onSample: () => {},
      onStatus: value => { if (id === generation.current) setStatus(value); },
      onPlacement: value => {
        if (id !== generation.current) return;
        lastFrameAt.current = value.capturedAtMs; setStale(false); setFrame(value);
      },
    });
    controller.current = next;
    try { await next.start(); } catch (error) {
      if (id !== generation.current) return;
      setStatus(previous => previous.state === "error" ? previous : { state: "error", code: "model_failed", message: error instanceof Error ? error.message : "Unable to start the camera." });
    }
  }, []);

  return <main className={styles.page}>
    <header className={styles.header}><a href="/vision">✳ SHOWERHACKS <span>/ BACK TO SCRUB CHALLENGE ↗</span></a><span className={styles.local}><i/> CAMERA STAYS LOCAL</span></header>
    <section className={styles.intro}><div><span className={styles.eyebrow}>LET’S GET THE BASICS RIGHT</span><h1>HANDS <em>ON.</em></h1><p>Place your hands anywhere in view. Hold still. See what lights up.</p></div><div className={styles.legend}><span><i className={styles.cyan}/> YOUR LEFT HAND</span><span><i className={styles.pink}/> YOUR RIGHT HAND</span></div></section>
    <div className={styles.layout}>
      <section className={styles.stage} aria-label="Hand placement camera">
        <div className={styles.grid}/>
        <video ref={video} muted playsInline className={`${styles.video} ${mode === "mock" ? styles.hidden : ""}`} aria-label="Mirrored webcam"/>
        <canvas ref={canvas} className={styles.overlay} aria-label="Hand positions and highlighted body regions"/>
        <div className={styles.shade}/>
        <div className={styles.stageTop}><span className={`${styles.badge} ${live && frame.tracking ? styles.locked : ""}`}><i/>{loading ? "STARTING TRACKERS" : ready ? mode === "mock" ? "SIMULATED PLACEMENTS" : live && frame.tracking ? "BODY IN VIEW" : "FINDING YOUR BODY" : "CAMERA OFF"}</span>{ready && <span className={styles.counter}>{visible.length} / 2 HANDS</span>}</div>
        {!ready && <div className={styles.start}><div className={styles.startIcon}><HandIcon/></div><h2>{loading ? "GETTING READY…" : "JUST PLACE YOUR HANDS."}</h2><p>{loading ? "Allow webcam access while the body and hand trackers load." : "Keep your head, shoulders, and hands in frame. Try one hand on your shoulder and the other on your chest."}</p>{status.state === "error" && <div role="alert" className={styles.error}>{status.message}</div>}{loading ? <button className={styles.secondary} onClick={stop}>CANCEL</button> : <><button className={styles.primary} onClick={() => void start("camera")}>ENABLE CAMERA <span>↗</span></button><button className={styles.demo} onClick={() => void start("mock")}>PREVIEW EXAMPLE PLACEMENTS →</button></>}<small>No movement required. Both hands count independently.</small></div>}
        {ready && <div className={styles.stageBottom}><span>{mode === "mock" ? "DEMO · NOT YOUR WEBCAM" : "MIRRORED VIEW"}</span><strong>{sameZone ? `Both hands on ${PLACEMENT_LABELS[placements[0].zone!].toLowerCase()}` : !live || !frame.tracking ? "Keep both shoulders in view" : placements.length ? "Hold that pose. Move either hand when you’re ready." : "Place a hand on a highlighted body region"}</strong></div>}
      </section>
      <aside className={styles.sidebar}>
        {(["left", "right"] as const).map(side => {
          const hand = live ? frame.hands.find(item => item.side === side && item.visible) : undefined;
          return <section key={side} className={`${styles.handCard} ${side === "left" ? styles.leftCard : styles.rightCard} ${hand?.zone ? styles.placed : ""}`}><div className={styles.cardTop}><span>{side.toUpperCase()} HAND</span><HandIcon/></div><div className={styles.destination}>{hand?.zone ? PLACEMENT_LABELS[hand.zone] : hand ? "Outside a zone" : "Not in view"}</div><div className={styles.handStatus}><i/>{hand ? hand.source === "hand" ? "Palm detected" : "Estimated from arm position" : ready ? "Bring this hand into frame" : "Waiting for camera"}</div><p>{side === "left" ? "The cyan marker follows your left hand." : "The pink marker follows your right hand."}</p></section>;
        })}
        <div className={styles.notes}><span>TRY THIS</span><p>Hand on shoulder.<br/>Other hand on chest.<br/>Both hands on your head.</p><small>Overlapping hands can share a region. A dashed marker means the hand tracker missed the palm and its position is estimated from the arm.</small></div>
        {(ready || loading) && <button className={styles.stop} onClick={stop}>{loading ? "CANCEL STARTUP" : `STOP ${mode === "mock" ? "DEMO" : "CAMERA"}`}</button>}
      </aside>
    </div>
    <section className={styles.regionSection}><div className={styles.regionHeading}><span>BODY REGIONS</span><span>{sameZone ? "TWO HANDS · ONE REGION" : "STATIC PLACEMENT"}</span></div><div className={styles.regions}>{PLACEMENT_ZONES.map(zone => {
      const touching = placements.filter(hand => hand.zone === zone);
      return <div key={zone} className={`${styles.region} ${touching.length === 2 ? styles.bothRegion : touching[0]?.side === "left" ? styles.leftRegion : touching[0]?.side === "right" ? styles.rightRegion : ""}`}><span>{PLACEMENT_LABELS[zone]}</span><strong>{touching.map(hand => hand.side === "left" ? "L" : "R").join(" + ") || "—"}</strong></div>;
    })}</div></section>
    <footer className={styles.footer}><span>Colored outlines show the region each palm overlaps in the camera view.</span><span>{ready && frame.inferenceMs ? `${Math.round(frame.inferenceMs)} ms` : "ON-DEVICE TRACKING"}</span></footer>
  </main>;
}
