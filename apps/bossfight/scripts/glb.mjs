import { readFile, writeFile } from 'node:fs/promises';
import { Bone, Group, Object3D, Matrix4 } from 'three';

export function accessorValues(json, bin, index) {
  const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type];
  const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  return Array.from({ length: accessor.count * components }, (_, index) => {
    const offset = start + Math.floor(index / components) * (view.byteStride || components * size) + index % components * size;
    return accessor.componentType === 5126 ? bin.readFloatLE(offset) : bin.readUIntLE(offset, size);
  });
}

export function meshFloorProbe(json, bin, nodes) {
  const attributes = json.meshes[0].primitives[0].attributes;
  const positions = accessorValues(json, bin, attributes.POSITION);
  const weights = accessorValues(json, bin, attributes.WEIGHTS_0);
  const joints = accessorValues(json, bin, attributes.JOINTS_0);
  const bind = accessorValues(json, bin, json.skins[0].inverseBindMatrices);
  const inverse = json.skins[0].joints.map((_, i) => new Matrix4().fromArray(bind, i * 16));
  return () => {
    const matrices = json.skins[0].joints.map((node, i) => nodes[node].matrixWorld.clone().multiply(inverse[i]).elements);
    let min = Infinity;
    for (let vertex = 0; vertex < positions.length / 3; vertex++) {
      const x = positions[vertex * 3], y = positions[vertex * 3 + 1], z = positions[vertex * 3 + 2];
      let height = 0;
      for (let k = 0; k < 4; k++) {
        const weight = weights[vertex * 4 + k]; if (!weight) continue;
        const m = matrices[joints[vertex * 4 + k]];
        height += weight * (m[1] * x + m[5] * y + m[9] * z + m[13]);
      }
      min = Math.min(min, height);
    }
    return min;
  };
}

export async function readGlb(path) {
  const file = await readFile(path);
  if (file.toString('utf8', 0, 4) !== 'glTF' || file.readUInt32LE(4) !== 2) throw new Error('Expected GLB 2.0');
  const length = file.readUInt32LE(12);
  const json = JSON.parse(file.toString('utf8', 20, 20 + length));
  return { json, bin: file.subarray(28 + length, 28 + length + file.readUInt32LE(20 + length)) };
}
export function skeletonScene(json) {
  const joints = new Set(json.skins.flatMap((s) => s.joints));
  const nodes = json.nodes.map((node, i) => {
    const object = joints.has(i) ? new Bone() : new Object3D();
    object.name = node.name || `node_${i}`;
    object.position.fromArray(node.translation || [0, 0, 0]);
    object.quaternion.fromArray(node.rotation || [0, 0, 0, 1]);
    object.scale.fromArray(node.scale || [1, 1, 1]);
    object.userData.nodeIndex = i;
    return object;
  });
  json.nodes.forEach((node, i) => node.children?.forEach((child) => nodes[i].add(nodes[child])));
  const root = new Group();
  for (const index of json.scenes[json.scene || 0].nodes) root.add(nodes[index]);
  root.updateMatrixWorld(true);
  const position = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  return { root, nodes, height: position.max[1] - position.min[1] };
}
export async function writeGlb(path, json, binary) {
  const string = Buffer.from(JSON.stringify(json));
  const j = Buffer.alloc(Math.ceil(string.length / 4) * 4, 32); string.copy(j);
  const b = Buffer.alloc(Math.ceil(binary.length / 4) * 4); binary.copy(b);
  const header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + j.length + b.length, 8); header.writeUInt32LE(j.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  await writeFile(path, Buffer.concat([header, j, bh, b]));
}
