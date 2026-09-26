"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { GameController, GameState } from "@vibecodemaxxing/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CameraView } from "../camera/CameraView";
import { useCamera, usePoseSnapshot } from "../camera/CameraProvider";
import { PixiWater } from "../shower/PixiWater";
import { createDesignGame } from "../design/design-game";
import { findSession } from "../design/session";
import { readPlayer, saveResult, type PlayerChoice } from "../design/run-storage";
import { Transcript } from "./Transcript";
import { Editor } from "./Editor";
import { PromptDock } from "./PromptDock";
import { useInWater } from "./useInWater";
import { AnimatedNumber } from "../fx/AnimatedNumber";
import { FlyingPoints, centerOf, type Flight } from "../fx/FlyingPoints";
import { PointPops, type Pop } from "../fx/PointPop";
import { useTimers } from "../fx/useTimers";

function useGame(game: GameController) {
  return useSyncExternalStore(game.subscribe, game.getState, game.getState);
}

function Meter({ label, value, onSpotlight }: { label: string; value: number; onSpotlight?: boolean }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="grid gap-1.5">
      <div className={cn("flex justify-between text-[13px] tabular-nums", onSpotlight ? "text-white/85" : "text-muted-foreground")}>
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <Progress
        value={percent}
        className={cn("h-2", onSpotlight && "bg-white/20")}
        indicatorClassName={cn("duration-150 ease-linear", onSpotlight ? "bg-white" : "bg-signal")}
      />
    </div>
  );
}

type Score = GameState["score"];

function ScoreBar({ state, score, practice }: { state: GameState; score: Score; practice: boolean }) {
  const turn = state.phase === "typing" || state.phase === "agent" ? state.turnIndex : state.completedTurns.length;
  return (
    <header className="col-span-2 flex h-14 items-center justify-between gap-4 px-2 max-lg:col-span-1">
      <div className="flex items-center gap-3">
        <span className="font-display text-xl font-medium tracking-[-0.04em]">Vibecodemaxxing</span>
        {practice && <Badge variant="secondary">Practice · not on the leaderboard</Badge>}
      </div>
      <ol className="flex gap-2" aria-label={`Prompt ${Math.min(turn + 1, state.turnCount)} of ${state.turnCount}`}>
        {Array.from({ length: state.turnCount }, (_, index) => {
          const done = index < state.completedTurns.length;
          const now = index === turn && state.phase !== "ready" && !done;
          return (
            <li
              key={index}
              className={cn(
                "h-1.5 w-7 rounded-full transition-colors duration-300",
                done ? "gradient-fill" : now ? (state.phase === "agent" ? "bg-signal" : "bg-violet-ink") : "bg-accent",
              )}
            />
          );
        })}
      </ol>
      <dl className="flex gap-6">
        <div className="grid justify-items-end" data-fx="typing-score">
          <dt className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">Typing</dt>
          <dd className="font-mono text-xl text-violet-ink tabular-nums">
            <AnimatedNumber value={score.typing} />
          </dd>
        </div>
        <div className="grid justify-items-end" data-fx="shower-score">
          <dt className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">Shower</dt>
          <dd className="font-mono text-xl text-signal tabular-nums">
            <AnimatedNumber value={score.shower} />
          </dd>
        </div>
        <div className="grid justify-items-end">
          <dt className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">Total</dt>
          <dd className="font-mono text-xl tabular-nums">
            <AnimatedNumber value={score.total} />
          </dd>
        </div>
      </dl>
    </header>
  );
}

const FLIGHT_MS = 850;

