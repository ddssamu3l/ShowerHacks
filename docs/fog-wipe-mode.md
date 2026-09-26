# Fog Wipe mode

A second activity for the agent phase. Instead of scrubbing your body while the agent works, the camera preview is fogged over like a bathroom mirror and you wipe it clear with your hand. When the agent finishes, whatever is still fogged is lost.

The typing half of the game is unchanged. Only what happens between Enter and the agent's final message differs.

## How a turn plays

1. Player submits the prompt. The engine enters `agent` and covers the camera preview with fog: a grid of cells, every cell fully opaque.
2. The vision module tracks the player's hand and reports its position in the frame 10 to 20 times a second.
3. Every time the hand moves, the fog under it thins. One pass leaves a translucent streak, two or three passes clear it. Holding the hand still does nothing, the hand has to move like it is wiping glass.
4. Optionally the fog creeps back slowly, so a cleared area starts to haze over if the player moves on and never returns. Off by default for the hackathon build, easy to turn on for difficulty.
5. At the agent deadline the fog freezes. The turn's score is the fraction of the frame that is clear.

The preview is mirrored so wiping feels like a mirror, and the fog is drawn on the overlay canvas the UI already gives the vision module.

## Scoring

```text
clearedFraction = 1 - mean(cellFog)          # over all cells, at the agent deadline
fog             = 100 * clearedFraction
```

Same 0..100 scale as the shower score, so the run total formula in the README does not change: `total = round(100 * (0.5 * typing + 0.5 * activity))`. A 10-second turn and a 30-second turn are both scored on what fraction you cleared, so long turns are not free points, but they do give more time to reach 100.

Cell fog goes from 1 (opaque) to 0 (clear). Each wipe sample subtracts `wipeStrength` at the hand center and less towards the edge of `wipeRadius`, linearly. Default strength 0.45 and radius 0.09 of frame width, so a spot needs about three passes. Simulated at 15 samples a second with a hand sweeping row by row at a natural pace, steady wiping clears about 60% in 6 s, 80% in 10 s and 90% in 15 s. Getting to 100 means going back over the corners and the strips between rows, so a 12 to 16 second agent turn rewards effort without handing out full marks.

Samples are rejected the same way as shower samples: outside `agent`, outside the current agent interval, non-finite or out-of-range coordinates, older than 250 ms on arrival, out of order. A sample with `tracking: false` does not wipe and also resets the "last position", so a hand reappearing elsewhere does not draw a line across the frame.

## Engine

`packages/game-engine/src/fog.ts`, pure functions, no DOM.

```ts
const fog = createFog();                          // 32 x 18 cells, all opaque
applyWipe(fog, { capturedAtMs, points: [{ x: 0.5, y: 0.5 }], tracking: true });
advanceFog(fog, nowMs);                           // refog since last call, no-op when refogPerSecond is 0
clearedFraction(fog);                             // 0..1
scoreFog(fog);                                    // 0..100
fog.cells;                                        // Float32Array for the UI to draw
```

`WipeSample` is the input the engine expects from vision:

```ts
type WipeSample = {
  capturedAtMs: number;                 // performance.now() at frame capture
  points: { x: number; y: number }[];   // hand centers, 0..1 in raw video coordinates
  tracking: boolean;                    // false when no hand is visible
};
```

## Activity adapter

`createFogActivity()` in `packages/game-engine/src/fog-activity.ts` implements the shared `ActivityAdapter` from `contracts/tracking.ts`. The tracker calls `evaluate(frame, context)` per frame; the adapter wipes with each tracked palm (or the index fingertip with `{ point: "indexTip" }`), resets the grid when the window changes, and freezes it at the deadline. `efficiency` in the returned `ActivitySample` is the cleared fraction so far. Because fog is cumulative, the turn score is `scoreFog(activity.fog)` at the deadline, not `ActivityScoreWindow`'s time average.

## Prototype

`/fog` is a playable version built on the game's design system (`apps/web/src/components/fog/FogWipe.tsx`): `createTracking` from `@vibecodemaxxing/vision` for palms, fog canvas above the video, round timer, result card, a simulated hand for practice, and a mouse fallback. Camera coordinates are unmirrored; the video and the fog canvas are both CSS-mirrored, so nothing is flipped in the engine. The mouse fallback flips x itself.

## What changes in the shared contract (proposal, not done)

- Nothing needed from vision: `createTracking` already provides palms and fingertips, and the adapter consumes `TrackingFrame` directly.
- `GameOptions` gets `activity: "shower" | "fog"`. Default `shower`.
- `TurnResult.shower` becomes `TurnResult.activity`, a union: `{ kind: "shower", ... }` or `{ kind: "fog", clearedFraction, score }`. Leaderboard boards are keyed by session, version and scoring version already; add `activity` to the key so shower and fog runs do not compete on one board.
- The `agent` state exposes `liveActivity: number` in place of `liveEfficiency` so the UI can show a live percentage for either mode.

## Vision

MediaPipe Hands gives 21 landmarks per hand at webcam framerate in the browser. The hand center is the mean of the palm landmarks (0, 5, 9, 13, 17). Pose wrist landmarks work too if the vision module already runs Pose for shower mode, just noisier. Report up to two hands. Mirror x before reporting so the point matches what the player sees.

The prototype page has its own simulated hand that sweeps row by row, so the UI teammate can see fog clearing without a camera.

## UI

- Fog overlay on the canvas above the video. Draw each cell as a rect with alpha = fog, then a cheap blur (`filter: blur(6px)` on the canvas, or draw at low resolution and let the browser upscale). Cells are 32 x 18 so this is 576 rects per frame, fine.
- A small percentage counter, "cleared 63%", driven by `liveActivity`.
- Hand cursor: a soft circle at the reported point so the player knows what is being tracked.
- Result screen shows the final fog state frozen, with the cleared fraction and the agent's last message on top.

## Hackathon scope

Must have: fog grid in the engine with tests, mock vision sweep, fog overlay in the UI, score in the result.

Nice to have: refog on, two hands, a "squeak" sound on wipe, cells that clear with a streak texture instead of a flat alpha.
