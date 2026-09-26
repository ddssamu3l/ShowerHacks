import type { Landmark } from "./types";
import type { ScrubTarget } from "./scrub-motion";

/** Synthetic landmarks use the real tracking, activity, and scoring pipeline. */
export function challengeDemoPose(target: ScrubTarget, at: number): Landmark[] {
  const pose = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
  const set = (id: number, x: number, y: number) => { pose[id] = { x, y, visibility: .99 }; };
  set(0, .5, .25); set(11, .66, .43); set(12, .34, .43);
  set(13, .75, .72); set(14, .25, .72); set(15, .80, .9); set(16, .20, .9);
  const wave = Math.sin(at / 1000 * Math.PI * 4) * .045;
  if (target === "hair") set(15, .5 + wave, .14);
  if (target === "chest") set(15, .5 + wave, .65);
  if (target === "left-shoulder") set(16, .66 + wave, .43);
  if (target === "right-shoulder") set(15, .34 + wave, .43);
  if (target === "left-arm") set(16, .72, .64 + wave);
  if (target === "right-arm") set(15, .28, .64 + wave);
  if (target === "left-pit") { set(13, .85, .28); set(16, .62 + wave * .7, .51); }
  if (target === "right-pit") { set(14, .15, .28); set(15, .38 + wave * .7, .51); }
  return pose;
}
