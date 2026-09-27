import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { STOMP, stompContact, stompPose, stompFront } from '../src/stomp.js';
import { STOMP_SPIKES, StompRocks, spikeState } from '../src/stomp-effects.js';
import { BossSpells } from '../src/boss-spells.js';
import { CLIPS } from '../src/motion.js';
import { ATTACKS } from '../src/combat.js';
import { readGlb, skeletonScene, accessorValues } from './glb.mjs';

test('stomp chambers before an accelerating strike, compresses after contact, then recovers',()=>{
  assert.equal(stompPose(.8).strike,0);assert.equal(stompPose(STOMP.impact).strike,1);
  assert.ok(stompPose(1.02).strike-stompPose(.99).strike>stompPose(.93).strike-stompPose(.90).strike);
  assert.ok(stompPose(1.16).compression>stompPose(STOMP.impact).compression);
  assert.equal(stompPose(1.5).planted,1);assert.equal(stompPose(STOMP.duration).recover,1);
});
test('rock eruptions follow the damaging wave and stay inside the marked cone',()=>{
  assert.equal(STOMP_SPIKES.length,39);
  for(const spike of STOMP_SPIKES){
    assert.ok(spike.radius+spike.width*1.1<STOMP.radius);
    assert.ok(Math.abs(spike.angle)+Math.asin(spike.width*1.1/spike.radius)<STOMP.halfAngle);
    assert.equal(spikeState(spike,spike.at-.001).visible,false);
    assert.ok(stompFront(spike.at)>=spike.radius-.00001);
    assert.ok(spikeState(spike,spike.at+.06).rise>.99);
    assert.equal(spikeState(spike,STOMP.duration).visible,false);
  }
});
test('rocks and debris are deterministic when scrubbed, finite, and cleared on restart',()=>{
  const fx=new StompRocks(new Group()),origin=new Vector3(3,0,4);
  fx.update(1.4,origin,.4);const snapshot=fx.gravel.instanceMatrix.array.slice();
  fx.update(2.2,origin,.4);fx.update(1.4,origin,.4);assert.deepEqual(fx.gravel.instanceMatrix.array,snapshot);
  for(let t=0;t<=2.6;t+=1/60){fx.update(t,origin,.4);for(const mesh of [fx.spikes,fx.gravel,fx.dust])assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));}
  fx.reset();assert.equal(fx.group.visible,false);
});
test('stomp warning, rocks and hit volume share a committed landing point',()=>{
  const spells=new BossSpells(new Group()),origin=new Vector3(0,2,0),target=new Vector3(0,0,7),ground=new Vector3(-.5,0,1);
  spells.begin('giant_stomp',target);spells.update(.4,origin,.2,target,ground);
  spells.update(.66,origin,.3,target,ground);
  spells.update(1.3,origin,1.5,target,new Vector3(9,0,9));
  assert.deepEqual(spells.ground.toArray(),ground.toArray());assert.equal(spells.facing,.3);
  assert.deepEqual(spells.hitboxes(1.3)[0].origin,ground.toArray());assert.deepEqual(spells.stompRocks.group.position.toArray(),ground.toArray());
  spells.clear();assert.equal(spells.stompRocks.group.visible,false);
});
test('belly flop is absent from playable attacks and both exported boss libraries',async()=>{
  assert.equal(CLIPS.boss.some(c=>c.id==='belly_flop'),false);assert.equal(ATTACKS.belly_flop,undefined);
  for(const file of ['boss','boss_clean']){
    const {json,bin}=await readGlb(new URL(`../public/models/${file}-animated.glb`,import.meta.url));
    assert.equal(json.animations.some(a=>a.name==='belly_flop'),false);
    const {root,nodes,height}=skeletonScene(json),bones=Object.fromEntries(nodes.filter(n=>n.isBone).map(n=>[n.name.replace(/[^a-zA-Z]/g,'').replace(/^mixamorig/,''),n]));
    const p=name=>bones[name].getWorldPosition(new Vector3());
    const contact=stompContact(p('RightFoot').toArray(),height),clip=json.animations.find(a=>a.name==='giant_stomp');
    const channels=clip.channels.map(c=>({...c,values:accessorValues(json,bin,clip.samplers[c.sampler].output)}));
    const sample=time=>{const i=Math.round(time*60);for(const c of channels)if(c.target.path==='rotation')nodes[c.target.node].quaternion.fromArray(c.values,i*4);else nodes[c.target.node].position.fromArray(c.values,i*3);root.updateMatrixWorld(true);};
    sample(.72);assert.ok(p('RightFoot').y/height>.31,'knee chamber must be high and readable');
    for(const t of [1.10,1.25,1.5,1.7]){
      sample(t);assert.ok(Math.abs(p('RightFoot').x-contact[0])<.001);assert.ok(Math.abs(p('RightFoot').z-contact[2])<.001,'striking foot remains planted at its warning marker');
    }
  }
});
