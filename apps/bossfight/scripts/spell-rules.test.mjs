import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELLS, swarmTargets, spellVolumes, spellTouches, DIVE, diveDestination } from '../src/spell-rules.js';
import { CombatState } from '../src/combat.js';
import { Scene, Vector3 } from 'three';
import { BossSpells } from '../src/boss-spells.js';
const hurt=(x,z)=>({start:[x,.3,z],end:[x,1.53,z],radius:.3});
const volumes=(id,time,drops=[])=>spellVolumes(id,time,[0,2,0],[0,.8,25],[0,0,7],[0,0,0],0,drops);
test('Agent Swarm has seven distinct committed sites and staggered finite damage windows',()=>{
 const drops=swarmTargets([0,0,7]);assert.equal(drops.length,7);assert.equal(new Set(drops.map(d=>`${d.x},${d.z}`)).size,7);
 for(const [i,d]of drops.entries()){
  assert.equal(volumes('agent_swarm',d.at-.001,drops).some(v=>v.id===i),false);
  const v=volumes('agent_swarm',d.at+.09,drops).find(v=>v.id===i);assert.ok(v);
  assert.equal(spellTouches(v,hurt(d.x,d.z)),true);assert.equal(spellTouches(v,hurt(d.x+2,d.z)),false);
  assert.equal(volumes('agent_swarm',d.at+.181,drops).some(v=>v.id===i),false);
 }
 assert.deepEqual(volumes('agent_swarm',4.4,drops),[]);
});
test('stomp wave only hurts within its advancing forward cone, not behind or across the whole floor',()=>{
 assert.deepEqual(volumes('giant_stomp',1.079),[]);assert.deepEqual(volumes('giant_stomp',1.581),[]);
 const [v]=volumes('giant_stomp',1.33);assert.ok(spellTouches(v,hurt(0,4.8)));
 for(const [x,z]of [[0,-5],[5,0],[0,12],[0,1]])assert.equal(spellTouches(v,hurt(x,z)),false);
 const fight=new CombatState();fight.roll([0,1]);assert.equal(fight.hit('stomp',32),false);
});
test('YC has a long tracking charge, a committed dodge window, and a wide finite blast',()=>{
 const s=SPELLS.yc_beam;assert.ok(s.trackUntil>=2.4);assert.ok(s.strikeStart-s.trackUntil>=.39);
 assert.deepEqual(volumes('yc_beam',s.strikeStart-.01),[]);
 const [beam]=volumes('yc_beam',3);assert.equal(beam.radius,1.35);
 assert.ok(spellTouches(beam,hurt(1.25,12)));assert.equal(spellTouches(beam,hurt(3,12)),false);
 assert.deepEqual(volumes('yc_beam',s.strikeEnd+.01),[]);
});
test('Superman can cross most of the stall but locks its destination before landing',()=>{
 const close=diveDestination([0,0,0],[0,0,13]);assert.ok(close[2]>12);
 const far=diveDestination([-10,0,-10],[16,0,16]);assert.ok(Math.hypot(far[0]+10,far[2]+10)<=DIVE.maxRange+.001);
 assert.ok(DIVE.land-DIVE.trackUntil>=.49);
 const updated=diveDestination([0,0,0],[7,0,12]);assert.ok(updated[0]>6);
});
test('spell presentation follows cast targets, freezes YC aim at commitment and resets every effect',()=>{
 const scene=new Scene(),spells=new BossSpells(scene),origin=new Vector3(0,2.5,0),ground=new Vector3();
 spells.begin('yc_beam',new Vector3(0,0,7));
 spells.update(1.5,origin,0,new Vector3(3,0,9),ground);assert.equal(spells.target.x,3);
 spells.update(2.5,origin,0,new Vector3(-4,0,9),ground);assert.equal(spells.target.x,3);assert.equal(spells.guide.visible,true);
 spells.update(3,origin,0,new Vector3(-4,0,9),ground);assert.equal(spells.beam.visible,true);assert.equal(spells.guide.visible,false);
 for(const id of Object.keys(SPELLS)){
  spells.begin(id,new Vector3(0,0,7),.2);
  for(let time=0;time<SPELLS[id].duration;time+=1/30){
   spells.update(time,origin,.2,new Vector3(1,0,8),ground);
   scene.updateMatrixWorld(true);scene.traverse(object=>assert.ok(object.matrixWorld.elements.every(Number.isFinite),`${id}: invalid transform`));
  }
 }
 spells.updateDive(new Vector3(5,0,5),.8);assert.equal(spells.diveArea.visible,true);
 spells.clear();assert.equal(spells.group.visible,false);assert.equal(spells.diveArea.visible,false);assert.deepEqual(spells.hitboxes(3),[]);
});
