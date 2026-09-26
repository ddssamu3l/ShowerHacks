# Six Seven mode

A third activity for the agent phase, after the shower and the fog wipe. Both palms up in front of the camera, rocking in anti-phase like a scale ("six... seven!"). Every swing is a beat, beats alternate six and seven, and the turn score is how many beats landed against a target set by the turn length.

The typing half is unchanged. Turns rotate `shower, fog, sixseven` (`apps/web/src/components/design/activity.ts`).

## How a turn plays

1. Player submits the prompt. The engine enters `agent`; a fresh beat counter is created with `targetBeats = round(durationMs / 1000 * 1.6)`, so a 15 s turn needs 24 beats, about 12 six-seven cycles.
2. The tracker reports both palms. The overlay draws a **6** over the hand on the left of the screen and a **7** over the hand on the right; the next number to call is drawn bright.
3. The detector watches the vertical gap between the palms, `yLeft - yRight`. Rocking in anti-phase makes the gap swing. Each reversal that travelled at least `minAmplitude` (7% of frame height) since the previous turning point is one beat. The called number pops, the word flashes.
4. Moving both hands together keeps the gap flat and scores nothing. One hand scores nothing. Two readings of one hand (closer than 6% of frame width) score nothing.
5. At the deadline the counter freezes. Score = `100 * min(1, beats / targetBeats)`.

Streaks are cosmetic: consecutive beats no more than 1.5 s apart. The overlay shows "N in a row" from 3.

## Engine

`packages/game-engine/src/sixseven.ts`, pure functions, no DOM.

```ts
const state = createSixSeven({ durationMs: 15_000 });
applySixSevenSample(state, { capturedAtMs, hands: [{ side: "left", x, y }, { side: "right", x, y }] });
//  -> "beat" | "idle" | "rejected"
sixSevenProgress(state);   // 0..1
scoreSixSeven(state);      // 0..100
lastSixSevenCall(state);   // "six" | "seven" | null
freezeSixSeven(state);     // at the deadline
```

Samples are gated like fog samples: out of order, non-finite, stale (older than 250 ms on arrival with `nowMs`) or after a freeze are rejected. A sample without both hands clears the gap baseline so a hand reappearing elsewhere does not read as a swing.

`createSixSevenActivity()` in `sixseven-activity.ts` wraps the detector as the shared `ActivityAdapter`; `efficiency` is the progress so far, `metrics` carries beats, target and streak.

## UI

- `components/sixseven/SixSevenLayer.tsx`: canvas overlay for the main game. Reads mirrored palms from `CameraProvider` (which now tags each hand with its `side`), feeds the detector at the frame's capture time, draws digits, the flash word and the streak chip. Practice mode rocks a synthetic pair of hands.
- `Play.tsx` keeps the state in a ref, resets it on a new six seven turn, and reports `sixSevenProgress` to the game every 66 ms, the same cumulative path the fog uses. The card shows the meter, beats over target and the streak.
- `/sixseven` (`components/sixseven/SixSevenPractice.tsx`) is a standalone 15 s round for tuning the gesture on a real camera or with the synthetic hands.

## Tuning

All constants live in `SIXSEVEN_DEFAULTS`. If real players trigger too few beats, lower `minAmplitude` (0.07) first; if arm jitter counts, raise it or lower `smoothing` (0.5). `targetBeatsPerSecond` (1.6) sets difficulty. Check with `/sixseven` before changing the game.
