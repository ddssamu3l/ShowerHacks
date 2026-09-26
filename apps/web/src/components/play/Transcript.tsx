"use client";

import { useEffect, useMemo, useRef } from "react";
import type { AgentDefinition, AgentEvent, TranscriptEntry } from "@vibecodemaxxing/contracts";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type ToolResult = Extract<AgentEvent, { type: "tool_result" }>;

const enter = "animate-[rise_260ms_cubic-bezier(0.2,0.8,0.2,1)]";

interface TranscriptProps {
  entries: readonly TranscriptEntry[];
  working: boolean;
  agents?: readonly AgentDefinition[];
}

export function Transcript({ entries, working, agents }: TranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const names = useMemo(() => new Map(agents?.map((agent) => [agent.id, agent.name])), [agents]);

  const results = useMemo(() => {
    const map = new Map<string, ToolResult>();
    for (const entry of entries) {
      if (entry.kind === "agent" && entry.event.type === "tool_result") map.set(entry.event.callId, entry.event);
    }
    return map;
  }, [entries]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [entries.length, working]);

  if (entries.length === 0) {
    return (
      <Card className="min-h-0 items-center justify-center rounded-[20px]">
        <p className="text-muted-foreground">{agents && agents.length > 1 ? "The agents are" : "The agent is"} waiting for your first prompt.</p>
      </Card>
    );
  }

  return (
    <Card className="min-h-0 gap-0 rounded-[20px] py-0">
      <ScrollArea className="h-full min-h-0">
        <div className="flex flex-col gap-3 p-5" aria-live="polite">
          {entries.map((entry) => {
            if (entry.kind === "user") {
              return (
                <div
                  key={entry.id}
                  className={`grid max-w-[88%] gap-1 self-end rounded-2xl rounded-br-sm bg-accent px-3.5 py-2.5 ${enter}`}
                >
                  <span className="text-xs font-medium text-muted-foreground">You</span>
                  <p className="font-mono text-sm leading-[1.45]">{entry.text}</p>
                </div>
              );
            }
            const event = entry.event;
            if (event.type === "assistant_message") {
              return (
                <div key={event.id} className={`grid max-w-[88%] gap-1 ${enter}`}>
                  <span className="text-xs font-medium text-muted-foreground">
                    {(event.agentId && names.get(event.agentId)) ?? "Agent"}
                  </span>
                  <p className="text-[15px] leading-[1.4]">{event.text}</p>
                </div>
              );
            }
            if (event.type === "tool_call") {
              const result = results.get(event.id);
              return (
                <div key={event.id} className={`grid gap-2 rounded-[10px] bg-background p-3 ring-1 ring-border ${enter}`}>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">
                      {event.agentId && names.get(event.agentId) ? `${names.get(event.agentId)} · ` : ""}
                      {event.tool}
                    </span>
                    <motion.span
                      key={result?.status ?? "pending"}
                      initial={{ opacity: 0, transform: "scale(0.85)" }}
                      animate={{ opacity: 1, transform: "scale(1)" }}
                      transition={{ type: "spring", duration: 0.35, bounce: 0.45 }}
                    >
                      {!result && <Badge variant="secondary">Running</Badge>}
                      {result?.status === "success" && (
                        <Badge variant="outline" className="border-success/40 text-success">
                          Done
                        </Badge>
                      )}
                      {result?.status === "error" && <Badge variant="destructive">Failed</Badge>}
                    </motion.span>
                  </div>
                  <code className="font-mono text-[13px] break-words whitespace-pre-wrap">$ {event.input}</code>
                  {result && (
                    <pre className="m-0 font-mono text-[13px] break-words whitespace-pre-wrap text-muted-foreground">
                      {result.output}
                    </pre>
                  )}
                </div>
              );
            }
            if (event.type === "file_update") {
              return (
                <p key={event.id} className="text-[13px] text-muted-foreground">
                  Edited <code className="font-mono text-foreground">{event.path}</code>
                </p>
              );
            }
            return null;
          })}
          {working && (
            <p className="flex gap-1.5 py-1" aria-label="Agent is working">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="size-1.5 animate-[blink_1s_infinite] rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </p>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>
    </Card>
  );
}
