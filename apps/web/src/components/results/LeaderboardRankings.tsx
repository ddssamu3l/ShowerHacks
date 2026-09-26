"use client";

import { Award, Crown, Medal } from "lucide-react";
import { motion } from "motion/react";
import type { LeaderboardEntry } from "@vibecodemaxxing/contracts";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Layout rebuilt after 21st.dev "Leaderboard Rankings" (trophyso) from shadcn primitives.

const podiumIcons = [Crown, Medal, Award];

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

function RankMark({ rank }: { rank: number }) {
  const Icon = podiumIcons[rank - 1];
  if (Icon) {
    return (
      <span
        className={cn(
          "grid size-8 place-items-center rounded-full",
          rank === 1 ? "bg-foreground text-black" : rank === 2 ? "bg-accent text-foreground ring-1 ring-border" : "bg-heat/20 text-heat",
        )}
        aria-label={`Rank ${rank}`}
      >
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <span className="grid size-8 place-items-center font-mono text-sm text-muted-foreground tabular-nums">{rank}</span>
  );
}

interface LeaderboardRankingsProps {
  title: string;
  description: string;
  entries: LeaderboardEntry[];
  currentRunId?: string;
  currentRank?: number;
}

export function LeaderboardRankings({ title, description, entries, currentRunId, currentRank }: LeaderboardRankingsProps) {
  const youInTop = entries.some((entry) => entry.runId === currentRunId);

  return (
    <Card className="gap-0 rounded-[20px] py-0">
      <CardHeader className="border-b py-5">
        <CardTitle className="font-display text-[22px] font-medium tracking-[-0.03em]">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-2 py-2">
        <ol className="grid">
          {entries.map((entry, index) => {
            const rank = index + 1;
            const you = entry.runId === currentRunId;
            return (
              <motion.li
                key={entry.runId}
                initial={{ opacity: 0, transform: you ? "translateY(28px)" : "translateY(8px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={
                  you
                    ? { type: "spring", duration: 0.6, bounce: 0.25, delay: 0.15 + entries.length * 0.04 }
                    : { duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: 0.15 + index * 0.04 }
                }
                className={cn(
                  "grid grid-cols-[32px_32px_1fr_auto] items-center gap-3 rounded-[14px] px-3 py-2.5 transition-colors",
                  you ? "bg-accent ring-1 ring-signal/40" : "hover:bg-muted/60",
                )}
              >
                <RankMark rank={rank} />
                <Avatar>
                  <AvatarFallback className={cn("text-xs font-medium", you && "bg-signal text-white")}>
                    {initials(entry.nickname)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex items-center gap-2 truncate text-[15px] font-medium">
                    <span className="truncate">{entry.nickname}</span>
                    {you && (
                      <Badge variant="outline" className="border-signal/50 text-signal">
                        You
                      </Badge>
                    )}
                  </span>
                  <span className="text-[13px] text-muted-foreground tabular-nums">
                    <span className="text-foreground">Typing {Math.round(entry.typingScore)}</span> ·{" "}
                    <span className="text-signal">Shower {Math.round(entry.showerScore)}</span>
                  </span>
                </div>
                <span className="font-mono text-base tabular-nums">{entry.totalScore.toLocaleString()}</span>
              </motion.li>
            );
          })}
        </ol>
      </CardContent>
      {currentRunId && !youInTop && currentRank !== undefined && currentRank > 0 && (
        <CardFooter className="justify-between bg-transparent text-sm text-muted-foreground">
          <span>Your rank</span>
          <span className="font-mono text-foreground tabular-nums">#{currentRank}</span>
        </CardFooter>
      )}
    </Card>
  );
}