function PlayScreen({ player, game }: { player: PlayerChoice; game: GameController }) {
  const router = useRouter();
  const { request, stop, poseRef } = useCamera();
  const pose = usePoseSnapshot();
  const water = useInWater();
  const practice = player.inputMode === "mock";
  const state = useGame(game);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [go, setGo] = useState(false);
  const [shownScore, setShownScore] = useState<Score>(state.score);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [showerPops, setShowerPops] = useState<Pop[]>([]);
  const savedRef = useRef(false);
  const completedRef = useRef(0);
  const flightId = useRef(0);
  const { later, every, stopEvery } = useTimers();
  const dockRef = useRef<HTMLElement>(null);
  const showerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!practice) request();
  }, [practice, request]);

  const { isInWater } = water;
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (practice) {
        const efficiency = 0.55 + 0.35 * Math.sin(now / 700);
        game.ingestVision({ capturedAtMs: now, efficiency, confidence: 1, tracking: true });
        return;
      }
      const frame = poseRef.current;
      if (!frame.capturedAtMs) return;
      game.ingestVision({
        capturedAtMs: frame.capturedAtMs,
        efficiency: isInWater() ? frame.scrub : 0,
        confidence: frame.tracking ? 0.9 : 0,
        tracking: frame.tracking,
      });
    }, 66);
    return () => window.clearInterval(timer);
  }, [game, practice, poseRef, isInWater]);

  useEffect(() => {
    const count = state.completedTurns.length;
    if (count === completedRef.current) return;
    completedRef.current = count;
    const turn = state.completedTurns[count - 1];
    const typingTo = centerOf(document.querySelector('[data-fx="typing-score"] dd'));
    const showerTo = centerOf(document.querySelector('[data-fx="shower-score"] dd'));
    const typingFrom = centerOf(dockRef.current);
    const showerFrom = centerOf(showerRef.current);
    const next: Flight[] = [];
    if (typingFrom && typingTo) {
      next.push({ id: ++flightId.current, text: `+${Math.round(turn.typing.score)} typing`, from: typingFrom, to: typingTo, tone: "violet" });
    }
    if (showerFrom && showerTo) {
      next.push({ id: ++flightId.current, text: `+${Math.round(turn.shower.score)} shower`, from: showerFrom, to: showerTo, tone: "water" });
    }
    setFlights((current) => [...current, ...next]);
    const score = state.score;
    later(() => setShownScore(score), FLIGHT_MS - 150);
  }, [state, later]);

  useEffect(() => {
    if (state.phase !== "finished" || savedRef.current) return;
    savedRef.current = true;
    saveResult(state.result);
    later(() => {
      stop();
      router.push("/results");
    }, FLIGHT_MS + 500);
  }, [state, router, stop, later]);

  const showering = state.phase === "agent";
  const live = state.phase === "agent" ? state.liveEfficiency : 0;
  const agentMs = state.phase === "agent" ? state.agentEndsAtMs - state.agentStartedAtMs : 0;
  const wet = showering && (water.inWater || practice);

  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => {
    if (!showering || !agentMs) return;
    let id = 0;
    const timer = window.setInterval(() => {
      const value = Math.round((liveRef.current * 100 * 1000) / agentMs);
      if (value < 1) return;
      const popIdValue = ++id;
      setShowerPops((current) => [...current, { id: popIdValue, text: `+${value}` }]);
      later(() => setShowerPops((current) => current.filter((pop) => pop.id !== popIdValue)), 700);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [showering, agentMs, later]);

  const start = useCallback(() => {
    setCountdown(3);
    let count = 3;
    const timer = every(() => {
      count -= 1;
      if (count === 0) {
        stopEvery(timer);
        setCountdown(null);
        game.start();
        setGo(true);
        later(() => setGo(false), 550);
      } else {
        setCountdown(count);
      }
    }, 700);
  }, [game, every, stopEvery, later]);

  return (
    <div className="grid h-svh grid-cols-[minmax(0,1fr)_minmax(300px,380px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-3 max-lg:h-auto max-lg:grid-cols-1">
      <ScoreBar state={state} score={shownScore} practice={practice} />
      <section className="relative min-h-0 max-lg:aspect-[4/3]" aria-label="Your shower">
        <CameraView
          className="aspect-auto size-full"
          onBodyX={water.setBodyX}
          bubbles={wet}
          message={practice ? "Practice mode. The shower scores itself." : undefined}
        >
          <PixiWater active={showering} onMove={water.setWaterX} />
        </CameraView>
        <Card
          ref={showerRef}
          className={cn(
            "absolute bottom-4 left-4 z-10 w-[min(300px,calc(100%-2rem))] overflow-visible rounded-[20px] transition-[background-color,box-shadow] duration-300",
            wet
              ? "spotlight-water bg-[#0a6fd6] text-white ring-0"
              : "bg-black/60 ring-white/10 backdrop-blur-md",
            showering && !wet && "ring-signal/50",
          )}
        >
          <CardContent className="relative grid gap-3">
            <span className="pointer-events-none absolute top-1 right-8 size-0">
              <PointPops pops={showerPops} className="text-white" />
            </span>
            <p
              className={cn(
                "text-[15px] font-medium",
                showering && !wet && "animate-[nudge_1.6s_var(--ease-out)_infinite] text-signal",
              )}
            >
              {showering ? (wet ? "Under the water. Scrub!" : "Get under the water.") : "Shower is off while you type."}
            </p>
            <Meter label="Scrubbing" value={practice ? live : pose.scrub} onSpotlight={wet} />
            <Meter label="This shower" value={live} onSpotlight={wet} />
          </CardContent>
        </Card>
      </section>
      <aside className="grid min-h-0 grid-rows-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3 max-lg:grid-rows-none" aria-label="Coding agent">
        <Transcript entries={state.transcript} working={showering} />
        <Editor entries={state.transcript} />
      </aside>
      <section ref={dockRef} className="col-span-2 max-lg:col-span-1" aria-label="Prompt">
        <PromptDock
          state={state}
          countdown={countdown}
          go={go}
          onStart={start}
          onSubmit={(text) => game.submitPrompt(text)}
        />
      </section>
      <FlyingPoints flights={flights} onDone={(id) => setFlights((current) => current.filter((flight) => flight.id !== id))} />
    </div>
  );
}

export function Play() {
  const router = useRouter();
  const [round, setRound] = useState<{ player: PlayerChoice; game: GameController } | null>(null);

  useEffect(() => {
    const player = readPlayer();
    if (!player) {
      router.replace("/");
      return;
    }
    const game = createDesignGame({
      session: findSession(player.sessionId),
      nickname: player.nickname,
      inputMode: player.inputMode,
    });
    setRound({ player, game });
    return () => game.dispose();
  }, [router]);

  if (!round) return null;
  return <PlayScreen key={round.game.getState().runId} player={round.player} game={round.game} />;
}
