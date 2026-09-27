import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { root } from './build.mjs';
import { readGlb, writeGlb, skeletonScene, meshFloorProbe } from './glb.mjs';
import { MotionRig, CLIPS } from '../src/motion.js';

const models = [{ file: 'linglong', kind: 'player' }, { file: 'boss', kind: 'boss' }, { file: 'boss_clean', kind: 'boss' }];
const manifest = { fps: 60, clips: CLIPS, models: [] };
for (const model of models) {
  const { json, bin } = await readGlb(path.join(root, 'public/models', (model.file === 'boss_clean' ? 'boss_clean-unbranded' : model.file) + '.glb'));
  const { root: scene, height, nodes } = skeletonScene(json);
  const rig = new MotionRig(scene, height, model.kind);
  const floorProbe = meshFloorProbe(json, bin, nodes);
  const chunks = [bin]; let byteLength = bin.length;
  const append = (values, type, bounds) => {
    const pad = (4 - byteLength % 4) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); byteLength += pad; }
    const buffer = Buffer.from(new Float32Array(values).buffer);
    const bufferView = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buffer.length });
    chunks.push(buffer); byteLength += buffer.length;
    const accessor = json.accessors.length;
    json.accessors.push({ bufferView, componentType: 5126, count: values.length / ({ SCALAR: 1, VEC3: 3, VEC4: 4 }[type]), type, ...bounds });
    return accessor;
  };
  json.animations = [];
  for (const clip of CLIPS[model.kind]) {
    const frames = Math.round(clip.duration * 60);
    const times = Array.from({ length: frames + 1 }, (_, i) => i * clip.duration / frames);
    const tracks = new Map(Object.values(rig.bones).map((bone) => [bone, { rotations: [], positions: [] }]));
    for (const time of times) {
      rig.sample(clip.id, time);
      // Ground the rolling silhouette using actual skinned vertices, including
      // the head and jacket, rather than guessing a capsule around the hips.
      if (['dodge', 'knockdown', 'getup', 'jump_slam', 'advance', 'yc_charge', 'giant_stomp'].includes(clip.id)) {
        rig.bones.Hips.position.y += -floorProbe() + rig.groundLift * height;
        scene.updateMatrixWorld(true);
      }
      for (const [bone, track] of tracks) {
        const q = bone.quaternion.toArray();
        const prev = track.rotations.slice(-4);
        if (prev.length && q.reduce((sum, v, i) => sum + v * prev[i], 0) < 0) for (let i = 0; i < 4; i++) q[i] *= -1;
        track.rotations.push(...q); track.positions.push(...bone.position.toArray());
      }
    }
    const input = append(times, 'SCALAR', { min: [0], max: [clip.duration] });
    const animation = { name: clip.id, samplers: [], channels: [], extras: { ...clip, inPlace: true, authoredBy: 'Shower Souls animation lab' } };
    for (const [bone, track] of tracks) for (const channel of ['rotation', 'translation']) {
      if (channel === 'translation' && bone !== rig.bones.Hips) continue;
      const values = channel === 'rotation' ? track.rotations : track.positions;
      if (!values.every(Number.isFinite)) throw new Error(`Invalid animation: ${model.file}/${clip.id}/${bone.name}`);
      const output = append(values, channel === 'rotation' ? 'VEC4' : 'VEC3');
      const sampler = animation.samplers.length;
      animation.samplers.push({ input, output, interpolation: 'LINEAR' });
      animation.channels.push({ sampler, target: { node: bone.userData.nodeIndex, path: channel } });
    }
    json.animations.push(animation);
  }
  json.buffers[0].byteLength = byteLength;
  const output = model.file + '-animated.glb';
  await writeGlb(path.join(root, 'public/models', output), json, Buffer.concat(chunks));
  manifest.models.push({ ...model, height, output, clips: json.animations.map((c) => c.name) });
  console.log(`${output}: ${json.animations.length} clips, ${(byteLength / 1048576).toFixed(1)} MB`);
}
await writeFile(path.join(root, 'public/models/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
