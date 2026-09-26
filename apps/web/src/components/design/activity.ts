/** Which activity fills the agent phase of a turn. Turns alternate: shower, fog wipe, shower, ... */
export type Activity = "shower" | "fog";

export function activityForTurn(turnIndex: number): Activity {
  return turnIndex % 2 === 0 ? "shower" : "fog";
}

export const activityLabel: Record<Activity, { title: string; verb: string; points: string }> = {
  shower: { title: "Shower", verb: "Go scrub.", points: "shower" },
  fog: { title: "Fog wipe", verb: "Wipe the camera.", points: "wipe" },
};
