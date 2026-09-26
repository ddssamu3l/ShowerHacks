import { describe, expect, it } from "vitest";
import { sessionSchema, type Session, type TranscriptEntry } from "@vibecodemaxxing/contracts";
import source from "../../../content/sessions/commit-to-love.json";
import legacy from "../../../content/sessions/ship-it.json";
import { getAgentWindows } from "./agent-windows";

const session = sessionSchema.parse(source);
function revealed(turnIndex: number, elapsed: number): TranscriptEntry[] {
  const turn = session.turns[turnIndex];
  return turn.agent.events.filter((event) => event.atMs <= elapsed)
    .map((event) => ({ kind: "agent", turnId: turn.id, event }));
}

describe("three-agent session replay", () => {
  it("has ten prompts and completes three windows on every turn", () => {
    expect(session.turns).toHaveLength(10);
    expect(session.agents).toHaveLength(3);
    session.turns.forEach((turn, index) => {
      const windows = getAgentWindows(session, revealed(index, turn.agent.durationMs), turn.id);
      expect(windows).toHaveLength(3);
      for (const window of windows) {
        expect(window.activity).toBe("done");
        expect(window.progress).toBe(100);
        expect(window.events.every((event) => event.agentId === window.id)).toBe(true);
      }
      expect(windows[2].tools.map((tool) => tool.result?.status)).toEqual(["error", "success"]);
    });
  });

  it("does not reveal script events before the controller emits them", () => {
    const windows = getAgentWindows(session, [], "swipe");
    expect(windows.every((window) => window.events.length === 0 && window.progress === 0)).toBe(true);
    const pending = getAgentWindows(session, revealed(0, 3000), "swipe")[2];
    expect(pending.activity).toBe("testing");
    expect(pending.tools[0].result).toBeUndefined();
    const failed = getAgentWindows(session, revealed(0, 4400), "swipe")[2];
    expect(failed.activity).toBe("error");
    expect(failed.tools[0].result?.status).toBe("error");
    expect(pending.tools[0].result).toBeUndefined();
  });

  it("resets turn activity but preserves mock files without mutating inputs", () => {
    const transcript = revealed(0, 12000);
    const before = JSON.stringify({ session, transcript });
    const windows = getAgentWindows(session, transcript, "compatibility");
    expect(windows.every((window) => window.events.length === 0 && window.activity === "idle")).toBe(true);
    expect(windows[0].files["src/swipe-card.tsx"]).toBeDefined();
    expect(windows[1].files["src/swipe-card.tsx"]).toBeUndefined();
    expect(JSON.stringify({ session, transcript })).toBe(before);
  });

  it("keeps global summaries out of windows and supports the original session", () => {
    const events = revealed(0, 12000);
    const windows = getAgentWindows(session, events, "swipe");
    expect(windows.flatMap((window) => window.events)).toHaveLength(events.length - 1);
    const old = sessionSchema.parse(legacy);
    const transcript: TranscriptEntry[] = old.turns[0].agent.events.map((event) => ({ kind: "agent", turnId: old.turns[0].id, event }));
    expect(getAgentWindows(old, transcript, old.turns[0].id)[0].events).toHaveLength(transcript.length);
  });
});

describe("agent authoring validation", () => {
  const invalid = (edit: (copy: Session) => void) => {
    const copy = structuredClone(session);
    edit(copy);
    expect(sessionSchema.safeParse(copy).success).toBe(false);
  };
  it("rejects duplicate agents and undeclared routing", () => {
    invalid((copy) => { copy.agents![1].id = copy.agents![0].id; });
    invalid((copy) => { copy.turns[0].agent.events[0].agentId = "imaginary"; });
  });
  it("requires routed progress and bounds its values", () => {
    invalid((copy) => { delete copy.turns[0].agent.events[0].agentId; });
    invalid((copy) => { copy.turns[0].agent.events[0].progress = 101; });
    invalid((copy) => { copy.turns[0].agent.events[0].progress = -1; });
  });
  it("rejects tool results attributed to a different agent", () => {
    invalid((copy) => {
      copy.turns[0].agent.events.find((event) => event.type === "tool_result")!.agentId = "backend";
    });
  });
  it("still rejects unresolved calls, bad ordering, and missing final responses", () => {
    invalid((copy) => { copy.turns[0].agent.events = copy.turns[0].agent.events.filter((event) => event.type !== "tool_result"); });
    invalid((copy) => { copy.turns[0].agent.events[0].atMs = 9000; });
    invalid((copy) => { copy.turns[0].agent.events.pop(); });
  });
});
