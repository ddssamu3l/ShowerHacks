"use client";

import { useMemo } from "react";
import type { AgentActivity, GameState, Session } from "@vibecodemaxxing/contracts";
import { getAgentWindows } from "@vibecodemaxxing/game-engine";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const activityCopy: Record<AgentActivity, string> = {
  idle: "Waiting for you",
  analyzing: "Thinking",
  writing: "Writing code",
  testing: "Running tests",
  error: "Broke something",
  fixing: "Fixing it",
  done: "Done",
};

function currentTurnId(state: GameState) {
  if (state.phase === "typing" || state.phase === "agent" || state.phase === "judging") return state.turnId;
  return state.completedTurns.at(-1)?.turnId ?? "";
}

export function Agents({ session, state }: { session: Session; state: GameState }) {
  const turnId = currentTurnId(state);
  const windows = useMemo(
    () => getAgentWindows(session, state.transcript, turnId),
    [session, state.transcript, turnId],
  );
  if (!session.agents) return null;

  return (
    <Card className="gap-3 rounded-[20px] px-4 py-4" aria-label="Agents">
      {windows.map((agent) => (
        <div key={agent.id} className="grid gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-medium">{agent.name}</span>
            <span className="truncate text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
              {agent.role}
            </span>
            <span
              className={cn(
                "ml-auto shrink-0 text-xs transition-colors duration-200",
                agent.activity === "error" ? "text-destructive" : agent.activity === "idle" ? "text-muted-foreground" : "text-signal",
                agent.activity === "done" && "text-foreground",
              )}
            >
              {activityCopy[agent.activity]}
            </span>
          </div>
          <Progress
            value={agent.progress}
            className="h-1"
            indicatorClassName={cn(
              "duration-300",
              agent.activity === "error" ? "bg-destructive" : agent.activity === "done" ? "bg-foreground" : "bg-signal",
            )}
          />
        </div>
      ))}
    </Card>
  );
}
