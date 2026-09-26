import { z } from "zod";

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const offset = z.number().int().nonnegative();
const eventBase = { id, atMs: offset };

export const agentEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...eventBase, type: z.literal("assistant_message"), text: z.string().min(1) }),
  z.strictObject({ ...eventBase, type: z.literal("tool_call"), tool: z.string().min(1), input: z.string() }),
  z.strictObject({ ...eventBase, type: z.literal("tool_result"), callId: id, output: z.string(), status: z.enum(["success", "error"]) }),
  z.strictObject({ ...eventBase, type: z.literal("file_update"), path: z.string().min(1), language: z.string().min(1), content: z.string() }),
]);

// This base produces the editor JSON Schema; semantic checks below run in validation.
export const sessionShapeSchema = z.strictObject({
  $schema: z.string().optional(),
  schemaVersion: z.literal(1),
  id,
  sessionVersion: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  turns: z.array(z.strictObject({
    id,
    prompt: z.string().min(1).max(500).regex(/^[^\r\n]+$/),
    agent: z.strictObject({
      durationMs: z.number().int().min(1_000).max(120_000),
      events: z.array(agentEventSchema).min(1),
    }),
  })).min(1).max(20),
});

export const sessionSchema = sessionShapeSchema.superRefine((session, ctx) => {
  const turnIds = new Set<string>();
  const eventIds = new Set<string>();
  session.turns.forEach((turn, turnIndex) => {
    const turnPath = ["turns", turnIndex];
    if (turnIds.has(turn.id)) ctx.addIssue({ code: "custom", path: [...turnPath, "id"], message: "Turn IDs must be unique." });
    turnIds.add(turn.id);

    let previousOffset = -1;
    const pendingCalls = new Set<string>();
    turn.agent.events.forEach((event, eventIndex) => {
      const path = [...turnPath, "agent", "events", eventIndex];
      if (eventIds.has(event.id)) ctx.addIssue({ code: "custom", path: [...path, "id"], message: "Event IDs must be unique across the session." });
      eventIds.add(event.id);
      if (event.atMs < previousOffset || event.atMs > turn.agent.durationMs) {
        ctx.addIssue({ code: "custom", path: [...path, "atMs"], message: "Events must be ordered and fall within durationMs." });
      }
      previousOffset = event.atMs;
      if (event.type === "tool_call") pendingCalls.add(event.id);
      if (event.type === "tool_result" && !pendingCalls.delete(event.callId)) {
        ctx.addIssue({ code: "custom", path: [...path, "callId"], message: "A result must reference an earlier, unresolved tool call in this turn." });
      }
    });
    if (pendingCalls.size) ctx.addIssue({ code: "custom", path: [...turnPath, "agent", "events"], message: "Every tool call must have exactly one result." });
    const last = turn.agent.events.at(-1);
    if (last?.type !== "assistant_message" || last.atMs !== turn.agent.durationMs) {
      ctx.addIssue({ code: "custom", path: [...turnPath, "agent", "events"], message: "Each turn must end with an assistant_message at exactly durationMs." });
    }
  });
});

export type AgentEvent = z.infer<typeof agentEventSchema>;
export type Session = z.infer<typeof sessionShapeSchema>;
export type SessionSummary = Pick<Session, "id" | "sessionVersion" | "title" | "description"> & { turnCount: number };
