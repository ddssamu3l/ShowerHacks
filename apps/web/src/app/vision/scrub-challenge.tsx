"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTracking, drawTrackingOverlay, TrackingFrameBuilder, createScrubActivity, ScrubChallenge,
  challengeDemoPose, CHALLENGE_TARGETS, TARGET_LABELS, TARGET_HINTS, DEFAULT_ROUND_MS, COMBO_QUALITY, PLACEMENT_LABELS,
  type TrackingFrame, type TrackingController, type VisionStatus, type ChallengeSnapshot, type ActivitySample,
} from "@vibecodemaxxing/vision";
import styles from "./challenge.module.css";

const format = (n: number) => Math.round(n).toLocaleString("en-US");
const grade = (quality: number) => quality >= .8 ? "SQUEAKY CLEAN" : quality >= .6 ? "POWER WASH" : quality >= COMBO_QUALITY ? "CLEAN HIT" : quality > 0 ? "NEEDS MORE SOAP" : "DRY RUN";

export function ScrubChallengeView() {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<TrackingController | null>(null);
  const game = useRef<ScrubChallenge | null>(null);
  const activity = useRef(createScrubActivity());
  const latestFrame = useRef<TrackingFrame | null>(null);
  const demoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const [status, setStatus] = useState<VisionStatus>({ state: "idle" });
  const [mode, setMode] = useState<"camera" | "mock">("camera");
  const [duration, setDuration] = useState(DEFAULT_ROUND_MS);
  const [run, setRun] = useState<ChallengeSnapshot | null>(null);
  const [frame, setFrame] = useState<TrackingFrame | null>(null);
  const [sample, setSample] = useState<ActivitySample | null>(null);
  const [clock, setClock] = useState(0);
  const ready = status.state === "ready", loading = status.state === "initializing";
  const active = run?.phase === "active", countdown = run?.phase === "countdown", finished = run?.phase === "finished";
  const fresh = !!frame && clock - frame.capturedAtMs <= 250;
  const tracking = ready && fresh && frame.body.tracked;
  const target = run?.target ?? CHALLENGE_TARGETS[0];
  const power = active ? run.liveIntensity : 0;
  const quality = finished ? run.results.reduce((sum, round) => sum + round.quality, 0) / run.totalRounds : run?.quality ?? 0;
  const lastRound = run?.results.at(-1);
  const popup = active && lastRound && clock - lastRound.endedAtMs < 1300 ? lastRound : null;
  const total = (run?.score ?? 0) + (run?.roundPoints ?? 0);

  const release = useCallback(() => {
    generation.current++;
    controller.current?.stop(); controller.current = null;
    if (demoTimer.current) clearInterval(demoTimer.current);
    demoTimer.current = null;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = performance.now(); setClock(now);
      if (game.current) {
        const snapshot = game.current.tick(now); setRun(snapshot);
        if (snapshot.phase === "finished") {
          game.current = null; release(); setStatus({ state: "stopped" });
        }
      }
      const current = latestFrame.current;
      if (canvas.current && current) {
        if (now - current.capturedAtMs > 250) canvas.current.getContext("2d")?.clearRect(0, 0, canvas.current.width, canvas.current.height);
        else drawTrackingOverlay(canvas.current, current, game.current?.getContext().targetId as typeof target | undefined);
      }
    }, 50);
    return () => { clearInterval(timer); release(); };
  }, [release]);

  const begin = useCallback(() => {
    const now = performance.now(); activity.current.reset(); setSample(null);
    game.current = new ScrubChallenge(now + 3000, duration);
    setRun(game.current.tick(now));
  }, [duration]);

  const receive = useCallback((value: TrackingFrame, id: number) => {
    if (id !== generation.current) return;
    latestFrame.current = value; setFrame(value);
    const current = game.current;
    if (!current) return;
    const now = performance.now(), snapshot = current.tick(now);
    if (snapshot.phase !== "active") return;
    const result = activity.current.evaluate(value, current.getContext());
    current.ingest(result, now); setSample(result);
  }, []);

  const prepare = useCallback(async (nextMode: "camera" | "mock") => {
    release(); game.current = null; latestFrame.current = null;
    setRun(null); setFrame(null); setSample(null); setMode(nextMode);
    if (!video.current || !canvas.current) return;
    const id = generation.current;
    setStatus({ state: "initializing" });
    if (nextMode === "mock") {
      const builder = new TrackingFrameBuilder();
      setStatus({ state: "ready" }); begin();
      demoTimer.current = setInterval(() => {
        const now = performance.now();
        const snapshot = game.current?.tick(now);
        const selected = snapshot?.target ?? CHALLENGE_TARGETS[0];
        const value = builder.process(challengeDemoPose(selected, now), [], now, 960, 720, "mock");
        receive(value, id);
      }, 50);
      return;
    }
    const next = createTracking({ video: video.current, overlay: canvas.current,
      onFrame: value => receive(value, id),
      onStatus: value => {
        if (id !== generation.current) return;
        setStatus(value);
        if (value.state === "error") { game.current = null; setRun(null); }
      },
    });
    controller.current = next;
    try { await next.start(); } catch (error) {
      if (id !== generation.current) return;
      setStatus(previous => previous.state === "error" ? previous : { state: "error", code: "model_failed", message: error instanceof Error ? error.message : "Unable to start camera." });
    }
  }, [begin, receive, release]);

  const stop = () => {
    release(); game.current = null; latestFrame.current = null;
    setRun(null); setFrame(null); setSample(null); setStatus({ state: "stopped" });
    canvas.current?.getContext("2d")?.clearRect(0, 0, canvas.current.width, canvas.current.height);
  };
  const average = finished ? run.results.reduce((sum, round) => sum + round.quality, 0) / run.totalRounds : 0;

  return <main className={styles.page}>
    <header className={styles.header}><a href="/">✳ SHOWERHACKS <span>/ SCRUB CHALLENGE</span></a><nav><a href="/vision/placement">TRACKING LAB ↗</a><span className={styles.local}>● CAMERA STAYS LOCAL</span></nav></header>
    <section className={styles.intro}><div><span className={styles.eyebrow}>FOLLOW THE CALL. FIND YOUR RHYTHM.</span><h1>SOAP <em>RUSH.</em></h1><p>One target. {duration / 1000} seconds. Keep the clean streak alive.</p></div><div className={styles.sessionInfo}><strong>08</strong><span>TARGETS<br/>{duration / 1000 * CHALLENGE_TARGETS.length} SECOND RUN</span></div></section>
    <section className={`${styles.prompt} ${active && run.remainingMs < 1000 ? styles.urgent : ""}`} aria-label="Current scrub target">
      <div className={styles.target}><span>{finished ? "RUN COMPLETE" : countdown ? "GET READY TO SCRUB" : active ? `TARGET ${String(run.roundIndex + 1).padStart(2,"0")} / 08 · SCRUB NOW` : "FIRST TARGET"}</span><strong key={`${run?.roundIndex}:${finished}`}>{finished ? grade(average) : TARGET_LABELS[target]}</strong><p>{finished ? "Every round counted. Every corner cleaned. Probably." : TARGET_HINTS[target]}</p></div>
      <div className={styles.next}><span>{finished ? "BEST STREAK" : "UP NEXT"}</span><strong>{finished ? `${run.bestCombo} TARGETS` : run && !run.nextTarget ? "FINISH LINE" : TARGET_LABELS[run?.nextTarget ?? CHALLENGE_TARGETS[1]]}</strong></div>
      <div className={styles.timer}><strong>{finished ? "✓" : ((active || countdown ? run.remainingMs : duration) / 1000).toFixed(1)}</strong><span>{countdown ? "GET READY" : "SECONDS"}</span></div>
      <div className={styles.deadline}><i style={{ width: `${finished ? 0 : active ? run.remainingMs / run.durationMs * 100 : 100}%` }}/></div>
    </section>
    <div className={styles.arena}>
      <section className={`${styles.stage} ${power > 0 ? styles.washing : ""}`} aria-label="Scrub challenge webcam">
        <video ref={video} muted playsInline className={`${styles.video} ${mode === "mock" ? styles.hidden : ""}`} aria-label="Mirrored webcam"/>
        <canvas ref={canvas} className={styles.overlay} aria-label="Body, hands, fingers and scrub target"/>
        <div className={styles.shade}/>
        <div className={styles.stageTop}><span>{mode === "mock" && ready ? "● SIMULATED DEMO" : tracking ? "● BODY TRACKED" : ready ? "○ FINDING YOUR BODY" : loading ? "○ LOADING TRACKERS" : "○ CAMERA OFF"}</span><span>L <i className={styles.cyan}/> R <i className={styles.pink}/></span></div>
        {!active && !countdown && !finished && <div className={styles.start}>
          <div className={styles.emblem}>✳</div><h2>{loading ? "WARMING UP…" : ready ? "GET IN POSITION." : "READY. SET. SCRUB."}</h2>
          <p>{loading ? "Allow camera access while the hand and body trackers load." : ready ? "Keep both shoulders and your hands in view. You’ll get a three-second countdown." : "Scrub the highlighted area. Follow each new target. Successful rounds build your multiplier."}</p>
          {status.state === "error" && <div className={styles.error} role="alert">{status.message}</div>}
          {loading ? <button className={styles.secondary} onClick={stop}>CANCEL</button> : ready ? <button className={styles.primary} disabled={!tracking} onClick={begin}>START {duration / 1000 * 8} SECOND CHALLENGE ↗</button> : <><button className={styles.primary} onClick={() => void prepare("camera")}>ENABLE CAMERA ↗</button><button className={styles.textButton} onClick={() => void prepare("mock")}>WATCH A SIMULATED RUN →</button></>}
          <small>{ready ? tracking ? "Body found. Let’s do this." : "Waiting for both shoulders…" : "Your camera stays on your device."}</small>
        </div>}
        {countdown && <div className={styles.countdown} aria-live="polite"><span>FIRST UP · {TARGET_LABELS[target]}</span><strong key={Math.ceil(run.remainingMs / 1000)}>{Math.ceil(run.remainingMs / 1000)}</strong><p>Hands ready.</p></div>}
        {popup && <div className={`${styles.popup} ${!popup.success ? styles.missed : ""}`} key={popup.endedAtMs}><span>{popup.success ? `${popup.combo} TARGET COMBO` : "COMBO BREAK"}</span><strong>+{format(popup.points)}</strong><small>{grade(popup.quality)} · {Math.round(popup.quality * 100)}%</small></div>}
        {active && <div className={styles.stageBottom}><span>{mode === "mock" ? "SIMULATED MOVEMENT · REAL SCORING PIPELINE" : "SCRUB THE LIME OUTLINE"}</span><strong>{!tracking ? "Keep both shoulders and hands in view" : fresh && sample && clock - sample.capturedAtMs <= 250 ? sample.feedback?.label : "Move a hand to the target"}</strong><div>{(["left","right"] as const).map(side => <small key={side}>{side === "left" ? "L" : "R"} · {fresh && frame?.hands[side].bodyPart ? PLACEMENT_LABELS[frame.hands[side].bodyPart!] : "—"}</small>)}</div></div>}
        {finished && <div className={styles.finish}><span>{mode === "mock" ? "SIMULATED RUN COMPLETE" : "THAT’S A WRAP"}</span><strong>{format(run.score)}</strong><p>{Math.round(average * 100)}% average scrub quality · {run.bestCombo} best combo</p><button className={styles.primary} onClick={() => void prepare(mode)}>RUN IT BACK ↗</button>{mode === "mock" && <button className={styles.textButton} onClick={() => void prepare("camera")}>TRY WITH YOUR CAMERA →</button>}</div>}
      </section>
      <aside className={styles.dashboard}>
        <div className={styles.scoreCard}><span className={styles.label}>TOTAL POINTS</span><strong>{format(total).padStart(6,"0")}</strong><div><span>{finished ? "FINAL SCORE" : "THIS TARGET"}</span><b>{finished ? `${run.results.filter(r => r.success).length} / 8 CLEAN` : `+${format(run?.roundPoints ?? 0)}`}</b></div></div>
        <div className={styles.comboCard}><div><span className={styles.label}>CLEAN STREAK</span><b>×{(run?.multiplier ?? 1).toFixed(2)}</b></div><strong>{String(run?.combo ?? 0).padStart(2,"0")}<span>TARGET<br/>COMBO</span></strong><p>35% round quality keeps the chain.<br/>Each clean target adds ×0.25, up to ×2.5.</p></div>
        <div className={styles.qualityCard}><div><span className={styles.label}>{finished ? "AVERAGE QUALITY" : "ROUND QUALITY"}</span><strong>{Math.round(quality * 100)}<small>%</small></strong></div><div className={styles.qualityTrack}><i style={{width:`${quality * 100}%`}}/><b style={{left:`${COMBO_QUALITY * 100}%`}}/></div><p>{finished ? "ALL EIGHT WINDOWS COUNTED" : quality >= COMBO_QUALITY ? "COMBO SECURED — KEEP SCRUBBING" : "REACH THE MARK TO CHAIN"}</p><div className={styles.powerHeading}><span className={styles.label}>LIVE SCRUB POWER</span><b>{Math.round(power * 100)}%</b></div><div className={styles.powerBars}>{Array.from({length:20}, (_,i) => <i key={i} className={i < power * 20 ? styles.lit : ""}/>)}</div></div>
      </aside>
    </div>
    <section className={styles.sequence}><div className={styles.sequenceHeading}><span className={styles.label}>THE CLEANING ROUTE</span><span>WRONG SPOT OR HOLDING STILL = 0 POINTS</span></div><div className={styles.targets}>{CHALLENGE_TARGETS.map((item, i) => {
      const result = run?.results[i];
      return <div key={item} className={`${styles.targetTile} ${active && i === run.roundIndex ? styles.currentTile : ""} ${result?.success ? styles.cleanTile : result ? styles.failedTile : ""}`}><span>{String(i + 1).padStart(2,"0")} {result ? result.success ? "✓" : "×" : ""}</span><strong>{TARGET_LABELS[item]}</strong><small>{result ? `+${format(result.points)} · ${Math.round(result.quality * 100)}%` : active && i === run.roundIndex ? "SCRUB NOW" : `${duration / 1000}s WINDOW`}</small></div>;
    })}</div></section>
    <footer className={styles.footer}><label>SECONDS PER TARGET <select value={duration} disabled={ready || loading || !!run} onChange={event => setDuration(Number(event.target.value))}><option value={3000}>3 seconds</option><option value={5000}>5 seconds</option><option value={8000}>8 seconds</option></select></label><span>Quality averages your scrubbing over the entire window.</span>{(ready || loading || finished) && <button onClick={stop}>{finished ? "BACK TO SETUP" : "STOP & RESET"}</button>}</footer>
  </main>;
}
