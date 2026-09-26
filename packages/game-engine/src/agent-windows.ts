import type { AgentActivity, AgentDefinition, AgentEvent, Session, TranscriptEntry } from "@vibecodemaxxing/contracts";

type FileUpdate = Extract<AgentEvent, { type: "file_update" }>;
type ToolCall = Extract<AgentEvent, { type: "tool_call" }>;
type ToolResult = Extract<AgentEvent, { type: "tool_result" }>;

export interface AgentWindow extends AgentDefinition {
  activity: AgentActivity;
  progress: number;
  events: AgentEvent[];
  tools: { call: ToolCall; result?: ToolResult }[];
  files: Record<string, FileUpdate>;
}

/**
 * Project only events already revealed by the game controller. Never pass the
 * session's future script here. No timers, scoring, commands, or filesystem IO.
 * Activity/logs/tools reset for turnId; mock files persist across visible turns.
 * Untagged events in multi-agent sessions stay in the shared transcript.
 */
export function getAgentWindows(
  session: Session,
  transcript: readonly TranscriptEntry[],
  turnId: string,
): AgentWindow[] {
  const definitions = session.agents ?? [{ id: "agent", name: "Agent 01", role: "CODING" }];
  const windows: AgentWindow[] = definitions.map((agent) => ({
    ...agent, activity: "idle", progress: 0, events: [], tools: [], files: Object.create(null),
  }));
  const byId = new Map(windows.map((window) => [window.id, window]));
  for (const entry of transcript) {
    if (entry.kind !== "agent") continue;
    const event = entry.event;
    const window = byId.get(event.agentId ?? (session.agents ? "" : "agent"));
    if (!window) continue;
    if (event.type === "file_update") window.files[event.path] = event;
    if (entry.turnId !== turnId) continue;
    window.events.push(event);
    if (event.activity !== undefined) window.activity = event.activity;
    if (event.progress !== undefined) window.progress = event.progress;
    if (event.type === "tool_call") window.tools.push({ call: event });
    if (event.type === "tool_result") {
      const tool = window.tools.find(({ call }) => call.id === event.callId);
      if (tool) tool.result = event;
    }
  }
  return windows;
}
