# ShowerHacks

**Two silly games about staying clean while computers do the work.** We built them at a hackathon.

1. **Shower Souls:** a 3D boss fight in your browser. You're **Linglong**, armed with a garden hose, and you have to wash a giant, filthy boss covered in tech company stickers. Up to three friends can join you.
2. **Vibecodemaxxing:** a webcam party game. You type orders to a pretend AI helper, and while it "works", you scrub yourself in front of your camera like you're in the shower.

---

## The short version

| Question | Answer |
| --- | --- |
| **What is it?** | Two browser games: a 3D boss fight and a webcam scrubbing game. |
| **What frameworks?** | **Three.js** draws the 3D boss fight. **Next.js** (a React website framework) runs the webcam game. |
| **Which AI models?** | **Google MediaPipe** watches your body and hands through the webcam. **OpenAI GPT-4.1 mini** grades the word quiz. **Tripo** (an AI 3D-model maker) created the characters. |
| **Does my video leave my computer?** | No. The camera model runs inside your browser, and no video is uploaded. |
| **Where does it run?** | Any Chromium browser (Chrome, Arc, Edge) on a computer. The boss fight is hosted on Railway. |

---

## Game 1: Shower Souls

### The story

A giant who has never used soap lives deep inside an enormous shower. His name is **The Unwashed**. He's three times taller than you, covered in mud, and he stinks.

You're **Linglong**, a normal guy in a hoodie holding a garden hose. Get the giant clean before he knocks you out.

The giant is covered in stickers you'd find on a programmer's laptop: **Y Combinator, Stanford, OpenAI, Anthropic, Google DeepMind, Groq, and Cluely**. When you wash him, the stickers wash off with the dirt. His attacks make fun of the tech world too. He yells *"YOU WILL NOT GET INTO YC!"* and fires a giant orange blast, drops a Claude logo from the sky, sends a swarm of tiny robot "agents" after you, and stomps the floor while shouting *"DEADLINE!"*

### How to win

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

### Play with friends

Click **Play with friends**. You get a 4-letter room code; up to two friends type it in to join. Everyone fights the same giant, and he gets tougher with each extra player. At the end you see who did the most cleaning.

---

## Game 2: Vibecodemaxxing

1. **Type fast.** An order appears, like "Make a button." Type it quickly and exactly. Typos, long pauses and backspaces cost points.
2. **Shower while the "AI" works.** A pretend AI helper then does the job (it's all scripted for laughs). While it works, you **scrub yourself in front of the webcam**. The screen shows you covered in mud, and scrubbing washes it away.
3. **Mini-games take turns with the shower:** wipe a foggy bathroom mirror with your hand, or do the "six seven" dance (palms up, rocking like a scale).
4. **Word quizzes** ask what internet slang means, like "yap", "cracked" or "clanker". An AI checks whether you got the meaning right.

Your final score is half typing, half scrubbing, out of 10,000.

---

## How the AI parts work

### Watching you through the webcam (Google MediaPipe)

We use two small models from Google's **MediaPipe**:

- **Pose Landmarker** finds 33 points on your body: shoulders, elbows, face, and so on.
- **Hand Landmarker** finds 21 points on each hand, down to your fingertips.

About 20 times a second, the browser grabs a camera frame and asks both models, "Where are this person's body and hands?" The models answer with dots, not pictures. Our code then uses those dots to figure out things like:

- **Is your hand on your chest, hair, armpit or shoulder?** It checks which body area your palm overlaps.
- **Are you really scrubbing?** It looks for back-and-forth or circular movement. Holding still or waving your hand in the air earns nothing.
- **Did you wipe the mirror, or rock your palms "six... seven"?** Each mini-game reads the same dots in its own way.

The models run on your own computer, inside the browser, so the video never goes anywhere.

We built one shared **tracking framework** on top of MediaPipe. It turns the camera into a single stream of "here's the body, here are the hands" updates. Every mini-game (shower, mirror, six seven) plugs into that stream instead of setting up the camera itself, which made adding new mini-games quick.

### Grading the word quiz (OpenAI GPT-4.1 mini)

When you type a definition, our server sends your answer and the correct meaning to **GPT-4.1 mini**. It scores how close your answer's *meaning* is (0 to 100), so paraphrases and small spelling mistakes still count. Faster answers earn a bonus. The correct answers and the API key stay on the server, so players can't peek.

### Making the characters (Tripo)

Linglong and the giant started as 3D models made with **Tripo**, an AI tool that creates 3D characters. We then added skeletons, wrote every animation by hand in code, and used Blender to make a clean, logo-free version of the giant. As you spray him, the game blends from the dirty model to the clean one in the exact spots the water hits.

### What *isn't* AI

The giant's fighting brain is rules we wrote ourselves, not a trained model: how he picks attacks, chases the closest player, and sometimes turns on whoever sprayed him last. The pretend AI helper in the typing game is also fully scripted.

---

## What we built it with

| Part | Tools |
| --- | --- |
| **3D boss fight** | [Three.js](https://threejs.org) for 3D graphics, plain JavaScript |
| **Characters and animation** | Tripo (AI 3D models), Blender, and our own animation code |
| **Playing with friends** | A Node.js server using WebSockets that keeps everyone's fight in sync 30 times a second |
| **Sound** | The browser's Web Audio API. Boss lines use macOS text-to-speech; Linglong's voice comes from a real recording, cleaned up with DeepFilterNet and FFmpeg |
| **Webcam game** | [Next.js](https://nextjs.org), React, TypeScript and Tailwind CSS |
| **Body and hand tracking** | Google [MediaPipe](https://developers.google.com/edge/mediapipe) Pose and Hand Landmarker, running in the browser |
| **Water and bubbles** | PixiJS |
| **Word quiz judge** | OpenAI GPT-4.1 mini |
| **Hosting** | [Railway](https://railway.com) |

---

## Try it yourself

You need [Node.js](https://nodejs.org) 22 or newer.

```sh
npm install

npm run boss:dev   # Shower Souls → open http://127.0.0.1:4173
npm run dev        # Vibecodemaxxing → open http://localhost:3000 and allow the camera
```

No camera? Click **Practice without a camera** in Vibecodemaxxing. The word quiz needs an OpenAI key: copy `apps/web/.env.example` to `apps/web/.env.local` and fill in `OPENAI_API_KEY`.

---

## For developers

- [`docs/technical-guide.md`](docs/technical-guide.md): how every piece fits together, the exact scoring math, and file-by-file ownership.
- [`AGENTS.md`](AGENTS.md): the handoff notes for AI coding agents and new contributors.
