"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hand, RotateCcw, Play as PlayIcon } from "lucide-react";
import { createSixSeven, scoreSixSeven, sixSevenProgress, freezeSixSeven, type SixSevenState } from "@vibecodemaxxing/game-engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CameraView } from "../camera/CameraView";
import { useCamera } from "../camera/CameraProvider";
import { SixSevenLayer } from "./SixSevenLayer";

/** Standalone tuning page for the Six Seven gesture: one timed round on the real camera or the synthetic hands. */

const ROUND_MS = 15_000;
type Phase = "idle" | "playing" | "done";

export function SixSevenPractice() {
  const { status, request, poseRef } = useCamera();
  const [practice, setPractice] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState(0);
  const [left, setLeft] = useState(ROUND_MS);
  const [hands, setHands] = useState(0);
  const [beats, setBeats] = useState(0);
  const stateRef = useRef<SixSevenState>(createSixSeven({ durationMs: ROUND_MS }));
  const endAt = useRef(0);

  useEffect(() => {
    if (!practice) request();
  }, [practice, request]);

  const start = useCallback(() => {
    stateRef.current = createSixSeven({ durationMs: ROUND_MS });
    setBeats(0);
    setRound((n) => n + 1);
    endAt.current = performance.now() + ROUND_MS;
    setLeft(ROUND_MS);
    setPhase("playing");
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      const remaining = endAt.current - performance.now();
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        freezeSixSeven(stateRef.current);
        setPhase("done");
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [phase]);

  const state = stateRef.current;
  const playing = phase === "playing";
  const ready = practice || status === "ready";

  return (
    <main className="mx-auto grid min-h-svh max-w-5xl content-start gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-[-0.04em]">Six seven</h1>
          <p className="text-sm text-muted-foreground">Palms up, rock them like a scale. Every swing is a six or a seven.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{practice ? "Synthetic hands" : status === "ready" ? "Camera on" : "Camera starting"}</Badge>
          <Button variant="outline" size="sm" onClick={() => setPractice((v) => !v)}>
            <Hand /> {practice ? "Use camera" : "No camera"}
          </Button>
        </div>
      </header>

      <div className="relative aspect-[16/9] w-full">
        <CameraView className="aspect-auto size-full" bubbles={playing && hands === 2} message={practice ? "" : undefined}>
          <SixSevenLayer
            key={round}
            state={state}
            poseRef={poseRef}
            active={playing}
            practice={practice}
            onHands={setHands}
            onBeat={(_, count) => setBeats(count)}
          />
        </CameraView>
        <Card className={cn("absolute bottom-3 left-3 z-10 w-[min(360px,calc(100%-1.5rem))] rounded-2xl py-3", playing && hands === 2 ? "bg-water text-white ring-0" : "bg-black/60 ring-white/10 backdrop-blur-md")}>
          <CardContent className="grid gap-2 px-4">
            <div className="flex items-center justify-between text-[13px] font-medium">
              <span>
                {phase === "idle" && "Press start."}
                {playing && (hands === 2 ? "Six! Seven!" : "Show both hands, palms up.")}
                {phase === "done" && `Round over: ${Math.round(scoreSixSeven(state))} points.`}
              </span>
              <span className="font-mono tabular-nums">{(left / 1000).toFixed(1)}s</span>
            </div>
            <div className="flex justify-between text-[13px] tabular-nums">
              <span>Beats</span>
              <span>{beats} / {state.targetBeats}</span>
            </div>
            <Progress value={Math.round(sixSevenProgress(state) * 100)} className="h-2" indicatorClassName={playing && hands === 2 ? "bg-white" : "bg-signal"} />
            {phase === "done" && <p className="text-[13px] text-inherit/80">Best streak {state.bestStreak}.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button onClick={start} disabled={!ready || playing}>
          {phase === "done" ? <RotateCcw /> : <PlayIcon />} {phase === "done" ? "Again" : "Start 15 s round"}
        </Button>
      </div>
    </main>
  );
}
