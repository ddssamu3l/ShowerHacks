// One full left/right cycle. Distances are fractions of character height.
export const BOSS_WALK = Object.freeze({ duration: 1.12, stride: .16, lift: .055, stance: .60 });

export function walkLeg(cycle, side) {
  const phase = ((cycle + (side === 'Right' ? .5 : 0)) % 1 + 1) % 1;
  if (phase < BOSS_WALK.stance) return { phase, z: BOSS_WALK.stride * (1 - 2 * phase / BOSS_WALK.stance), lift: 0, swing: false };
  const p = (phase - BOSS_WALK.stance) / (1 - BOSS_WALK.stance);
  const smooth = p * p * (3 - 2 * p);
  return { phase, z: BOSS_WALK.stride * (2 * smooth - 1), lift: BOSS_WALK.lift * Math.sin(Math.PI * p) ** 2, swing: true };
}

// Match root travel to the stance foot's backward speed, even if AI speed changes.
export function walkCyclesForDistance(distance, height) {
  return distance * BOSS_WALK.stance / (2 * BOSS_WALK.stride * height);
}

// Unwrapped cycle time avoids dropped or repeated contacts at loop boundaries.
export function walkContacts(previous, current) {
  if (!(Number.isFinite(previous) && Number.isFinite(current)) || current <= previous) return [];
  const contacts = [];
  for (let half = Math.floor(previous * 2) + 1; half <= Math.floor(current * 2 + 1e-9); half++) {
    contacts.push({ side: half % 2 === 0 ? 'Left' : 'Right', cycle: half / 2 });
  }
  return contacts;
}
