"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SCORING_VERSION, type GameResult, type LeaderboardEntry } from "@vibecodemaxxing/contracts";
import { scoreTyping } from "@vibecodemaxxing/game-engine";
import { useCamera } from "../camera/CameraProvider";
import { findSession } from "../design/session";
import { readResult } from "../design/run-storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { LeaderboardRankings } from "./LeaderboardRankings";
import { motion } from "motion/react";
import { AnimatedNumber } from "../fx/AnimatedNumber";
import { Confetti } from "../fx/Confetti";

const shipIt = findSession("ship-it");
const sampleTyping = (index: number, submitted: string, durationMs: number) =>
  scoreTyping({ target: shipIt.turns[index].prompt, submitted, durationMs });

const sampleResult: GameResult = {
  runId: "00000000-0000-4000-8000-000000000000",
  nickname: "sample_run",
  sessionId: "ship-it",
  sessionVersion: 1,
  scoringVersion: SCORING_VERSION,
  inputMode: "camera",
  completedAt: "2026-09-26T18:00:00.000Z",
  typingScore: 71.4,
  showerScore: 58.2,
  totalScore: 6480,
  turns: [
    {
      turnId: "add-button",
      typing: sampleTyping(0, "Add a button that says Ship it.", 7200),
      shower: { durationMs: 12000, averageEfficiency: 0.52, trackingCoverage: 0.94, score: 52 },
    },
    {
      turnId: "fix-button",
      typing: sampleTyping(1, "The button says Sink it. Change it to Ship it and stop instaling plumbing.", 18400),
      shower: { durationMs: 16000, averageEfficiency: 0.66, trackingCoverage: 0.98, score: 66 },
    },
    {
      turnId: "stop-ocean",
      typing: sampleTyping(2, "DO NOT REFACTOR THE OCEAN. JUST MAKE THE BUTTON SAY SHIP IT.", 15900),
      shower: { durationMs: 10000, averageEfficiency: 0.566, trackingCoverage: 0.9, score: 56.6 },
    },
  ],
};

const rivals: Array<[string, number, number]> = [
  ["scrubzilla", 82.1, 77.4],
  ["npm_install_soap", 74.9, 69.3],
  ["loofah_driven_dev", 68.2, 64.8],
  ["tabs_not_towels", 79.5, 41.2],
  ["rm -rf dirt", 55.3, 66.9],
  ["ship_it_wet", 61.0, 48.7],
  ["merge_conflict", 44.8, 39.1],
];

function useLeaderboard(result: GameResult) {
  return useMemo(() => {
    const entries: LeaderboardEntry[] = rivals.map(([nickname, typing, shower], index) => ({
      runId: `rival-${index}`,
      nickname,
      sessionId: result.sessionId,
      sessionVersion: result.sessionVersion,
      scoringVersion: result.scoringVersion,
      typingScore: typing,
      showerScore: shower,
      totalScore: Math.round(50 * typing + 50 * shower),
      completedAt: "2026-09-26T17:00:00.000Z",
    }));
    if (result.inputMode === "camera") {
      entries.push({
        runId: result.runId,
        nickname: result.nickname,
        sessionId: result.sessionId,
        sessionVersion: result.sessionVersion,
        scoringVersion: result.scoringVersion,
        typingScore: result.typingScore,
        showerScore: result.showerScore,
        totalScore: result.totalScore,
        completedAt: result.completedAt,
      });
    }
    entries.sort((a, b) => b.totalScore - a.totalScore);
    const rank = entries.findIndex((entry) => entry.runId === result.runId) + 1;
    return { entries: entries.slice(0, 10), rank };
  }, [result]);
}

export function Results() {
  const { stop } = useCamera();
  const [stored, setStored] = useState<GameResult | null | undefined>(undefined);

  useEffect(() => {
    stop();
    setStored(readResult());
  }, [stop]);

  if (stored === undefined) return null;
  return <ResultsScreen result={stored ?? sampleResult} isSample={!stored} />;
}

