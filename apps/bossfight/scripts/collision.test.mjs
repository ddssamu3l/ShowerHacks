import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { readGlb, accessorValues, skeletonScene } from './glb.mjs';
import { canSkinFast, skinnedWorldPositions } from '../src/skinning.js';
import { CleaningSurface } from '../src/cleaning.js';

let seed = 7;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

async function bossRig() {
  const { json, bin } = await readGlb(new URL('../public/models/boss-animated.glb', import.meta.url));
  const primitive = json.meshes[0].primitives[0], attributes = primitive.attributes;
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(accessorValues(json, bin, attributes.POSITION)), 3));
  geometry.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(accessorValues(json, bin, attributes.JOINTS_0)), 4));
  geometry.setAttribute('skinWeight', new T.BufferAttribute(new Float32Array(accessorValues(json, bin, attributes.WEIGHTS_0)), 4));
  geometry.setIndex(new T.BufferAttribute(new Uint32Array(accessorValues(json, bin, primitive.indices)), 1));
  const { root, nodes } = skeletonScene(json), meshNode = json.nodes.findIndex((node) => node.mesh === 0), skin = json.skins[json.nodes[meshNode].skin];
  const inverse = accessorValues(json, bin, skin.inverseBindMatrices);
  const bones = skin.joints.map((i) => nodes[i]), inverses = bones.map((_, i) => new T.Matrix4().fromArray(inverse, i * 16));
  const mesh = new T.SkinnedMesh(geometry, new T.MeshBasicMaterial());
  nodes[meshNode].add(mesh);
  const scene = new T.Group(); scene.scale.setScalar(5.7); scene.position.set(1.5, 0, -2); scene.rotation.y = .7; scene.add(root);
  scene.updateMatrixWorld(true);
  mesh.bind(new T.Skeleton(bones, inverses), mesh.matrixWorld);
  return { scene, mesh, bones };
}
function pose(rig, amount) {
  for (const bone of rig.bones) bone.rotation.set((random() - .5) * amount, (random() - .5) * amount, (random() - .5) * amount);
  rig.scene.updateMatrixWorld(true); rig.mesh.skeleton.update();
}
function reference(mesh) {
  const out = new Float64Array(mesh.geometry.attributes.position.count * 3), v = new T.Vector3();
  for (let i = 0; i < out.length / 3; i++) { mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld); out.set([v.x, v.y, v.z], i * 3); }
  return out;
}

test('fast CPU skinning matches three.js getVertexPosition on the boss rig', async () => {
  const rig = await bossRig();
  assert.equal(canSkinFast(rig.mesh), true);
  for (const amount of [0, .6, 1.8]) {
    pose(rig, amount);
    const expected = reference(rig.mesh), actual = skinnedWorldPositions(rig.mesh, new Float64Array(expected.length));
    let error = 0; for (let i = 0; i < expected.length; i++) error = Math.max(error, Math.abs(expected[i] - actual[i]));
    assert.ok(error < 1e-9, `pose ${amount}: max error ${error}`);
  }
  // Cleaning moves vertices toward the clean model; the fast path must read live positions.
  const position = rig.mesh.geometry.attributes.position; position.array[0] += .5; position.array[3001] -= .25; position.needsUpdate = true;
  const expected = reference(rig.mesh), actual = skinnedWorldPositions(rig.mesh, new Float64Array(expected.length));
  let error = 0; for (let i = 0; i < expected.length; i++) error = Math.max(error, Math.abs(expected[i] - actual[i]));
  assert.ok(error < 1e-9, `edited positions: max error ${error}`);
});

