import { cp, mkdir, stat, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const destination = join(root, "apps/web/public/vision-assets");
await mkdir(destination, { recursive: true });
for (const [filename, modelUrl] of [
  ["pose_landmarker_full.task", "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"],
  ["hand_landmarker.task", "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"],
]) {
  const modelPath = join(destination, filename);
  if ((await stat(modelPath).catch(() => null))?.size) continue;
  console.log(`Downloading ${filename}…`);
  const response = await fetch(modelUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1_000_000) throw new Error("Model download was unexpectedly small.");
  await writeFile(`${modelPath}.tmp`, bytes);
  await rename(`${modelPath}.tmp`, modelPath);
}
const mediaPipe = dirname(require.resolve("@mediapipe/tasks-vision"));
await cp(join(mediaPipe, "wasm"), join(destination, "wasm"), { recursive: true });
await build({
  entryPoints: [join(root, "packages/vision/src/pose.worker.ts")],
  outfile: join(destination, "pose-worker.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "eof",
});
console.log("Vision assets ready. Run npm run dev and open /vision.");
