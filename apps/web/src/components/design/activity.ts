/** Which activity fills the agent phase of a turn. Turns rotate: shower, fog wipe, six seven, shower, ... */
export type Activity = "shower" | "fog" | "sixseven";

const ROTATION: readonly Activity[] = ["shower", "fog", "sixseven"];

export function activityForTurn(turnIndex: number): Activity {
  return ROTATION[turnIndex % ROTATION.length];
}

export const activityLabel: Record<Activity, { title: string; verb: string; points: string }> = {
  shower: { title: "Shower", verb: "Go scrub.", points: "shower" },
  fog: { title: "Fog wipe", verb: "Wipe the camera.", points: "wipe" },
  sixseven: { title: "Six seven", verb: "Six! Seven!", points: "six seven" },
};
