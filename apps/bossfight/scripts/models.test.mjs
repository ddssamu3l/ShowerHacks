import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root } from './build.mjs';
import { readGlb, accessorValues } from './glb.mjs';
import { WEB_MODELS, optimizeModel } from './optimize-models.mjs';

const out = await mkdtemp(path.join(tmpdir(), 'shower-models-'));
test.after(() => rm(out, { recursive: true, force: true }));

const accessorsOf = (json) => [
  ...json.meshes.flatMap((mesh) => mesh.primitives.flatMap((p) => [...Object.values(p.attributes), p.indices].filter((i) => i !== undefined))),
  ...(json.skins || []).map((skin) => skin.inverseBindMatrices),
  ...(json.animations || []).flatMap((a) => a.samplers.flatMap((s) => [s.input, s.output])),
];

for (const file of WEB_MODELS) {
  test(`${file}: web copy keeps vertices, skin and clips, and ships WebP textures`, async () => {
    const input = path.join(root, 'public', 'models', file), output = path.join(out, file);
    await optimizeModel(input, output);
    const source = await readGlb(input), web = await readGlb(output);
    const a = accessorsOf(source.json), b = accessorsOf(web.json);
    assert.equal(b.length, a.length);
    a.forEach((index, i) => assert.deepEqual(accessorValues(web.json, web.bin, b[i]), accessorValues(source.json, source.bin, index)));
    for (const index of b) {
      const accessor = web.json.accessors[index], stride = web.json.bufferViews[accessor.bufferView].byteStride;
      const bytes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type] * { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
      assert.ok(stride === undefined || stride === bytes, 'vertex attributes must not be interleaved');
    }
    assert.deepEqual(web.json.nodes.map((n) => n.name), source.json.nodes.map((n) => n.name));
    assert.deepEqual(web.json.animations?.map((c) => c.name), source.json.animations?.map((c) => c.name));
    assert.ok(web.json.images.every((image) => image.mimeType === 'image/webp'));
    assert.ok((await stat(output)).size < (await stat(input)).size);
  });
}