test('cleaning brush produces identical exposure to the original reduce-based brush', async () => {
  const { json, bin } = await readGlb(new URL('../public/models/boss-animated.glb', import.meta.url));
  const primitive = json.meshes[0].primitives[0];
  const positions = new Float32Array(accessorValues(json, bin, primitive.attributes.POSITION)), normals = new Float32Array(accessorValues(json, bin, primitive.attributes.NORMAL));
  const indices = new Uint32Array(accessorValues(json, bin, primitive.indices));
  const current = new CleaningSurface(positions, normals, indices), original = new CleaningSurface(positions, normals, indices);
  original.paint = function (point, normal, radius, rate, dt) {
    if (!(radius > 0 && rate > 0 && dt > 0) || ![...point, ...normal, radius, rate, dt].every(Number.isFinite)) return [];
    const changed = []; const r2 = radius * radius;
    for (const group of this.groups) {
      if (group.clean >= 1) continue;
      const d2 = group.p.reduce((s, p, k) => s + (p - point[k]) ** 2, 0);
      if (d2 > r2) continue;
      if (!group.vertices.some(i => normal.reduce((s, n, k) => s + n * this.normals[i * 3 + k], 0) > .2)) continue;
      const exposure = rate * dt * (1 - .65 * d2 / r2);
      const before = group.clean; group.clean = Math.min(1, before + exposure);
      this.cleanedArea += (group.clean - before) * group.area; changed.push(group);
    }
    return changed;
  };
  for (let n = 0; n < 300; n++) {
    const v = Math.floor(random() * positions.length / 3), point = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    const normal = [normals[v * 3] + (random() - .5) * .4, normals[v * 3 + 1] + (random() - .5) * .4, normals[v * 3 + 2] + (random() - .5) * .4];
    const length = Math.hypot(...normal), args = [point, normal.map((x) => x / length), .05 + random() * .2, random() < .5 ? 1.5 : .95, random() * .05];
    const a = current.paint(...args), b = original.paint(...args);
    assert.deepEqual(a.map((g) => current.groups.indexOf(g)), b.map((g) => original.groups.indexOf(g)));
  }
  assert.equal(current.cleanedArea, original.cleanedArea);
  assert.ok(current.progress > .05, `brush barely painted: ${current.progress}`);
  current.groups.forEach((g, i) => assert.equal(g.clean, original.groups[i].clean));
});

test('BVH raycasts return the same closest boss hit as brute force, before and after refit', async () => {
  const rig = await bossRig(); pose(rig, .5);
  const count = rig.mesh.geometry.attributes.position.count;
  const brute = new T.BufferGeometry(); brute.setAttribute('position', new T.BufferAttribute(new Float32Array(count * 3), 3)); brute.setIndex(rig.mesh.geometry.index);
  const fast = new T.BufferGeometry(); fast.setAttribute('position', new T.BufferAttribute(new Float32Array(count * 3), 3)); fast.setIndex(rig.mesh.geometry.index.clone());
  const material = new T.MeshBasicMaterial({ side: T.DoubleSide });
  const bruteMesh = new T.Mesh(brute, material), fastMesh = new T.Mesh(fast, material); fastMesh.raycast = acceleratedRaycast;
  const fill = () => {
    skinnedWorldPositions(rig.mesh, brute.attributes.position.array); fast.attributes.position.array.set(brute.attributes.position.array);
    for (const g of [brute, fast]) { g.computeBoundingBox(); g.computeBoundingSphere(); }
  };
  fill(); fast.boundsTree = new MeshBVH(fast);
  const indexBefore = rig.mesh.geometry.index.array.slice();
  const ray = new T.Raycaster(), box = new T.Box3(), a = new T.Vector3(), b = new T.Vector3();
  const compare = (label) => {
    box.copy(brute.boundingBox).expandByScalar(1.5);
    let hits = 0;
    for (let n = 0; n < 400; n++) {
      a.set(box.min.x + random() * (box.max.x - box.min.x), box.min.y + random() * (box.max.y - box.min.y), box.min.z + random() * (box.max.z - box.min.z));
      b.set(box.min.x + random() * (box.max.x - box.min.x), box.min.y + random() * (box.max.y - box.min.y), box.min.z + random() * (box.max.z - box.min.z));
      const direction = b.clone().sub(a), far = n % 2 ? direction.length() : .2 + random() * 1.2;
      ray.set(a, direction.normalize()); ray.far = far;
      const expected = ray.intersectObject(bruteMesh, false)[0], actual = ray.intersectObject(fastMesh, false)[0];
      assert.equal(!!actual, !!expected, `${label} ray ${n}: hit mismatch`);
      if (!expected) continue;
      hits++;
      assert.ok(Math.abs(actual.distance - expected.distance) < 1e-9, `${label} ray ${n}: distance`);
      assert.ok(actual.point.distanceTo(expected.point) < 1e-9, `${label} ray ${n}: point`);
      assert.deepEqual([actual.face.a, actual.face.b, actual.face.c].sort(), [expected.face.a, expected.face.b, expected.face.c].sort(), `${label} ray ${n}: face`);
      assert.ok(actual.face.normal.distanceTo(expected.face.normal) < 1e-6 || actual.face.normal.clone().negate().distanceTo(expected.face.normal) < 1e-6, `${label} ray ${n}: normal`);
    }
    assert.ok(hits > 60, `${label}: only ${hits} rays hit the boss`);
  };
  compare('bind pose');
  pose(rig, 1.6); fill(); fast.boundsTree.refit();
  compare('refit pose');
  assert.deepEqual(rig.mesh.geometry.index.array, indexBefore, 'rendered index must stay untouched');
});
