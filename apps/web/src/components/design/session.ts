import { sessionSchema, type Session } from "@vibecodemaxxing/contracts";
import commitToLove from "../../../../../content/sessions/commit-to-love.json";
import shipIt from "../../../../../content/sessions/ship-it.json";

export const designSessions: Session[] = [sessionSchema.parse(commitToLove), sessionSchema.parse(shipIt)];

export function findSession(id: string | null): Session {
  return designSessions.find((session) => session.id === id) ?? designSessions[0];
}
