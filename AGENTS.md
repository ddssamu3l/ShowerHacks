# Agent handoff

Read this before changing the game. [`README.md`](README.md) is the full team contract (sessions, engine,
vision, scoring); this file covers the playable UI that now sits on top of it and what to build next.
Next.js in `apps/web` has its own rules in [`apps/web/AGENTS.md`](apps/web/AGENTS.md).

## Run it

```sh
npm install
npm run dev     # downloads vision models if missing, then http://localhost:3000
npm run brand   # brand guidelines on http://localhost:3002
npm run typecheck && npm test && npm run validate:sessions
```

Use a Chromium browser on localhost and allow the camera. "Practice without a camera" plays a full round
with a fake shower.

## What exists

- **Screens:** lobby (`/`), play (`/play`), results (`/results`) in `apps/web/src/components/{lobby,play,results}`.
- **Game loop:** `components/design/design-game.ts` is a stand-in for `createGame`. It follows the README
  timing rules and already scores typing with the engine's `scoreTyping` (keystrokes included, so pause
  and backspace penalties apply). Replace it with `createGame` from `@vibecodemaxxing/game-engine` when
  that lands; keep the `GameController` interface.
- **Definition quizzes:** The playable loop alternates quizzes and typing. Quiz state/timing belongs to the design controller; `/api/quiz/judge` grades against server-only references. See README “Definition sprint” for API key setup, scoring, and handoff.
- **Sessions:** `commit-to-love` (10 prompts, three agents) and `ship-it` (3 prompts), loaded in
  `components/design/session.ts`. The agent strip (`play/Agents.tsx`) uses `getAgentWindows`.
- **Camera:** `components/camera/CameraProvider.tsx` wraps `createTracking` from `@vibecodemaxxing/vision`
  (body, hands, fingers) and scores scrubbing with `PlacementScrubDetector`. Frames are mirrored for the
  selfie view. Foam bubbles follow raw hand speed; points follow the stricter scrub detector.
- **Filth:** `components/camera/filth.ts` covers the player in mud and 💩 when a camera round starts.
  Scrubbing a body region under the water cleans it. It is visual only; it does not change the score.
- **Brand:** `apps/brand` renders the real `globals.css` and `components/ui`. Flat Framer style: black
  canvas, white type, one blue. No gradients. White card = typing, solid blue (`bg-water`) = shower.

## Next task: build the bathroom you're showering in, instead of coding sessions

Playtesters find the right-hand terminal boring: typing produces fake npm output, so the only visible
progress is cleaning. Replace the coding-agent fiction with a **bathroom renovation**:

- Each prompt is a renovation order ("Replace the bucket with an actual showerhead. Nothing gold yet.").
- While the "contractor" works (the agent phase), the shower on the camera upgrades live: bucket →
  garden hose → showerhead → rain shower → gold jacuzzi with a disco ball. Typing progress becomes
  visible in the same place the player is already looking.
- Put the player's exact submitted text on the result (a sign, a plaque, a receipt), typos included.
  The scripted reply stays identical, as the engine contract requires.
- Replace `play/Transcript.tsx` and `play/Editor.tsx` with a visual renovation panel; keep the agent strip
  idea for the crew (plumber, electrician, "interior designer").
- Upgrade the water in `components/shower/PixiWater.tsx` per turn: stream width, pressure, color, props.

Suggested order:

1. Write a `content/sessions/bathroom-reno.json` session with the existing event types. Use
   `assistant_message` for contractor lines; drive the upgrade level from the turn index at first, so no
   contract change is needed.
2. Build the renovation panel and the per-turn shower upgrades in the UI.
3. If the visuals need data the schema can't carry, propose an optional event type in
   `packages/contracts/src/session.ts` and regenerate the schema with `npm run schema:generate`.
   Coordinate that change with the team first.

Other options are in [`docs/ideas.md`](docs/ideas.md).

## Rules that keep the game working

- The engine owns phases, timing, and points. The UI renders snapshots and never advances the game.
- Keep `@vibecodemaxxing/contracts` changes coordinated; update the README with them.
- Keep the flat brand: check `npm run brand` before adding a color or a gradient.
- Run typecheck, tests, and session validation before pushing.
