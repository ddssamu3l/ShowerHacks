# Shower Souls

A 3D boss fight in the browser where your only weapon is a garden hose.

You play as Linglong. Wash a giant, filthy boss covered in tech stickers before he knocks you out. Play alone or with up to two friends.

## How to play

Spray the boss until the Stink Meter drops to 10%. Only the spots the water hits get clean, so cover all of him.

| Action | Key |
| --- | --- |
| Move | W A S D |
| Wide spray | Left mouse |
| Strong jet | Right mouse |
| Roll | Space |
| Lock on | Q |

Watch for his wind-up, roll away, then spray while he recovers. Refill water from the blue bottles.

## Run

Needs Node.js 22+ and a mouse.

```bash
npm install
npm run boss:dev   # http://127.0.0.1:4173
```

## Stack

Three.js, characters made with Tripo and Blender, animation written in code, and a Node.js WebSocket server on Railway for multiplayer.

The story, every attack and how cleaning works are in [docs/about.md](docs/about.md). File by file notes are in [docs/technical-guide.md](docs/technical-guide.md).
