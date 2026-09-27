import test from 'node:test';
import assert from 'node:assert/strict';
import { CleaningSurface, waterPoint } from '../src/cleaning.js';
import { readGlb, accessorValues } from './glb.mjs';
import { readFile } from 'node:fs/promises';
const p=new Float32Array([0,0,0,1,0,0,0,1,0,0,0,0,0,0,2,0,2,0]);
const n=new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1]);
const surface=()=>new CleaningSurface(p,n,new Uint16Array([0,1,2,3,4,5]));
test('cleaning is gradual, local, welded across seams, and refuses back-facing surfaces',()=>{
 const s=surface();const changed=s.paint([0,0,0],[0,0,1],.1,1,.1);assert.equal(changed.length,1);assert.equal(s.groups[0].vertices.length,2);assert.equal(s.groups[0].clean,.1);assert.ok(s.progress>0&&s.progress<.1);assert.equal(s.groups[3].clean,0);
});
test('exposure is frame-rate independent and repeated clean patches stop scoring',()=>{
 const a=surface(),b=surface();for(let i=0;i<60;i++)a.paint([0,0,0],[0,0,1],3,.3,1/60);for(let i=0;i<20;i++)b.paint([0,0,0],[0,0,1],3,.3,1/20);assert.ok(Math.abs(a.progress-b.progress)<1e-9);
 for(let i=0;i<20;i++)a.paint([0,0,0],[0,0,1],3,1,1);const before=a.progress;a.paint([0,0,0],[0,0,1],3,1,1);assert.equal(a.progress,before);
});
test('surface area determines the score, 90% triggers a win, reset removes progress',()=>{
 const s=surface();assert.ok(Math.abs(s.totalArea-2.5)<1e-9);
 s.paint([0,0,0],[0,0,1],10,10,1);assert.ok(s.progress<.9);assert.equal(s.won,false);s.paint([0,0,0],[0,0,-1],10,10,1);assert.ok(Math.abs(s.progress-1)<1e-9);assert.equal(s.won,true);s.reset();assert.equal(s.progress,0);assert.equal(s.won,false);
});
test('invalid exposure cannot corrupt progress',()=>{const s=surface();assert.deepEqual(s.paint([NaN,0,0],[0,0,1],1,1,.1),[]);assert.equal(s.progress,0);});
test('Stink Meter starts full, falls with area cleaned, and resets to full',()=>{const s=surface();assert.equal(s.stink,1);s.paint([0,0,0],[0,0,1],3,.3,1);assert.ok(s.stink<1);assert.equal(s.stink,1-s.progress);s.cleanedArea=.9*s.totalArea;assert.ok(s.stink<=.1+.00001);assert.ok(s.won);s.reset();assert.equal(s.stink,1);});
test('water follows gravity continuously instead of a straight ray',()=>{assert.deepEqual(waterPoint([0,1,0],[0,0,10],5,0),[0,1,0]);assert.deepEqual(waterPoint([0,1,0],[0,0,10],5,.5),[0,.375,5]);});
test('clean transfer has one finite target per dirty vertex and a usable optimized nozzle',async()=>{
 const root=new URL('../public/models/',import.meta.url);const {json,bin}=await readGlb(new URL('boss.glb',root));const count=json.accessors[json.meshes[0].primitives[0].attributes.POSITION].count;const buffer=await readFile(new URL('clean-surface.bin',root));assert.equal(buffer.byteLength,count*6*4);const targets=new Float32Array(buffer.buffer,buffer.byteOffset,buffer.byteLength/4);assert.ok(targets.every(Number.isFinite));const targetPositions=targets.filter((_,i)=>i%6<3);assert.ok(Math.max(...targetPositions)<2);
 const nozzle=await readGlb(new URL('nozzle.glb',root));const tris=nozzle.json.accessors[nozzle.json.meshes[0].primitives[0].indices].count/3;assert.ok(tris<30000);const original=accessorValues(json,bin,json.meshes[0].primitives[0].attributes.POSITION);assert.equal(original.length,count*3);
});

test('unbranded clean outfit removes textured garment logos without changing the rig or topology', async () => {
 const root = new URL('../public/models/', import.meta.url);
 const source = await readGlb(new URL('boss_clean.glb', root));
 const clean = await readGlb(new URL('boss_clean-unbranded.glb', root));
 assert.deepEqual(clean.json.skins, source.json.skins);
 assert.deepEqual(clean.json.nodes, source.json.nodes);
 assert.deepEqual(clean.bin.subarray(0, source.bin.length), source.bin);
 const original = source.json.meshes[0].primitives[0];
 const primitiveFaces = primitive => {
  const indices = accessorValues(clean.json, clean.bin, primitive.indices);
  return Array.from({ length: indices.length / 3 }, (_, i) => indices.slice(i * 3, i * 3 + 3).join(','));
 };
 const sourceIndices = accessorValues(source.json, source.bin, original.indices);
 const originalFaces = Array.from({ length: sourceIndices.length / 3 }, (_, i) => sourceIndices.slice(i * 3, i * 3 + 3).join(','));
 assert.deepEqual(clean.json.meshes[0].primitives.flatMap(primitiveFaces).sort(), originalFaces.sort());
 const roles = new Set();
 for (const primitive of clean.json.meshes[0].primitives) {
  assert.deepEqual(primitive.attributes, original.attributes);
  const material = clean.json.materials[primitive.material];
  roles.add(material.extras.surfaceRole);
  if (material.extras.surfaceRole === 'skin-hair') {
   assert.deepEqual(material.pbrMetallicRoughness, source.json.materials[0].pbrMetallicRoughness);
  } else {
   assert.equal(material.extras.unbranded, true);
   assert.equal(material.pbrMetallicRoughness.baseColorTexture, undefined);
   assert.equal(material.pbrMetallicRoughness.metallicRoughnessTexture, undefined);
   assert.equal(material.normalTexture, undefined);
  }
 }
 for (const role of ['skin-hair', 'shirt', 'outerwear', 'trousers', 'shoes', 'wrist-strap']) assert.ok(roles.has(role));
 const transfer = JSON.parse(await readFile(new URL('clean-transfer.json', root), 'utf8'));
 assert.equal(transfer.source, 'boss_clean-unbranded.glb');
 assert.equal(transfer.alphaChannel, 'clean material roughness');
});
