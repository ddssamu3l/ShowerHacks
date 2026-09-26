import { sessionSchema, type Session } from "@vibecodemaxxing/contracts";
import shipIt from "../../../../../content/sessions/ship-it.json";

export const designSessions: Session[] = [sessionSchema.parse(shipIt)];

export function findSession(id: string | null): Session {
  return designSessions.find((session) => session.id === id) ?? designSessions[0];
}
