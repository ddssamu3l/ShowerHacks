"use client";

import { useMemo, useState } from "react";
import type { TranscriptEntry } from "@vibecodemaxxing/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function Editor({ entries }: { entries: readonly TranscriptEntry[] }) {
  const files = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      if (entry.kind === "agent" && entry.event.type === "file_update") map.set(entry.event.path, entry.event.content);
    }
    return map;
  }, [entries]);

  const paths = [...files.keys()];
  const latest = [...entries].reverse().find((entry) => entry.kind === "agent" && entry.event.type === "file_update");
  const latestPath = latest?.kind === "agent" && latest.event.type === "file_update" ? latest.event.path : null;
  // A manual pick only holds until the agent edits a file again.
  const [picked, setPicked] = useState<{ path: string; latestAt: number } | null>(null);
  const edits = entries.filter((entry) => entry.kind === "agent" && entry.event.type === "file_update").length;
  const active =
    picked && picked.latestAt === edits && files.has(picked.path) ? picked.path : (latestPath ?? paths[0]);
  const lines = active ? files.get(active)!.replace(/\n$/, "").split("\n") : [];

  return (
    <Card className="min-h-0 gap-0 rounded-[20px] py-0">
      <div className="flex min-h-12 items-center gap-1 px-2" role="tablist">
        {paths.length === 0 && <span className="px-3 font-mono text-xs text-muted-foreground">No files yet</span>}
        {paths.map((path) => (
          <Button
            key={path}
            type="button"
            size="sm"
            role="tab"
            aria-selected={path === active}
            variant="ghost"
            className="font-mono text-xs text-muted-foreground aria-selected:bg-accent aria-selected:text-foreground"
            onClick={() => setPicked({ path, latestAt: edits })}
          >
            {path}
          </Button>
        ))}
      </div>
      <Separator />
      {active ? (
        <ScrollArea className="min-h-0 flex-1">
          <pre className="m-0 py-3.5 font-mono text-[13px] leading-[1.6]">
            {lines.map((line, index) => (
              <span key={`${active}-${index}`} className="grid grid-cols-[44px_1fr]">
                <span className="pr-3.5 text-right text-[#4a4a4a] select-none">{index + 1}</span>
                <span className="pr-3 break-words whitespace-pre-wrap">{line || " "}</span>
              </span>
            ))}
          </pre>
        </ScrollArea>
      ) : (
        <p className="m-auto p-6 text-center text-sm text-muted-foreground">Files the agent touches show up here.</p>
      )}
    </Card>
  );
}
