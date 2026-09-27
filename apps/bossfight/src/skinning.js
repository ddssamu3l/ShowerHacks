import * as T from 'three';

// Matches SkinnedMesh.getVertexPosition(i).applyMatrix4(mesh.matrixWorld) for every
// vertex, but builds each bone's matrix once per call instead of once per vertex.
const skinCache = new WeakMap();
function skinData(geometry) {
  const index = geometry.attributes.skinIndex, weight = geometry.attributes.skinWeight;
  let data = skinCache.get(geometry);
  if (data && data.index === index && data.weight === weight && data.indexVersion === index.version && data.weightVersion === weight.version) return data;
  const count = index.count, bones = new Uint32Array(count * 4), weights = new Float64Array(count * 4);
  for (let i = 0; i < count; i++) {
    bones[i * 4] = index.getX(i); bones[i * 4 + 1] = index.getY(i); bones[i * 4 + 2] = index.getZ(i); bones[i * 4 + 3] = index.getW(i);
    weights[i * 4] = weight.getX(i); weights[i * 4 + 1] = weight.getY(i); weights[i * 4 + 2] = weight.getZ(i); weights[i * 4 + 3] = weight.getW(i);
  }
  data = { index, weight, indexVersion: index.version, weightVersion: weight.version, bones, weights, boneMatrices: null };
  skinCache.set(geometry, data);
  return data;
}

export function canSkinFast(mesh) {
  const geometry = mesh.geometry, position = geometry.attributes.position;
  return !!(mesh.isSkinnedMesh && mesh.skeleton && geometry.attributes.skinIndex && geometry.attributes.skinWeight
    && position && !position.isInterleavedBufferAttribute && !position.normalized && position.itemSize === 3
    && !(geometry.morphAttributes.position && mesh.morphTargetInfluences));
}

// Writes world-space positions into `out` (length = vertex count * 3).
export function skinnedWorldPositions(mesh, out) {
  const skeleton = mesh.skeleton, position = mesh.geometry.attributes.position.array, count = mesh.geometry.attributes.position.count;
  const data = skinData(mesh.geometry), bones = skeleton.bones, inverses = skeleton.boneInverses;
  if (!data.boneMatrices || data.boneMatrices.length !== bones.length * 16) data.boneMatrices = new Float64Array(bones.length * 16);
  const matrices = data.boneMatrices, product = new T.Matrix4(), world = new T.Matrix4();
  for (let b = 0; b < bones.length; b++) {
    product.multiplyMatrices(bones[b].matrixWorld, inverses[b]).multiply(mesh.bindMatrix);
    matrices.set(product.elements, b * 16);
  }
  const w = world.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse).elements;
  const { bones: boneIds, weights } = data;
  for (let i = 0; i < count; i++) {
    const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    let sx = 0, sy = 0, sz = 0;
    for (let j = 0; j < 4; j++) {
      const weight = weights[i * 4 + j];
      if (weight === 0) continue;
      const e = boneIds[i * 4 + j] * 16;
      sx += weight * (matrices[e] * x + matrices[e + 4] * y + matrices[e + 8] * z + matrices[e + 12]);
      sy += weight * (matrices[e + 1] * x + matrices[e + 5] * y + matrices[e + 9] * z + matrices[e + 13]);
      sz += weight * (matrices[e + 2] * x + matrices[e + 6] * y + matrices[e + 10] * z + matrices[e + 14]);
    }
    const inv = 1 / (w[3] * sx + w[7] * sy + w[11] * sz + w[15]);
    out[i * 3] = (w[0] * sx + w[4] * sy + w[8] * sz + w[12]) * inv;
    out[i * 3 + 1] = (w[1] * sx + w[5] * sy + w[9] * sz + w[13]) * inv;
    out[i * 3 + 2] = (w[2] * sx + w[6] * sy + w[10] * sz + w[14]) * inv;
  }
  return out;
}
