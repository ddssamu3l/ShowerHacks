# Vibecodemaxxing

A hackathon game about typing increasingly unhinged prompts while a fake coding agent makes increasingly stupid mistakes. Type while the agent waits; pretend to shower while it works. Highest score wins.

This repository contains the team scaffold, a **shared body/hand/finger tracking framework**, the **Soap Rush timed challenge at `/vision`**, a **hand-placement viewer at `/vision/placement`**, and the earlier **Scrub Fighter prototype at `/vision/arcade`**. The Next.js landing page, TypeScript interfaces, session validator, editor JSON Schema, and one complete example session are also provided. The **playable game** (lobby, play, results) runs end to end on a stand-in game loop until `createGame` lands; see [Playable game UI](#playable-game-ui). The leaderboard routes still need implementation. Coding-agent events are simulated and never execute commands. Definition quiz judging calls an LLM from a server-only endpoint.

**Agents and new contributors: start with [`AGENTS.md`](AGENTS.md).** The next planned change is replacing the coding-agent terminal with a bathroom renovation; all ideas are in [`docs/ideas.md`](docs/ideas.md).

## Run the scaffold

Use Node.js 22+ and npm. From the repository root:

Install dependencies once:

```sh
npm ci
```

Start the game (prepares missing vision models, then serves http://localhost:3000):

```sh
npm run dev
```

This command stays running. Open a **second terminal** for the optional brand app at http://localhost:3002:

```sh
npm run brand
```

Run checks separately. Stop the servers with Ctrl+C before reinstalling dependencies or building:

```sh
npm run validate:sessions
npm run typecheck
npm test
npm run build
```

The checks validate session JSON, check TypeScript, run game/web and vision tests, and build the production web app.

The web app uses the Next.js App Router and React; local TypeScript packages are compiled by Next.js. This follows the [official Next.js installation guidance](https://nextjs.org/docs/app/getting-started/installation). No database or separate backend process is needed. Definition quiz judging requires a server-side OpenAI API key (see Definition sprint below). The intended demo deployment is one persistent Node.js server with a writable local disk.

## Playable game UI

`/` is the lobby (nickname, session, camera check), `/play` the round, `/results` the score breakdown and a sample leaderboard.

- **Loop:** `apps/web/src/components/design/design-game.ts` implements `GameController` with the timing rules below and scores typing with the engine's `scoreTyping`, including the keystroke log. Swap it for `createGame` without changing the screens.
- **Prompt dock:** the light-grey card at the top alternates timed definition quizzes and typing. Quiz rounds use server-side LLM judging; see [Definition sprint](#definition-sprint). Typing retains live per-letter states, a speed bar that drains toward `timeLimitMs`, a streak chip, and the scorer's notes after each submit.
- **Agents:** the sessions list `commit-to-love` first. A strip shows each agent's activity and progress from `getAgentWindows`; transcript lines are labeled by agent.
- **Camera and shower:** `components/camera/CameraProvider.tsx` wraps `createTracking`; shower efficiency comes from `PlacementScrubDetector` and only counts while the body is under the moving water stream. Foam bubbles follow raw hand speed and are visual only.
- **Filth:** camera rounds start with the player covered in mud and 💩 (`components/camera/filth.ts`). Scrubbing a region under the water cleans it. Visual only; it does not change the score yet.
- **Brand:** `apps/brand` (`npm run brand`) imports the real `globals.css` and `components/ui`, so it can't drift. Flat Framer style with no gradients: light-grey card for typing, solid blue for the shower.

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

## Six Seven (activity 03)

```sh
npm run dev
# Open http://localhost:3000/sixseven
```

The third agent-phase activity, after the shower and the fog wipe: both palms up, rocking in anti-phase like a scale ("six... seven!"). The detector watches the vertical gap between the palms; every reversal with enough travel is a beat, beats alternate six and seven, and the turn score is `100 * min(1, beats / targetBeats)` with the target set by the turn length (1.6 beats a second). Hands moving together, a single hand, or one hand seen twice score nothing. The page runs one 15 s round on the camera or with synthetic hands for tuning.

Engine side is pure and tested: `createSixSeven`, `applySixSevenSample`, `freezeSixSeven`, `sixSevenProgress`, `scoreSixSeven` in `packages/game-engine/src/sixseven.ts`, plus `createSixSevenActivity` for the shared tracking framework. The main game rotates `shower, fog, sixseven` per turn (`apps/web/src/components/design/activity.ts`) and renders `components/sixseven/SixSevenLayer.tsx` over the camera. Rules, tuning and file map in [docs/sixseven-mode.md](docs/sixseven-mode.md).

## Four owners, four workstreams

| Owner | Owns | Deliverable and handoff |
| --- | --- | --- |
| **UI teammate** | `apps/web/src/app/` except `api/`; `apps/web/src/components/`; `apps/brand/`; client hooks; styling | Implemented: lobby, play, and results screens, prompt dock, agent strip, camera overlay and filth, brand guidelines. Remaining: replace the stand-in loop with `createGame`, wire the leaderboard API, and the bathroom renovation panel in [`AGENTS.md`](AGENTS.md). Fetch sessions, create the engine and vision controller, render engine snapshots, and submit the final result to the leaderboard API. |
| **Session teammate** | `content/sessions/*.json` | Funny, fully scripted sessions that pass validation. Each turn supplies one exact target prompt, agent duration, timestamped messages/tool activity/file edits, and its final response. No app code or scoring formulas needed. |
| **Game-state teammate** | `packages/game-engine/`; `apps/web/src/app/api/`; `apps/web/src/lib/server/` | Implement the state machine, replay scheduler, typing/shower scoring, and results. Implement session-loading and disk-leaderboard APIs. Deliver `createGame: GameFactory` and the API responses defined below. Keep the engine independent of React and the camera model. |
| **PM + vision (us)** | `packages/vision/`; generated `apps/web/public/vision-assets/`; shared contract coordination | Maintain shared body/hand/finger tracking, activity IO, score-window helper, camera/model setup, and reference scrub adapter. Deliver `createTracking` / `createMockTracking` plus the compatible `createVision` / `createMockVision`. Activity owners implement adapters against `TrackingFrame`; the engine owns activity switching and final points. |

Everyone imports shared types from `@vibecodemaxxing/contracts`. Coordinate changes to that package, root configuration, dependency lockfile, and this README before changing a shared interface. No teammate needs another teammate's implementation to start working against the types.

```text
AGENTS.md                  # Handoff for agents and new contributors; next task
docs/ideas.md              # Ideas for what the typing should build
apps/brand/                # Brand guidelines app (npm run brand)
apps/web/
  src/app/                 # UI pages/layout; api/ belongs to game-state owner
    api/sessions/          # GET list + GET [id] (to implement)
    api/leaderboard/       # GET standings + POST result (to implement)
  src/components/          # React components: lobby, play, results, camera, shower, fx, ui
  src/components/design/   # Stand-in game loop and session list until createGame lands
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
  commit-to-love.json      # Ten prompts, three agents
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

## Three agent windows and ten prompts

`content/sessions/commit-to-love.json` is a complete ten-turn session about a
fictional developer dating app. The requests share a project but each has its own
punchline: swiping, compatibility, icebreakers, ghosting analytics, premium views,
scheduling, scaling, red flags, breakups, and launch. Three recurring agents
(FRONTEND, BACKEND, QA / CHAOS) work concurrently on the same turn clock, with
12–16 second replays. All tools and code snippets are fictional display data.
The original `ship-it` example remains available.

This adds optional fields to the shared session contract (schemaVersion remains
1; existing sessions still validate). Deploy the updated validator together with
new content: older strict validators will reject the new fields. No game phase,
scoring, vision, or HTTP response shape changes are required.

- `session.agents`: ordered roster of `{ id, name, role }` (1–10 entries when
  supplied; this session uses exactly three).
- `event.agentId`: routes any existing event type to one declared agent. Untagged
  events remain in the shared transcript, such as the final turn summary.
- `event.activity`: optional `idle | analyzing | writing | testing | error |
  fixing | done`; requires an agent ID.
- `event.progress`: optional integer 0–100; requires an agent ID. This is scripted
  visual progress, not a score or a timer. Progress may decrease during a setback.

Tool calls/results must have the same agent ID. Every turn still uses one ordered
`agent.events` array and one `durationMs`; three windows do not create three shower
intervals. The validator checks roster uniqueness, references, status/progress
shape, tool ownership, and all existing timing rules. Regenerate the editor schema
with `npm run schema:generate` after contract changes.

`getAgentWindows` from `@vibecodemaxxing/game-engine` is a pure replay projection:

```ts
const turnId = state.phase === "typing" || state.phase === "agent"
  ? state.turnId
  : state.phase === "finished" ? session.turns.at(-1)!.id : session.turns[0].id;
const windows = getAgentWindows(session, state.transcript, turnId);
// Render each window's name, role, activity, progress, events, tools, and files.
```

Pass only the engine's already-visible transcript, never the full scripted events.
The helper creates no timers and cannot reveal future content. Activity, progress,
logs, and tools start fresh for the selected turn; each agent's mock files persist
across revealed turns. Keep the final turn ID when finished to retain the last
window state. Sessions without a roster project into one legacy coding window.

Backend/content handoff is ready; the UI owner must render the windows and the
game-state owner must implement the existing `createGame` scheduler and session
HTTP routes. Those scaffold stubs are not implemented by this content feature.

## Definition sprint

The playable UI alternates definition quizzes and existing typing prompts, starting
with a quiz. A run rotates through a randomized starting position in the six-word
pool. Short sessions use a subset; all six words are available across runs. Coding
agent replays and shower scoring continue after either kind of answer.

| Word | Time | Reference definition |
| --- | --- | --- |
| Larp | 30s | Pretending to be someone you are not, faking an interest, or putting on a performative act for an audience. |
| Yap | 25s | Talking excessively or rambling about trivial things without getting to the point. |
| Hypergamy | 35s | Marrying or dating someone with higher social status, greater wealth, or a higher educational level than oneself. |
| Tokenmaxxing | 40s | Maximizing AI token usage through prompts, coding sessions, or parallel agents to signal productivity, AI proficiency, or status. |
| Clanker | 15s | A derogatory term for robots or artificial intelligence. |
| Cracked | 15s | Highly skilled or exceptionally talented, especially at coding. |

Definitions and grading rubrics live only in
`apps/web/src/lib/server/quiz-definitions.ts`. Client question metadata (word, ID,
time budget) lives in `packages/contracts/src/quiz.ts`. The reference is revealed
with feedback after judging. Concise paraphrases and minor spelling errors are
accepted by the rubric; the model judges meaning rather than exact text.

Copy `apps/web/.env.example` to `apps/web/.env.local`, set `OPENAI_API_KEY`, and
restart Next.js. `OPENAI_QUIZ_MODEL` defaults to `gpt-4.1-mini`. The key never goes to
the browser. `POST /api/quiz/judge` accepts only `{ wordId, answer }`, looks up the
reference itself, and uses the Responses API with strict structured output and
`store: false`. It returns bounded accuracy (0–100), brief feedback, and the
reference. See [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
Camera practice mode still uses the real judge; it does not invent LLM grades.

```text
remaining = clamp(1 - elapsedMs / wordTimeLimitMs, 0, 1)
wordScore = semanticAccuracy * (0.70 + 0.30 * remaining)
```

Accuracy is 0–100. An 80% answer at half its time budget earns 68/100. An unrelated
answer earns zero regardless of speed. A fully correct answer at the deadline
still earns 70. Blank answers or explicitly skipped failed judgments earn zero.
Quiz scores replace that turn's typing contribution, retaining equal weighting
with shower scores. Mixed runs use `v3-definition` so they do not share score
boards with `v2` typing-only runs. `TypingResult.definitionQuiz` identifies the
semantic score, rubric feedback, reference, and graded/empty/skipped outcome;
legacy point fields use a 70/30 budget for this case, not typing's 200/300 budget.

The controller remains the timing authority. `definitionQuiz` in `GameOptions`
enables the mode and injects a judge; omission preserves typing-only behavior.
Quiz rounds use the existing `typing` phase with a `quiz` descriptor.
`updateQuizDraft` saves the latest on-time answer so the controller auto-submits at
the absolute deadline even when the browser timer is delayed. Enter locks the
answer early. `judging` freezes answer and duration; no input or shower points
accrue while waiting. `retryQuiz` resubmits the same frozen answer; `skipQuiz` is
available only after a failure and gives zero. Disposal aborts a pending request.
A fresh full shower interval begins only after grading. Transitions crossfade and
resize without delaying the clock; reduced-motion preferences are respected.

The route validates input/output, caps answer length at 600, bounds upstream wait
time, rejects cross-origin requests, and never returns upstream errors or secrets.
It uses the same local-hackathon trust model as the rest of the app: elapsed time
is maintained by the client controller. Before public hosting, add authentication,
per-player quotas, and authoritative server timing. The existing leaderboard UI
is still a design stand-in rather than a persisted competitive board.

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

## Separate project: Shower Souls

`apps/bossfight/` is the standalone third-person browser bossfight. It runs independently from the webcam activities, Next.js app, and contracts above.

Run **`npm run boss:dev`**, then open **http://127.0.0.1:4173**. Click **Enter the stall** for the fight, or **Practice cleaning** for a passive boss. Reduce the **Stink Meter from 100% to 10%** before Linglong's 100 HP runs out (the same 90% surface-cleaning victory condition). The giant shower stall contains oversized tilework, a drain, soap, glass framing, plumbing, and the supplied garden nozzle.

| Control | Action |
| --- | --- |
| WASD | Move relative to the camera; spraying slows movement |
| Mouse | Aim / orbit the third-person camera |
| Hold left mouse | Wide shower, larger coverage at a lower cleaning rate |
| Hold right mouse | Concentrated jet, smaller coverage, greater range and cleaning rate |
| Space | Directional dodge; defaults forward with no movement input |
| Q | Toggle boss lock-on; moving the mouse returns to free aim |
| F / G | Toggle continuous shower / jet as an alternative to holding a mouse button |
| Esc | Pause; resume, restart, or return to the menu |

Clicking the game captures the mouse when the browser permits it. If capture is unavailable, hold and drag to aim, or use Q with F/G. Losing focus or unlocking a captured mouse pauses the simulation. The gothic menu, death/results screen, retry, and reset of health/cleaning/water are included. Practice is explicitly labeled and uses the same cleaning calculations. The supplied Godfrey soundtrack and natural-pitch, brisk male voice clips are bundled locally and start after the first interaction. The header Sound button mutes all audio; the pause menu has a master-volume slider. Music ducks beneath voiced lines, subtitles display the dialogue, and pausing/end screens silence the encounter. The gothic serif typography uses Google Fonts with local fallbacks.

### Fight and animation ownership

| File | Responsibility |
| --- | --- |
| `src/game.js` | Input, third-person camera, boss decisions, attack commitment, movement, collision wiring, menus and results |
| `src/combat.js` | Player health/state machine, i-frames, buffered rolls, attack windows and capsule intersection |
| `src/cleaning.js` | Pure exposure-based, welded-vertex cleaning and surface-area scoring; water trajectory helper |
| `src/boss-surface.js` | Animated collision surface, hit-to-rest-pose mapping, clean texture shader and local geometry blending |
| `src/water.js` | High-pressure turbulent water column, curved collision traces, moving streaks/mist, surface-attached foam and reflected impact spray |
| `src/water-supply.js`, `src/bottle-pickups.js` | Limited water reserve, pickup/respawn rules, glowing bottle meshes and refill effects |
| `src/boss-spells.js`, `src/spell-rules.js`, `src/stomp.js`, `src/stomp-effects.js` | Agent Swarm, YC blast, cone stomp, Claude drop, tracking deadlines and spell hit volumes |
| `src/boss-audio.js`, `scripts/make-audio.mjs` | User-selected looping music, natural-pitch male voice lines, subtitle timing, ducking and audio asset regeneration |
| `src/arena.js` | Giant shower stall, lighting, fixtures and props |
| `src/motion.js`, `src/boss-walk.js`, `src/footfalls.js` | Authored poses, bounded forward arm hinges, leg IK, distance-matched walking, alternating foot contacts and cosmetic crash effects |
| `src/main.js`, `lab.html` | Separate animation and hitbox inspection lab |
| `scripts/bake.mjs` | Exports authored poses as native 60 fps skeletal animation tracks |
| `scripts/prepare-assets.py` | Blender asset preparation: nozzle optimization and clean boss transfer |
| `scripts/unbrand-clean.mjs` | Native garment material partition for the clean boss; removes all outfit branding |

The boss is **3× the player's height** (5.55 versus 1.85 world units). He turns toward the player before attacks and walks at **5.6 units/second** at distance, **4.5** close up. The new walk pairs each forward leg with the opposite arm, keeps elbows bent forward, and matches animation phase to distance traveled so planted feet do not slide during straight travel. Foot contacts trigger wet splashes, shock rings, a layered crash/rumble and distance-scaled camera shake; these effects cause no damage. Pose changes blend over 0.16 seconds.

The active encounter is spell-heavy: **Agent Swarm, YC Rejection, Deadline Stomp, Claude Drop, and Superman slam**. The old sweeping swat, fist slam, low kick, small stomp and melee charge remain inspectable in the lab but are no longer selected in the fight. The opening rotation demonstrates Swarm → YC → Stomp → Superman, followed by distance-based selection without immediate repeats. Each attack has a recovery opening.

The roll lasts **0.80 seconds**, with invulnerability for its first **0.42 seconds** and vulnerable recovery afterward. Any successful attack knocks the player down for **0.90 seconds**, followed by **1.25 seconds** of protected get-up. A roll pressed in the final **0.18 seconds** of get-up is buffered and starts at the recovery deadline, with no vulnerable transition frame. Each attack window damages only once; charge steps are separate windows. Zero health finishes the fall and opens **You died**. These are prototype timings for our clips, not exact frame data from a particular Dark Souls release.

### Water reserves and encounter effects

The hose has a continuous turbulent core, moving streaks, spray mist, and a slight gravity arc. Jet launch speed is 48 world units/second with a 23-unit range; shower speed is 38 with a 15-unit range. Impacts throw droplets away from the boss surface and briefly attach foam rings to the animated hit triangle. Cleaning still requires sustained exposure.

Each run starts with **100 water**. Shower consumes **6/second** (~16.7 seconds of continuous flow); jet consumes **9/second** (~11.1 seconds). Six glowing bottles each restore **45**, capped at 100, and respawn after **12 seconds of active game time**. Walking or rolling within 1.2 units collects a bottle automatically. Full tanks leave bottles available. There is no passive tank regeneration. Pausing freezes consumption and pickup timers; retry resets both. Empty water stops the stream and cleaning, and even the final partial frame only receives the cleaning exposure paid for by its remaining water.

The blue reserve bar turns amber below 25%, warns when empty, and a direction/distance guide points to the nearest available bottle. Refill sounds and floating feedback confirm collection. The same limits apply in practice so the entire supply loop can be tested without attacks.

Spell timings and targeting are shared through `src/spell-rules.js`:

- **Agent Swarm:** seven small robot agents fall into distinct, marked ground locations around the player's position when cast. Impacts are staggered from 1.35 to 3.03 seconds, each with a 0.18-second, 1.15-unit-radius damage window. Markers stay committed; keeping moving escapes the pattern.
- **YC Rejection:** the boss crouches, turns toward the player and builds a large orange orb between his hands. Aim tracks until 2.45 seconds, then commits for 0.40 seconds before an enormous 2.7-unit-wide blast from 2.85–3.40 seconds. Damage is 42, once per cast; the blast cannot sweep after firing.
- **Deadline Stomp:** the boss braces on his left leg, chambers his right knee, then drives the heel down at 1.08 seconds. His torso compresses and rebounds, his arms counterbalance, and the striking foot stays planted before he steps back. The landing marker and facing lock at 0.65 seconds. Seven rows of jagged stone spikes erupt along the 10-unit, 71° damage cone, with cracked tile, flying gravel, bouncing fragments, dust and a layered crash. The advancing band damages for 32 until 1.58 seconds, once per cast. Remaining rocks fade as harmless debris; the area behind the boss is safe. Animation, hit volumes, eruption timing and contact position share `src/stomp.js`.
- **Claude Drop:** the existing orange sunburst lands in a marked 2.25-unit area, damaging only from 1.70–1.87 seconds.
- **Superman slam:** can travel up to 17 units, follows the player through the early leap until 0.95 seconds, then commits to the marked destination. Landing is at 1.45 seconds, leaving 0.50 seconds after tracking ends to evade. Arm posing now uses a forward elbow hinge.

The existing roll and knockdown protection apply to every spell. Visual rings, trails, residual robots and fading effects outside active windows cause no damage.

The active music is **[Godfrey, First Elden Lord](https://www.youtube.com/watch?v=lHqZZkDvW-o)** from the user-supplied link, saved as `public/audio/godfrey.ogg` (196.88 seconds). A Web Audio buffer source loops it at the end, with no YouTube iframe or network dependency during play. Its source is recorded in `public/audio/manifest.json`. Music ducks under dialogue; volume/mute cover both music and effects. The previous procedural score remains an optional unused asset.

Periodic taunts include “STOP SHOWERING ME!”, “MY RUNWAY IS INFINITE!”, and “YOU CALL THAT A PITCH?” Special attacks announce “AGENT SWARM!”, “DEADLINE!”, “CLAUDE DROP!” or “YOU WILL NOT GET INTO YC!” Voice clips use macOS **Reed (English (US))**, at natural pitch with brisk delivery, midrange emphasis and light compression. The previous ogre pitch shift and bass boost are removed. These are synthesized prototype performances.

Audio assets live in `apps/bossfight/public/audio/`. Regenerate dialogue on macOS with `node apps/bossfight/scripts/make-audio.mjs` (requires `say` and FFmpeg); this preserves the selected soundtrack. Add `--original-score` only to regenerate the unused original composition too. Playback on other machines only needs the bundled Ogg files.

### Local cleaning and model compatibility

A water hit is detected against the **currently posed boss mesh** along a gravity-curved trajectory. The hit triangle maps back to the original rest surface, where nearby facing vertices accumulate exposure. UV-split duplicates share their cleaning value so seams stay together. A patch takes sustained spray: the focused jet adds up to 1.5 exposure/second, the shower up to 0.95, with brush-edge falloff. Already clean patches add no progress. Total progress is triangle-area weighted, not a count of clicks, frames, or vertices. The win threshold is 90% cleaned; the HUD and results show **stink remaining**, from 100% down to 0%.

The two supplied boss models have different topology, UV atlases, and skin weights (28,406 versus 25,643 vertices). `unbrand-clean.mjs` derives `boss_clean-unbranded.glb` from the original clean model. It partitions the existing triangles into plain ivory cotton, pale slate outerwear/backpack, charcoal trousers, unmarked shoes, and a plain wrist strap. Garments use texture-free materials so logos cannot remain in base color or normal maps; the head, hair, neck and hands retain their original appearance. Geometry, UVs, rig and skin weights are preserved. `prepare-assets.py` projects this unbranded clean model's surface positions/normals, material colors and roughness onto the dirty model's topology. At runtime, cleaned vertices gradually approach that transferred clean surface while the material blends locally to the transferred clean texture. The original dirty skeleton/weights keep every patch attached during animation. This is an **approximate surface transfer**, rather than a direct blend of incompatible meshes; very small texture details and the original clean rig's exact silhouette can differ. Normal-map detail fades in cleaned areas, and roughness gradually matches the clean fabric material. Original Downloads files are untouched.

Generated preparation assets in `public/models/`:

- `nozzle.glb`: supplied ~1.94-million-triangle nozzle reduced to **21,999 triangles**, around **798 KB**.
- `boss_clean-unbranded.glb`: clean boss with plain garment materials and original exposed skin/hair. `boss_clean-animated.glb` is animated from this version.
- `clean-transfer.png`: 1024px unbranded clean appearance baked onto the dirty UV atlas, with edge dilation. RGB contains sRGB base color; alpha stores clean material roughness.
- `clean-surface.bin`: six little-endian float32 values per dirty vertex: clean target XYZ and normal XYZ.
- `clean-transfer.json`: vertex count and preparation metadata.

To regenerate these assets with Blender installed:

```sh
node apps/bossfight/scripts/unbrand-clean.mjs
/Applications/Blender.app/Contents/MacOS/Blender -b --python apps/bossfight/scripts/prepare-assets.py
npm run boss:animate
```

When changing only the clean outfit, add `-- --clean-only` to the Blender command to skip nozzle processing.

The preparation script reads the nozzle from `/Users/dengjingxi/Downloads/garden+hose+nozzle+3d+model.glb`; update that path if regenerating on another machine. Running the game only requires the prepared files already in `public/models/`.

### Animation lab and validation

Open **http://127.0.0.1:4173/lab.html** for the preserved animation lab. Pick a model/clip, switch lineup/solo, orbit, pause, scrub, slow down, inspect skeletons and hitboxes, or download animated GLBs. **Test combat** repeats the selected attack with WASD, Space and R; it is a focused hitbox sandbox. Horizontal travel and turning are supplied by the controller; exported clips remain in place.

| Export | Clips |
| --- | --- |
| `linglong-animated.glb` | `ready`, `jog_forward`, `jog_backward`, `jog_left`, `jog_right`, `dodge`, `spray`, `hit`, `knockdown`, `getup` |
| `boss-animated.glb` | `idle`, `advance`, `turn_left`, `turn_right`, `sweep`, `slam`, `kick`, `stomp`, `charge`, `jump_slam`, `yc_charge`, `agent_cast`, `giant_stomp`, `stagger`, `clean_victory` |
| `boss_clean-animated.glb` | Same fifteen boss clips, authored for the clean model's proportions |

The lab opens on the new heavy walk in Solo view. Open `/lab.html?clip=giant_stomp` directly for the revised stomp and rock eruption. Belly flop has been removed from the controller, hitboxes and exported animation library. Use Side to inspect opposite arm/leg motion, enable Footfall sound for the crash effects, or select the new casting clips to preview spell effects. Legacy melee clips remain available for reference.

`npm run boss:animate` rebuilds animation exports. `npm run build --workspace @shower-souls/animation-lab` bundles both game and lab. `npm run test:boss` checks original asset preservation, animation tracks and seams, ground contact, dive bounces, combat invulnerability/death/collision boundaries, gradual cleaning, frame-rate independent exposure, area-weighted victory/reset, gravity, generated asset compatibility, unbranded garment coverage without topology or rig changes, reserve depletion/partial exposure, pickup caps/respawns/reset, curved water impacts, spell timing/dodge safety, cone/swarm coverage, long-range dive targeting, opposing walking limbs, planted-foot travel, footfall cadence, decreasing stink, and shipped audio assets.

This is a playable first pass. Combat balance, transitions between clips, camera collision around props, and the fidelity of the clean appearance need hands-on iteration. The arena boundary constrains movement; decorative props currently do not block characters. Cleaning is a surface brush approximation around the first water hit, rather than fluid simulation.
