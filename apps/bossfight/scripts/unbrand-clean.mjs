/** Split the clean model into plain garment materials without changing its rig or surfaces. */
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, accessorValues } from './glb.mjs';

const models = new URL('../public/models/', import.meta.url);
const source = fileURLToPath(new URL('boss_clean.glb', models));
const output = fileURLToPath(new URL('boss_clean-unbranded.glb', models));
const { json, bin } = await readGlb(source);
const mesh = json.meshes[0];
if (mesh.primitives.length !== 1) throw new Error('Expected the original clean boss with one primitive');
const original = mesh.primitives[0];
const positions = accessorValues(json, bin, original.attributes.POSITION);
const indices = accessorValues(json, bin, original.indices);

const plain = (name, role, color, roughnessFactor = .9) => ({
  name, doubleSided: true,
  pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: 0, roughnessFactor },
  extras: { unbranded: true, surfaceRole: role },
});
json.materials[original.material].extras = { ...json.materials[original.material].extras, surfaceRole: 'skin-hair' };
const firstMaterial = json.materials.length;
json.materials.push(
  plain('Clean · ivory cotton', 'shirt', [.72, .76, .74]),
  plain('Clean · pale slate canvas', 'outerwear', [.43, .51, .53]),
  plain('Clean · charcoal trousers', 'trousers', [.065, .085, .1]),
  plain('Clean · unmarked sneakers', 'shoes', [.73, .76, .71], .8),
  plain('Clean · plain wrist strap', 'wrist-strap', [.045, .055, .06]),
);
const materials = { skin: original.material, shirt: firstMaterial, outerwear: firstMaterial + 1, trousers: firstMaterial + 2, shoes: firstMaterial + 3, strap: firstMaterial + 4 };
const groups = Object.fromEntries(Object.keys(materials).map(key => [key, []]));

// Boundaries are in this supplied model's rest pose, +Y up and +Z forward.
// The original source remains intact. Skin/hair retain their original material;
// every garment receives a texture-free PBR material, including shoes and wrist branding.
function region([x, y, z]) {
  if (y > .808 && Math.abs(x) < .14) return 'skin';
  if (y > .784 && Math.abs(x) < .044 && z > .029) return 'skin';
  if (x < -.366 || x > .393) return 'skin';
  if (x > .366) return 'strap';
  if (y < .094) return 'shoes';
  if (y < .463) return 'trousers';
  if ((Math.abs(x) > .133 && y > .68) || y > .796) return 'shirt';
  if (z > .035 && Math.abs(x) < .052) return 'shirt';
  return 'outerwear';
}
for (let i = 0; i < indices.length; i += 3) {
  const face = indices.slice(i, i + 3), center = [0, 0, 0];
  for (const id of face) for (let k = 0; k < 3; k++) center[k] += positions[id * 3 + k] / 3;
  groups[region(center)].push(...face);
}
const chunks = [bin]; let byteLength = bin.length;
mesh.primitives = [];
for (const [role, group] of Object.entries(groups)) {
  if (!group.length) continue;
  const padding = (4 - byteLength % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
  const bytes = Buffer.alloc(group.length * 4);
  group.forEach((index, i) => bytes.writeUInt32LE(index, i * 4));
  const viewIndex = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target: 34963 });
  const accessorIndex = json.accessors.length;
  json.accessors.push({ bufferView: viewIndex, componentType: 5125, count: group.length, type: 'SCALAR', min: [Math.min(...group)], max: [Math.max(...group)] });
  mesh.primitives.push({ ...original, indices: accessorIndex, material: materials[role], extras: { surfaceRole: role, unbranded: role !== 'skin' } });
  chunks.push(bytes); byteLength += bytes.length;
}
json.buffers[0].byteLength = byteLength;
json.asset.extras = { ...json.asset.extras, unbrandedCleanOutfit: true, source: 'boss_clean.glb', method: 'Native garment primitive partition; original geometry, UVs, skeleton, and skin weights preserved' };
await writeGlb(output, json, Buffer.concat(chunks));
console.log(JSON.stringify({ output, triangles: Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.length / 3])) }, null, 2));
