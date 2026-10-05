# Shower Souls, the long version

**A 3D boss fight where your only weapon is a garden hose.** You play as **Linglong** and have to wash a giant, filthy boss covered in tech company stickers before he knocks you out. Play alone or with up to two friends, right in your browser.

---

## The short version

| Question | Answer |
| --- | --- |
| **What is it?** | A browser boss fight inspired by Dark Souls, except you win by giving the boss a shower. |
| **What framework?** | **Three.js**, a JavaScript library for drawing 3D worlds in a web browser. |
| **Which AI models?** | **Tripo** (an AI 3D-model maker) created the characters. **DeepFilterNet** (an AI noise remover) cleaned up Linglong's voice. The boss's voice is macOS text-to-speech. |
| **Is the boss an AI?** | No. His fighting brain is rules we wrote ourselves. |
| **Where does it run?** | Any modern browser on a computer with a mouse. Online play runs on a small server hosted on Railway. |

---

## The story

A giant who has never used soap lives deep inside an enormous shower. His name is **The Unwashed**. He's three times taller than you, covered in mud, and he stinks.

You're **Linglong**, a normal guy in a hoodie holding a garden hose. Get the giant clean before he knocks you out.

The giant is covered in stickers you'd find on a programmer's laptop: **Y Combinator, Stanford, OpenAI, Anthropic, Google DeepMind, Groq, and Cluely**. When you wash him, the stickers wash off with the dirt. His attacks make fun of the tech world too:

- **YC Rejection:** he yells *"YOU WILL NOT GET INTO YC!"* and fires a giant orange blast.
- **Claude Drop:** a Claude logo falls from the sky.
- **Agent Swarm:** tiny robot "agents" rain down around you.
- **Deadline Stomp:** he stomps the floor shouting *"DEADLINE!"* and rocks burst out of the ground.
- **Superman slam:** he leaps across the room and lands on you.

Linglong talks back. Sometimes when he turns on the hose, he says one of his three lines:

- *"Man, this code is some trash."*
- *"Apologise to the codebase."*
- *"Man, no one in China has that shit."*

His voice comes from a real video recording, and his words show up as captions on screen.

---

## How to play

The bar at the bottom is the **Stink Meter**. It starts at 100%. Spray the giant until it drops to **10%**. If your health bar (top left) hits zero first, you lose.

| To do this | Press |
| --- | --- |
| Walk | **W A S D** |
| Aim | Move the mouse |
| Wide spray (big area, slow cleaning) | Hold **left mouse button** |
| Strong jet (small area, fast cleaning) | Hold **right mouse button** |
| Roll out of the way | **Space** |
| Lock your aim on the boss | **Q** |
| Pause | **Esc** |

- **Water runs out.** Walk over the glowing blue bottles to refill.
- **Watch for warnings.** Before each attack, he winds up or a marker appears on the floor. Roll away, then spray him while he recovers.
- **Wash every side.** Only the spots the water actually hits get clean.

**Play with friends:** click **Play with friends** to get a 4-letter room code. Up to two friends type it in to join. Everyone fights the same giant, he gets tougher with each extra player, and at the end you see who did the most cleaning.

---

## How it works

### The game

Everything happens inside your browser. Many times a second, the game:

1. Reads your keyboard and mouse.
2. Moves Linglong and the boss, and plays their animations.
3. Shoots the water forward in a curved arc (gravity pulls it down) and checks which part of the boss it hits.
4. Checks whether a boss attack caught you, unless you rolled out of the way in time.
5. Redraws the whole 3D scene with Three.js.

### Washing the boss

We have **two versions** of the boss: a dirty one covered in mud and stickers, and a clean one in plain clothes. When water hits a spot on the boss, that spot slowly fades from dirty to clean, like wiping a window. The rest of him stays filthy.

The Stink Meter measures how much of the boss's **surface area** is clean, so spraying the same spot over and over doesn't help. You have to cover all of him, including his back.

### The 3D models

1. **Tripo**, an AI tool, created the 3D models of Linglong and the boss, including their textures.
2. We added a **skeleton** inside each character (bones for arms, legs, spine) so they can move.
3. We wrote **every animation in code**: walking, rolling, stomping, getting knocked down. Then we saved them as smooth 60-frames-per-second clips.
4. The AI-made outfit had company logos baked into it, so we used **Blender** (a free 3D program) to make a clean, logo-free version of the boss.

### The boss's brain

The boss isn't a trained AI model. He follows rules we wrote: turn toward the player, walk closer if you're far away, pick an attack he hasn't just used, and leave a short opening after each attack so you can hit back.

### Playing together

When you play with friends, a small **Node.js server** runs the boss's brain instead of your browser, about 30 times a second. Each player's game sends where they are and what they sprayed; the server sends back what the boss does. That way everyone sees the same fight at the same moment.

---

## What we built it with

| Part | Tools |
| --- | --- |
| **3D graphics** | [Three.js](https://threejs.org), plain JavaScript |
| **Characters** | Tripo (AI 3D models), Blender, and our own animation code |
| **Playing with friends** | Node.js server using WebSockets |
| **Music and voices** | The browser's Web Audio API. Boss lines use macOS text-to-speech. Linglong's voice is a real recording, cleaned up with DeepFilterNet and FFmpeg |
| **Hosting** | [Railway](https://railway.com) |

---

## Try it yourself

You need [Node.js](https://nodejs.org) 22 or newer and a computer with a mouse. Headphones make it better.

```sh
npm install
npm run boss:dev
# open http://127.0.0.1:4173
```

---

## For developers

- The game lives in [`apps/bossfight/`](apps/bossfight). The [Shower Souls section of the technical guide](docs/technical-guide.md#separate-project-shower-souls) covers every file, the attack timings, and how cleaning is calculated.
- [`AGENTS.md`](AGENTS.md) holds the handoff notes for AI coding agents.
- The rest of this repo (`apps/web`, `packages/`) holds an earlier webcam game prototype. It isn't part of Shower Souls.
