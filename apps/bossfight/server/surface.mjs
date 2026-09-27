import { readGlb, accessorValues } from '../scripts/glb.mjs';

// The boss's rest-pose surface, read from the same model the browser loads, so
// cleaning group indices match between the server and every client.
export async function loadBossSurface(url = new URL('../public/models/boss-animated.glb', import.meta.url)) {
  const { json, bin } = await readGlb(url);
  const primitive = json.meshes[0].primitives[0];
  return {
    positions: new Float32Array(accessorValues(json, bin, primitive.attributes.POSITION)),
    normals: new Float32Array(accessorValues(json, bin, primitive.attributes.NORMAL)),
    indices: new Uint32Array(accessorValues(json, bin, primitive.indices)),
  };
}
