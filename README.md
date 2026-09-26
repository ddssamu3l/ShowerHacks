# Vibecodemaxxing

A hackathon game about typing increasingly unhinged prompts while a fake coding agent makes increasingly stupid mistakes. Type while the agent waits; pretend to shower while it works. Highest score wins.

This repository contains the team scaffold, a **shared body/hand/finger tracking framework**, the **Soap Rush timed challenge at `/vision`**, a **hand-placement viewer at `/vision/placement`**, and the earlier **Scrub Fighter prototype at `/vision/arcade`**. The Next.js landing page, TypeScript interfaces, session validator, editor JSON Schema, and one complete example session are also provided. **The main scripted gameplay and leaderboard routes still need implementation by their owners below.** There are no real LLM calls or executed agent commands.

## Run the scaffold

Use Node.js 22+ and npm. From the repository root:

```sh
npm ci
npm run dev                 # http://localhost:3000
npm run validate:sessions   # validate every content/sessions/*.json
npm run typecheck           # shared packages, scripts, and web app
npm test                    # unit tests (vitest) for packages/
npm run build               # session validation + production Next.js build
```

The web app uses the Next.js App Router and React; local TypeScript packages are compiled by Next.js. This follows the [official Next.js installation guidance](https://nextjs.org/docs/app/getting-started/installation). No database, API key, or separate backend process is needed. The intended demo deployment is one persistent Node.js server with a writable local disk.

## Webcam prototypes

```sh
npm ci
npm run vision:dev         # Prepare local model assets + start Next.js
# Open http://localhost:3000/vision
npm run test:vision        # Hand placement, motion detection, and scoring tests
```

At **`/vision`**, enable your camera, frame your head/shoulders/hands, then start **Soap Rush**. After a three-second countdown, eight body targets run for **three seconds each** (24 seconds total), with the next target previewed. Scrub the lime outline back and forth or in circles. Holding still or scrubbing elsewhere earns zero. The head and chest regions include the sides. Each hand is tracked independently; either can scrub, and two hands do not double the maximum rate. **Watch a simulated run** exercises the same tracking, activity adapter, and scoring code using generated landmarks.

Each round earns `round(1000 × averageEfficiency × roundMultiplier)`. Efficiency is averaged over the **entire** window, including reaction time, missed targets, and tracking gaps. At least 35% quality continues the combo; each prior successful round adds ×0.25 to the next round, capped at ×2.5. A miss breaks the chain after that round; it still earns its partial quality points at the multiplier established when the round began. Switching targets is automatic at the exact deadline. The final screen shows total points, each round, and best combo. These are prototype points, not main-game/leaderboard scores. The setup also offers five- or eight-second windows, normalized to the same per-round base maximum.

At **`/vision/placement`**, simply place a hand on your shoulder, chest, hair, face, opposite upper arm, or raised armpit. No rubbing is required. Cyan is your left hand; pink is your right. Both hands can highlight different regions or share one. Dashed markers explicitly indicate a fallback estimate from the pose model. This remains a score-free tracking lab.

The earlier **`/vision/arcade`** page still runs the motion-based Scrub Fighter prototype. Rub your chest, opposite upper arm, hair, or an armpit with that arm raised. Repeated rubbing lands hits; changing zones chains combos. Enable sound for arcade bleeps. Stop the camera to adjust sensitivity, then restart. **Try the animated demo** runs synthetic movement through the same detector with no camera.

The arcade page is a standalone, continuous free-play concept with point popups, ranks, a 6.5-second combo window, a multiplier capped at ×2.5, and repeated-zone rewards falling to 65%, 30%, then 15%. Alternating just two zones caps the multiplier at ×1.5. Scores are local to the current run and are not submitted to the leaderboard. The production game's normalized scoring contract below is unchanged; its owner can integrate wash events and decide how to incorporate combos into the timed game.

Implementation and integration:

- `packages/vision/src/controller.ts` implements `createVision`; a classic Web Worker runs MediaPipe Pose Full and, in placement mode, Hand Landmarker with up to two hands away from the typing/UI thread. It attempts GPU inference, then CPU if GPU initialization fails. Only one frame is in flight, at up to 20 Hz. Capture timestamps come from the main browser clock. Camera tracks and the worker are released on stop, including cancelled startup.
- `placement.ts` classifies each palm independently against shoulder-relative body regions, assigns anatomical left/right using pose wrists, and uses light position smoothing to reduce jitter. It requires no movement. Pass `mode: "placement"` and `onPlacement(frame)` to `createVision` or `createMockVision`; each `PlacementFrame` includes `hands` with `side`, `visible`, normalized `point`, `zone`, `source`, and landmarks, plus body-region outlines. `source` distinguishes hand-model detection from pose fallback. Placement mode emits zero scoring efficiency and no wash events. It estimates overlap in the 2D camera view, not physical contact; fully hidden hands may be missed or estimated.
- `detector.ts` works on landmarks in a shoulder-relative coordinate system. It requires proximity plus sustained back-and-forth/circular motion, ignores tiny jitter and pose jumps, and prefers the moving hand over a resting hand. Detection estimates visible overlap, not physical skin contact. Framing, fast movement, and occlusion affect accuracy; tune with real webcam play.
- `createVision` and `createMockVision` remain compatible with `VisionFactory`. Their optional `ArcadeVisionOptions.onFrame(frame)` exposes zone/progress/landmarks for feedback, and `onWash(event)` emits `{ zone, capturedAtMs, intensity, confidence }`. Types are exported from `@vibecodemaxxing/vision`. The existing `onSample` callback still emits the original `VisionSample` contract, with raw scrub intensity as efficiency and no combo multiplier. The main engine must gate wash events by agent phase and own its combo state.
- `packages/vision/src/arcade.ts` contains the prototype's separate scoring reducer (`@vibecodemaxxing/vision/arcade`). `apps/web/src/app/vision/` owns only the temporary playground UI. Main-game pages and engine implementations are independent.
- `npm run vision:prepare` downloads the versioned [MediaPipe Pose Full](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) and [Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker) models, copies WASM files from the pinned npm dependency, and bundles `pose.worker.ts`. Generated assets live in gitignored `apps/web/public/vision-assets/`. Rerun after worker/dependency changes, and before deploying the vision pages. Once prepared, the prototypes load assets locally and upload no camera frames. The first preparation needs internet access.

Browser target: a current Chromium-based desktop browser, including Arc/Chrome, on localhost or HTTPS. The worker uses `OffscreenCanvas` and transferable `ImageBitmap`. The model and runtime are Apache-2.0 licensed; the worker bundle retains dependency license notices.

## Shared tracking and activity IO (all activity owners)

Canonical contracts: [`packages/contracts/src/tracking.ts`](packages/contracts/src/tracking.ts). Runtime exports: `@vibecodemaxxing/vision`. **Use one camera controller and share its frames across activities.** Activities own their gameplay/effects and an `ActivityAdapter`; they do not need to copy MediaPipe initialization, hand assignment, region detection, or score integration. The fog scrubber's implementation is not changed by this framework; its owner can adopt this interface in its own module.

```text
createTracking / createMockTracking
        ↓ TrackingFrame (schemaVersion: 1)
activity.evaluate(frame, context)
        ↓ ActivitySample (schemaVersion: 1)
ActivityScoreWindow.ingest(sample, receivedAtMs)
        ↓ ActivityWindowScore
game owns combos, total points, activity switching, and leaderboard
```

| Contract | Meaning |
| --- | --- |
| `createTracking({ video, overlay?, onFrame, onStatus, now?, assetBase? })` | Returns `{ start(), stop() }`. Starts body **and two-hand/finger** tracking; no activity scoring. Uses the same status/cleanup behavior as `createVision`. `createMockTracking` has the same API and explicit `inputMode: "mock"`. |
| `TrackingFrame.capturedAtMs` | Capture time on the browser's monotonic `performance.now()` clock, never inference completion or `Date.now()`. |
| `width`, `height`, `coordinateSpace` | Original image dimensions; `"camera-normalized"` means **unmirrored** x-right/y-down coordinates, 0–1 inside the image. A mirrored UI uses `1 - x`. Left/right labels are anatomical, not screen-left/right. |
| `body.landmarks`, `body.joints` | 33 slots in exported `POSE_JOINTS` order, also available by name (`leftShoulder`, `leftWrist`, etc.). Missing/low-visibility/out-of-image points are `null`. `body.tracked` means usable shoulders/upper-body frame, not that every joint exists. |
| `body.regions` | `{ part, center, outline }` for hair, face, chest, left/right shoulder, upper arm, and raised armpit. Regions and palm `bodyPart` use the same expanded geometry. They estimate **2D overlap**, not physical contact/depth. |
| `hands.left`, `hands.right` | Always present: `{ tracked, source, confidence, palm, wrist, bodyPart, landmarks, joints, fingers }`. Both may occupy one region. `source` is `hand`, `pose`, or `none`; confidence is a visibility/availability heuristic, not a calibrated probability. |
| Hand/finger landmarks | 21 slots in exported `HAND_JOINTS` order; named joints such as `indexTip`; `fingers.thumb/index/middle/ring/pinky` each expose four `joints` and `tip`. Pose fallback gives an estimated palm/wrist with **null finger landmarks**, never fake fingertip coordinates. |
| `TrackingPoint.motion` | `{ velocity: {x,y}, speed }` or `null` on first sighting, source changes, lost tracking, or >250 ms gaps. Velocity is normalized camera units/second; scalar speed corrects x for aspect ratio and is measured in image-height units/second. This is camera-space motion; activities can stabilize against body regions as the scrub adapter does. |
| Depth `z` | Optional model-relative depth, **not meters**. Hand and pose depths do not share an origin; don't compare them directly. |
| `ActivityContext` | `{ targetId: string \| null, windowStartedAtMs, windowEndsAtMs }`, controlled by the game. Any activity can define its own target IDs. |
| `ActivityAdapter` | `{ id, reset(), evaluate(frame, context): ActivitySample }`. Synchronous and independent of React/camera ownership. Reset when entering/restarting an activity. |
| `ActivitySample` | `{ schemaVersion: 1, activityId, targetId, capturedAtMs, efficiency, confidence, tracking, feedback?, metrics? }`. Efficiency/confidence are finite 0–1; zero efficiency for wrong/stationary motion. Generic feedback has `label` and `level`; activity-specific numeric diagnostics go in `metrics`. No images or point mutations. |
| `ActivityWindowScore` | `{ averageEfficiency, basePoints, trackingCoverage, activeCoverage, liveEfficiency }`. Coverage values and efficiency are 0–1; points are an integer, default max 1000. Game adds any multipliers. |

For hand-only activities, a valid fingertip can be used even when `body.tracked` is false. The adapter's `ActivitySample.tracking` means its own required inputs are usable. For example, a finger-driven fog activity should return zero/untracked if its fingertip is missing rather than using the estimated palm as a fingertip. `createMockTracking` provides moving synthetic body **and finger** landmarks without a camera, explicitly marked `inputMode: "mock"`.

`ActivityScoreWindow` uses time weighting, not sample count. Each confident tracked efficiency holds for at most **250 ms**, or until the next sample/deadline. All uncovered time is zero. It rejects other activity/target IDs, out-of-window, future, duplicate, out-of-order, stale, late-arriving, and invalid samples. Create a **new window per target/activity**. Calls to `snapshot(now)` are read-only; call it at the deadline for the final score. These defaults match the existing `VisionSample` gating, and `ActivitySample` is structurally compatible with `game.ingestVision` for the current game-engine contract. The main engine remains responsible for choosing which activity samples to ingest during the agent phase.

Minimal integration for any activity (replace `createScrubActivity` with your adapter):

```ts
import { createTracking, createScrubActivity, ActivityScoreWindow } from "@vibecodemaxxing/vision";

const activity = createScrubActivity();
let context: { targetId: string | null; windowStartedAtMs: number; windowEndsAtMs: number } | null = null;
let scoring: ActivityScoreWindow | null = null;
const tracker = createTracking({
  video: videoElement, overlay: canvasElement,
  onStatus: setCameraStatus,
  onFrame(frame) {
    // For finger-driven activities: frame.hands.left.fingers.index.tip (may be null).
    // For palm-driven activities: frame.hands.left.palm and .bodyPart.
    renderTracking(frame);
    if (context && scoring) scoring.ingest(activity.evaluate(frame, context), performance.now());
  },
});
await tracker.start(); // Only enable the game's Start control after camera/model readiness.

function beginActivityWindow(targetId: string | null) {
  activity.reset();
  const startAtMs = performance.now(), endAtMs = startAtMs + 3000;
  context = { targetId, windowStartedAtMs: startAtMs, windowEndsAtMs: endAtMs };
  scoring = new ActivityScoreWindow({ activityId: activity.id, targetId, startAtMs, endAtMs, maxPoints: 1000 });
}
// Game timer: scoring?.snapshot(performance.now()) -> live/final basePoints.
// At deadline: finalize old window, switch context/window immediately; don't extend with timer drift.
// On teardown: tracker.stop(); activity.reset();
```

Reference implementation: `scrub-activity.ts` consumes the shared frame, `scrub-motion.ts` measures motion relative to each body region, and `challenge.ts` owns three-second scheduling/combos using the shared scorer. Motion uses both hands independently and takes the stronger qualifying scrub, capped at 1. Hair/face placements both count toward the Head prompt. `TrackingFrameBuilder.process(...)` accepts raw pose/hand landmarks for tests or alternate camera backends; `drawTrackingOverlay(...)` is optional rendering. Keep mock runs out of the real leaderboard using `TrackingFrame.inputMode`.

## Fog Wipe prototype (activity 02)

```sh
npm run vision:dev         # same assets as Scrub Fighter
# Open http://localhost:3000/fog
```

A second activity for the agent phase: the camera preview fogs over like a bathroom mirror and the player wipes it clear with a hand. Pick a round length (stands in for the agent's turn duration), press start, wipe. At the deadline the fog freezes and the turn score is the percentage cleared, 0..100, the same scale as the shower score. **Try the simulated hand** runs a synthetic sweep with no camera.

Engine side is pure and tested: `createFog`, `applyWipe`, `advanceFog`, `freezeFog`, `scoreFog` in `packages/game-engine/src/fog.ts`, plus `createFogActivity`, an `ActivityAdapter` for the shared tracking framework (`fog-activity.ts`). The page (`apps/web/src/components/fog/FogWipe.tsx`) uses `createTracking` from `@vibecodemaxxing/vision` for palms and the game's design system for layout. Drag with the mouse if the tracker is unavailable. Design, tuning and the proposed contract changes for wiring it into the main game are in [docs/fog-wipe-mode.md](docs/fog-wipe-mode.md).

## Four owners, four workstreams

| Owner | Owns | Deliverable and handoff |
| --- | --- | --- |
| **UI teammate** | `apps/web/src/app/` except `api/`; `apps/web/src/components/`; client hooks; styling | Nickname/session selection, camera preview and efficiency on the left, mock coding transcript/editor and prompt input on the right, score display, results and leaderboard. Fetch sessions, create the engine and vision controller, render engine snapshots, and submit the final result to the leaderboard API. |
| **Session teammate** | `content/sessions/*.json` | Funny, fully scripted sessions that pass validation. Each turn supplies one exact target prompt, agent duration, timestamped messages/tool activity/file edits, and its final response. No app code or scoring formulas needed. |
| **Game-state teammate** | `packages/game-engine/`; `apps/web/src/app/api/`; `apps/web/src/lib/server/` | Implement the state machine, replay scheduler, typing/shower scoring, and results. Implement session-loading and disk-leaderboard APIs. Deliver `createGame: GameFactory` and the API responses defined below. Keep the engine independent of React and the camera model. |
| **PM + vision (us)** | `packages/vision/`; generated `apps/web/public/vision-assets/`; shared contract coordination | Maintain shared body/hand/finger tracking, activity IO, score-window helper, camera/model setup, and reference scrub adapter. Deliver `createTracking` / `createMockTracking` plus the compatible `createVision` / `createMockVision`. Activity owners implement adapters against `TrackingFrame`; the engine owns activity switching and final points. |

Everyone imports shared types from `@vibecodemaxxing/contracts`. Coordinate changes to that package, root configuration, dependency lockfile, and this README before changing a shared interface. No teammate needs another teammate's implementation to start working against the types.

```text
apps/web/
  src/app/                 # UI pages/layout; api/ belongs to game-state owner
    api/sessions/          # GET list + GET [id] (to implement)
    api/leaderboard/       # GET standings + POST result (to implement)
  src/components/          # React components
  src/lib/server/          # Session loader and serialized disk store (to implement)
  public/vision-assets/    # Generated body/hand models, WASM, worker (gitignored)
packages/
  contracts/
    src/session.ts         # Runtime Zod schema + inferred Session/AgentEvent types
    src/game.ts            # GameController, GameState, GameResult
    src/vision.ts          # VisionController, VisionSample, VisionStatus
    src/tracking.ts        # Shared body/hand/finger frames + activity and point-return IO
    src/leaderboard.ts     # HTTP request/response types
    src/constants.ts       # Versioned scoring defaults
    session.schema.json    # Generated JSON Schema for editors; do not hand-edit
  game-engine/src/index.ts # Reserved export: createGame (not implemented yet)
  vision/src/index.ts      # Implemented createVision, createMockVision + feedback types
content/sessions/
  ship-it.json             # Copy this complete three-turn example
scripts/                   # Session/schema tooling
data/                      # Runtime leaderboard.json; gitignored
README.md                  # The single team handoff document
```

## Gameplay and timing contract

```text
Nickname + session + camera ready
               |
             ready -- start() --> typing -- Enter --> agent
                                     ^                  |
                                     |  more turns      |
                                     +------------------+
                                                        | last turn ends
                                                     finished
                                                        |
                                             save score + leaderboard
```

1. UI trims the nickname and requires 1–24 Unicode code points. Load and validate the chosen session and prepare the camera before enabling Start. A mock vision mode supports development; its runs cannot enter the real leaderboard.
2. `createGame({ session, nickname, inputMode })` returns a controller in `ready`. `start()` immediately opens turn 0 in `typing` and records its typing start time. Optional countdowns happen **before** `start()`.
3. During `typing`, show the predetermined `targetPrompt` beside an empty input. Enter calls `submitPrompt(text)`. Every nonempty submission is accepted even if inaccurate; accuracy affects points. The transcript records the player's actual submitted text. The next scripted agent turn is identical regardless of mistakes.
4. On submission, the engine scores typing, disables input by entering `agent`, and begins that turn's replay/shower interval. Events become visible at `agentStartedAtMs + event.atMs`. Events at the same offset retain array order. Tool activity and file edits are only display data: never execute commands or write the mock files to disk.
5. At `agentStartedAtMs + durationMs`, reveal the final response, finalize this turn's shower score, and immediately enter the next `typing` phase. Set `typingStartedAtMs` to that same deadline. There is no Continue button, transition delay, or UI animation that postpones the clock. Clear/focus the input on this transition; reaction time counts.
6. At the last agent deadline, show its final response and enter `finished` with the complete result. UI stops vision, POSTs the result once, and shows the returned leaderboard and rank. Keep the result visible with a retry action if saving fails.

The engine is the **only authority for phase transitions, replay visibility, and scoring**. The UI may refresh timer displays using `performance.now()`, but must not advance the game. The vision module knows nothing about sessions or phases.

Use the browser's monotonic `performance.now()` clock everywhere except human-readable result timestamps. Compare against absolute deadlines; don't count timer ticks. Timer callbacks and `start`, `submitPrompt`, and `ingestVision` first catch up overdue replay events and phase transitions so a throttled browser cannot extend shower time. Keep `getState` and subscription setup free of side effects. Once an agent finishes, catch-up stops in `typing` until the player submits. No pause mechanic in v1. Navigation/restart disposes the old controller and creates a new one.

## Session JSON: content → engine

Canonical schema: [session.ts](packages/contracts/src/session.ts). Complete example: [ship-it.json](content/sessions/ship-it.json). One file per session, named `<id>.json`; IDs are lowercase kebab-case. `sessionVersion` is the content revision, while `schemaVersion: 1` describes the file format. Increment `sessionVersion` whenever prompts, events, or durations change so scores from different challenges do not mix.

A minimal valid session:

```json
{
  "$schema": "../../packages/contracts/session.schema.json",
  "schemaVersion": 1,
  "id": "one-button",
  "sessionVersion": 1,
  "title": "One Button",
  "description": "Surely the agent can handle one button.",
  "turns": [{
    "id": "make-button",
    "prompt": "Make a button.",
    "agent": {
      "durationMs": 5000,
      "events": [
        { "id": "thinking", "atMs": 0, "type": "assistant_message", "text": "First, I will rewrite CSS." },
        { "id": "done", "atMs": 5000, "type": "assistant_message", "text": "Done. It is a checkbox." }
      ]
    }
  }]
}
```

| Event `type` | Additional fields | UI behavior |
| --- | --- | --- |
| `assistant_message` | `text` | Append an agent message. |
| `tool_call` | `tool`, `input` (both strings) | Display a pending simulated tool invocation. |
| `tool_result` | `callId`, `output`, `status: "success" \| "error"` | Complete the earlier call whose event ID equals `callId`. |
| `file_update` | `path`, `language`, `content` | Replace that mock editor file's entire displayed contents. Files begin empty; updates persist across turns. |

Every event also has `id` and integer `atMs`, relative to the start of **its own agent turn**, not game start. A session has 1–20 turns, each with a nonempty single-line prompt (up to 500 UTF-16 code units) and a 1,000–120,000 ms agent duration. Prefer short prompts and 8–20 second agent turns for the demo.

Validation requires unique turn IDs, event IDs unique across the whole session, nondecreasing offsets within the duration, exactly one result for each earlier tool call in the same turn, and a final `assistant_message` **at exactly `durationMs` in every turn**. The last turn's last message is the game-ending response. No separate completion flag is needed.

Run `npm run validate:sessions` after every content edit. Editor JSON Schema checks shape; the command additionally checks event ordering and references. If the shared schema changes, run `npm run schema:generate` and commit the generated file. Runtime session-loading routes must also call `sessionSchema.parse()` rather than trusting a TypeScript cast.

## Vision IO: camera → engine

Canonical interface: [vision.ts](packages/contracts/src/vision.ts). Browser-only implementation in `packages/vision`; UI supplies a mounted `<video muted playsInline>` and an optional overlay canvas. Vision owns camera permission, stream acquisition/attachment, model initialization, inference, and cleanup. Never request a camera at module import time.

```ts
type VisionSample = {
  capturedAtMs: number; // performance.now() at frame capture
  efficiency: number;   // 0..1: calibrated speed/quality of scrubbing
  confidence: number;   // 0..1: confidence in that estimate
  tracking: boolean;   // Is a usable person/body being tracked?
};
```

Aim for 10–20 samples/second. Emit zero efficiency with `tracking: false` when no usable body is detected; emit status errors separately for camera/model failures. Avoid treating camera shake as scrubbing. Calibration, body regions, and model/library choice are owned by vision; the external scale stays 0–1. Images remain local to the browser; callbacks carry numeric estimates only.

`createVision(options)` returns `{ start(): Promise<void>, stop(): void }`. `start()` resolves when camera/model are ready and rejects on initialization failure. `onStatus` reports `idle`, `initializing`, `ready`, `stopped`, or an error with a code/message. `stop()` releases camera tracks and cancels inference, including a pending startup. Repeated stop calls are safe, and no sample callbacks may fire after stopping. Use a fresh controller to restart. The UI owns phase/status text; vision draws only the optional tracking overlay.

`createMockVision` implements the same interface and emits a deterministic sample stream without requesting a camera; it can ignore the supplied preview element. The UI sets `inputMode: "mock"` on the engine for such a run. This lets the UI/game teammates develop before the model is ready.

The UI forwards every sample to `game.ingestVision(sample)`. The engine ignores samples outside `agent`, samples captured outside the current agent interval, future timestamps, nonfinite/out-of-range numbers, out-of-order/duplicate timestamps, and samples already over 250 ms old on arrival. Reset sample history on each agent start; a prior typing phase/turn never contributes.

## Scoring v2: how points are earned

The engine is the only thing that computes points. Constants live in [constants.ts](packages/contracts/src/constants.ts), the typing scorer in [typing.ts](packages/game-engine/src/typing.ts). Results carry `scoringVersion: "v2"`; bump it whenever these rules change so old leaderboard entries don't mix with new ones. Keep every component unrounded until the final integer total.

A run is a sequence of turns. Each turn produces two numbers on a 0..100 scale, **typing** and **shower**, and the run total is the average of both across all turns, scaled to a maximum of 10,000.

```text
turn 1: type prompt → agent runs, you scrub → typing₁, shower₁
turn 2: type prompt → agent runs, you scrub → typing₂, shower₂
...
total = round(100 * (0.5 * mean(typing) + 0.5 * mean(shower)))
```

### Typing: the clock starts when the prompt appears

Scored once, the moment the player presses Enter. The inputs are the target prompt, the submitted text, the elapsed time since the `typing` phase began (reaction time included), and an optional keystroke log.

Comparison is exact. Case, spaces and punctuation all count, nothing is trimmed or normalized. Characters are Unicode code points (`Array.from(text)`). `d` is the Levenshtein edit distance between target and submitted text, `L` and `S` are their lengths, and `t` is elapsed milliseconds.

**Step 1, speed: 300 points that melt every second.** The player starts with all 300 the instant the field appears and loses a fixed slice per second until the time limit, where speed is zero. The limit scales with prompt length so a short prompt and a long prompt are equally fair: par time is what a 40 WPM typist needs for that prompt, and the limit is three times par.

```text
parMs        = L / 5 / 40 * 60000
limitMs      = parMs * 3
speed        = clamp(1 - t / limitMs, 0, 1)
speedPoints  = 300 * speed
```

**Step 2, accuracy: 200 points, squared.** Accuracy is 1 minus edit distance over the longer of the two strings, so both typos and extra junk cost the same. It is squared before scaling so a single typo in a short prompt is visible instead of rounding away.

```text
accuracy       = clamp(1 - d / max(L, S), 0, 1)
accuracyPoints = 200 * accuracy²
```

**Step 3, penalties: subtracted on top.** Sloppiness costs points beyond accuracy. The pause and correction counts come from the keystroke log; without one they are zero and the game still works.

| Penalty | Points | Detected how |
| --- | --- | --- |
| Typo | 5 each | `d`, the edit distance |
| Long pause | 15 each | gap over 2000 ms between two keystrokes |
| Correction | 3 each | one Backspace press |
| Cap | 150 total | |

```text
penaltyPoints = min(150, 5 * d + 15 * longPauses + 3 * corrections)
```

**Step 4, the turn score.** Points out of 500, floored at zero, rescaled to 0..100.

```text
typing = max(0, speedPoints + accuracyPoints - penaltyPoints) / 500 * 100
```

Worked examples on the 38-character prompt "Refactor the auth module and add tests" (par 11.4 s, limit 34.2 s, about 8.8 speed points lost per second):

| What the player did | speed | accuracy | penalty | typing |
| --- | --- | --- | --- | --- |
| Perfect, instant | 300 | 200 | 0 | 100 |
| Perfect in 10 s | 212 | 200 | 0 | 82 |
| Two typos in 10 s | 212 | 180 | 10 | 76 |
| Perfect in 40 s | 0 | 200 | 0 | 40 |
| Two typos, one 3 s pause, one Backspace, 10 s | 212 | 180 | 28 | 73 |

Typos hurt twice on purpose: through squared accuracy and through the flat penalty. A wrong prompt still advances the story. `scoreTyping` returns every component plus human-readable `notes` ("2 typos", "1 long pause", "Over the 34.2s limit") for the result screen. `diffChars` and `liveAccuracy` are exported for live highlighting in the input, `timeLimitMs` for a countdown bar.

The UI passes the keystroke log through `submitPrompt(text, keystrokes)`. The UI disables paste/drop into the prompt input for the demo and ignores Enter during IME composition; this is an honor-system local game. Run `npm test` for the scorer's tests.

### Shower: time-weighted scrubbing while the agent works

Scored at the end of each agent turn, over the **entire** scheduled agent duration. The vision module emits samples of scrub efficiency (0..1) with a confidence and a tracking flag; the engine turns them into a time average.

For each accepted sample, its effective value is `efficiency` when `tracking && confidence >= 0.5`, otherwise zero. Hold that value from its capture timestamp until the next accepted sample, its timestamp + 250 ms, or the agent deadline, whichever comes first. All uncovered time, including before the first sample and camera dropouts, contributes zero. Use time weighting, not an arithmetic mean of samples. A low-confidence/no-tracking sample immediately ends the previous held reading.

```text
averageEfficiency = sum(effectiveEfficiency * coveredMilliseconds) / durationMs
shower            = 100 * averageEfficiency
trackingCoverage  = qualifyingCoveredMilliseconds / durationMs
```

Late samples arriving after the turn has ended cannot change its result. Faster sample delivery must not create extra points. An efficiency of 0.8 continuously maintained earns 80 for either a 10-second or a 30-second turn; the duration itself is not a bonus or penalty. `liveEfficiency` uses the same gating/250 ms expiry for UI feedback.

### Run total

Every completed turn has equal weight, regardless of prompt length or agent duration.

```text
typingScore = mean(turn.typing.score)       # 0..100
showerScore = mean(turn.shower.score)       # 0..100
totalScore  = round(100 * (0.5 * typingScore + 0.5 * showerScore))
```

A full run on the sample session `ship-it` (three turns), computed with the real scorer:

| Turn | Prompt length | Typed in | Mistakes | typing | shower |
| --- | --- | --- | --- | --- | --- |
| 1 | 31 | 6 s | none | 87.1 | 90 |
| 2 | 75 | 20 s | 1 typo, 1 pause, 1 Backspace | 76.6 | 60 |
| 3 | 60 | 40 s | none | 55.6 | 70 |

typingScore 73.1, showerScore 73.3, **totalScore 7322** out of 10,000. The live `state.score` summarizes only completed turns (zero before the first completion); the active turn separately exposes `typingResult` and `liveEfficiency` during `agent`.

## Engine IO: engine → UI

Canonical interfaces: [game.ts](packages/contracts/src/game.ts). The engine package will export `createGame: GameFactory`; the vision package will export `createVision: VisionFactory`. The following is the integration target, **not implemented wiring in the starter**:

```ts
const game = createGame({ session, nickname, inputMode: "camera" });
const vision = createVision({
  video: videoElement,
  overlay: canvasElement,
  onSample: (sample) => game.ingestVision(sample),
  onStatus: setVisionStatus,
});
renderState(game.getState());
const unsubscribe = game.subscribe(renderState);
await vision.start();              // Enable Start after this resolves.
// Start button: game.start()
// Enter: game.submitPrompt(inputText)
// Finish: vision.stop(), save game.getState().result once
// Unmount/restart: unsubscribe(), game.dispose(), vision.stop()
```

The engine generates one stable `runId` (UUID) per controller. `GameState.phase` is `ready | typing | agent | finished`. Every snapshot includes nickname, session identity, input mode, transcript, completed turn results, and the current aggregate score. Phase-specific fields are discriminated TypeScript unions: only `typing` exposes `targetPrompt`, only `agent` exposes agent timestamps/live efficiency, and only `finished` exposes `result`.

`getState()` returns the same immutable snapshot reference until an update. `subscribe(listener)` returns an unsubscribe function and emits on changes, not at subscription time. `submitPrompt` returns `true` only when accepted in `typing`; double Enter and submissions during an agent turn have no effect. `start` is only effective in `ready`. `dispose` is idempotent and stops future updates/actions. Validate session/nickname when constructing a controller; invalid options throw before any timer is started. Treat options/session data as read-only. UI owns transient draft input, focus, sound, and presentation; all scored time and results belong to the engine.

## Session and leaderboard HTTP APIs

The **game-state owner** implements these Next.js route handlers and Node-only filesystem helpers. Shared request/response types are in [leaderboard.ts](packages/contracts/src/leaderboard.ts). UI owns the calls. Use `export const runtime = "nodejs"` and disable caching for leaderboard reads. Keep `fs` imports out of client components and shared browser packages.

| Method and path | Request | Success body |
| --- | --- | --- |
| `GET /api/sessions` | None | `{ sessions: SessionSummary[] }`, sorted by ID |
| `GET /api/sessions/:id` | Session ID | `{ session: Session }` |
| `GET /api/leaderboard?sessionId=ship-it&sessionVersion=1&scoringVersion=v2` | All three board keys required | `{ entries: LeaderboardEntry[] }`, top 10 |
| `POST /api/leaderboard` | JSON `{ result: GameResult }` | `{ entry: LeaderboardEntry, rank: number, entries: LeaderboardEntry[] }`, HTTP 201 on first save, 200 on identical retry |

`SessionSummary` contains `id`, `sessionVersion`, `title`, `description`, and `turnCount`. `LeaderboardEntry` contains `runId`, `nickname`, the three board keys, `typingScore`, `showerScore`, `totalScore`, and server-assigned ISO `completedAt`. Only finished camera-mode runs can be saved; reject mock runs. Error bodies use `{ error: { code, message } }`: 400 for invalid input, 404 for unknown session/version, 409 for a reused run ID with different contents, and 500 for load/write failure. Return a generic error message rather than filesystem details.

Validate POST bodies at runtime: require a valid nickname/run UUID, known session/version and scoring version, `inputMode: "camera"`, one result for every session turn in order, matching agent durations, and finite values within the documented ranges. Recompute typing scores from submitted text, durations, and the posted `longPauses`/`corrections` counts, and the final aggregate from turn data; do not trust posted totals. The camera estimate itself is client-reported, appropriate for a local hackathon leaderboard. A score/result must be complete; do not save intermediate snapshots.

Store all runs in **`<repo>/data/leaderboard.json`**, with this versioned format; create it on the first save:

```json
{ "schemaVersion": 1, "entries": [] }
```

Each disk entry is exactly `{ result: GameResult, entry: LeaderboardEntry }`, as defined by `StoredLeaderboardRun` and `LeaderboardStore`. Retain the original validated result for idempotency checks and use the server receipt timestamp in the public `entry`. Expose only `LeaderboardEntry` fields over HTTP. For an identical retry, compare result fields by `runId` (independent of JSON key order) and preserve the first server timestamp. Rank all runs within the exact `(sessionId, sessionVersion, scoringVersion)` board, taking the top 10 for response `entries`; repeated nicknames are allowed. Sort by total score descending, then server timestamp ascending, then run ID ascending. `rank` is the saved run's position among **all** runs, even when outside the top 10.

The web server normally runs with `apps/web` as its working directory; centralize repository path resolution in `src/lib/server/` rather than accidentally creating `apps/web/data`. Session IDs must match the schema's slug rule, and paths must come from the enumerated content files. Serialize read-modify-write operations in one Node process and write via a temporary file plus rename in the same directory. A missing file means an empty board; a corrupt file is an error and must not be silently overwritten. Keep actual scores out of git. Use a persistent local/self-hosted server for the demo: an ephemeral serverless filesystem will not preserve this leaderboard.

## Integration order and done criteria

1. **Content:** copy the sample, write the escalating story, run the validator. The existing three-turn sample is already enough for engine/UI work.
2. **Game:** implement the controller with synthetic samples and an injected clock; verify the `typing → agent → typing → finished` loop, deadline boundaries, stale/missing samples, exact/mistyped prompts, and duration-normalized scoring. Build session APIs and the disk store.
3. **Vision:** implement the mock controller first so teammates can wire callbacks, then replace its readings with calibrated camera inference without changing the interface.
4. **UI:** compose the screen and onboarding, wire snapshots/events, add the final save/retry/leaderboard flow. Show camera status and mock-mode labeling. Keep session loading and camera startup outside scored time.
5. **Together:** run a full sample session, check that the last shower interval counts and the final response stays visible, verify the next typing timer starts immediately, save a score, restart the server, and confirm it remains on the board. Retry the same save and confirm no duplicate. Run `npm run validate:sessions`, `npm run typecheck`, and `npm run build` before merging.

Suggested branches: `feat/ui`, `feat/sessions`, `feat/game-engine`, and `feat/vision`. Each owner works in their directories; agree on contract changes first and update this README plus the shared types together. Install dependencies from the root with `npm install <package> --workspace <workspace-name>` and commit the lockfile with dependency changes.
