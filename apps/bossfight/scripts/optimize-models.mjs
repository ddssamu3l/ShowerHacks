import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, VertexLayout } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { root } from './build.mjs';

// Models the game downloads before the fight. Only textures are re-encoded:
// vertex order must stay identical because clean-surface.bin indexes the boss mesh.
export const WEB_MODELS = ['linglong-animated.glb', 'boss-animated.glb', 'nozzle.glb'];
export const webModelsDir = path.join(root, 'dist', 'models');

export async function optimizeModel(input, output) {
  // BossSurface reads position/normal `.array` directly, so attributes cannot be interleaved.
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setVertexLayout(VertexLayout.SEPARATE);
  const document = await io.read(input);
  await document.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normalTexture$/, quality: 92 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(?!normalTexture$)/, quality: 85 }),
  );
  await io.write(output, document);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(webModelsDir, { recursive: true });
  for (const file of WEB_MODELS) {
    const input = path.join(root, 'public', 'models', file), output = path.join(webModelsDir, file);
    await optimizeModel(input, output);
    const [{ size: before }, { size: after }] = await Promise.all([stat(input), stat(output)]);
    console.log(`${file}: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
  }
}