function ResultsScreen({ result, isSample }: { result: GameResult; isSample: boolean }) {
  const session = findSession(result.sessionId);
  const { entries, rank } = useLeaderboard(result);
  const practice = result.inputMode === "mock";
  const celebrate = !practice && rank > 0 && rank <= 3;
  const parts = [
    { label: "Typing", value: result.typingScore, text: "text-foreground", bar: "bg-foreground" },
    { label: "Shower", value: result.showerScore, text: "text-signal", bar: "bg-signal" },
  ];

  return (
    <main className="mx-auto grid max-w-[1200px] gap-10 px-6 py-12 md:px-10 lg:grid-cols-2 lg:gap-16">
      <div className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <motion.div
            className="relative flex flex-col gap-3 rounded-[30px] bg-foreground p-8 text-black"
            initial={{ opacity: 0, transform: "translateY(12px) scale(0.98)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          >
            {celebrate && <Confetti />}
            <p className="text-[13px] font-medium text-black/60">
              {isSample ? "Sample run · play a round to see yours" : session.title}
            </p>
            <p className="font-display text-[clamp(4rem,9vw,6.9rem)] leading-[0.85] font-medium tracking-[-0.05em] tabular-nums">
              <AnimatedNumber value={result.totalScore} mode="count" duration={1.2} />
              <span className="ml-3 font-sans text-lg tracking-normal text-black/50">/ 10,000</span>
            </p>
            <p className="text-lg leading-[1.3] text-black/80">
              {practice
                ? "Practice runs don't go on the leaderboard. Play with your camera to post a score."
                : rank > 0
                  ? `Rank ${rank} on ${session.title}.`
                  : "Saved."}
            </p>
          </motion.div>

          <div className="grid grid-cols-2 gap-3">
            {parts.map((part) => (
              <Card key={part.label} className="rounded-[20px]">
                <CardContent className="grid gap-2">
                  <span className="text-[13px] font-medium text-muted-foreground">{part.label}</span>
                  <AnimatedNumber value={part.value} mode="count" duration={1} className={cn("font-mono text-3xl tabular-nums", part.text)} />
                  <Progress value={part.value} className="h-2" indicatorClassName={part.bar} />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/play">Play again</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/">Change name or session</Link>
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-label="Each prompt">
          <h2 className="font-display text-[22px] font-medium tracking-[-0.03em]">Each prompt</h2>
          <ol className="grid gap-2">
            {result.turns.map((turn, index) => {
              const prompt = session.turns.find((item) => item.id === turn.turnId)?.prompt ?? turn.turnId;
              return (
                <li
                  key={turn.turnId}
                  className="grid grid-cols-[24px_1fr_40px_40px] items-center gap-3 rounded-[15px] bg-card px-4 py-3 ring-1 ring-border"
                >
                  <span className="font-mono text-sm text-muted-foreground">{index + 1}</span>
                  <div className="grid min-w-0 gap-1">
                    <p className="font-mono text-[13px] leading-[1.4]">{prompt}</p>
                    <p className="text-xs text-muted-foreground">
                      {(turn.typing.durationMs / 1000).toFixed(1)}s · {turn.typing.notes.join(" · ")} ·{" "}
                      {Math.round(turn.shower.trackingCoverage * 100)}% of the shower on camera
                    </p>
                  </div>
                  <span className="text-right font-mono text-lg tabular-nums">{Math.round(turn.typing.score)}</span>
                  <span className="text-right font-mono text-lg text-signal tabular-nums">
                    {Math.round(turn.shower.score)}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <section aria-label="Leaderboard" className="lg:pt-0">
        <LeaderboardRankings
          title="Leaderboard"
          description={`Top 10 on ${session.title}`}
          entries={entries}
          currentRunId={practice ? undefined : result.runId}
          currentRank={rank}
        />
      </section>
    </main>
  );
}
