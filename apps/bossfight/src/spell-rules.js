import { capsulesTouch } from './combat.js';
import { STOMP, stompFront } from './stomp.js';

export const SPELLS = Object.freeze({
  yc_beam: { name: 'YC Rejection', voice: 'yc', clip: 'yc_charge', duration: 4.4, trackUntil: 2.45, strikeStart: 2.85, strikeEnd: 3.4, damage: 42, radius: 1.35 },
  claude_drop: { name: 'Claude Drop', voice: 'claude', clip: 'agent_cast', duration: 2.95, trackUntil: 0, strikeStart: 1.7, strikeEnd: 1.87, damage: 38, radius: 2.25 },
  agent_swarm: { name: 'Agent Swarm', voice: 'agents', clip: 'agent_cast', duration: 4.4, trackUntil: 0, strikeStart: 1.35, strikeEnd: 3.21, damage: 26, radius: 1.15 },
  giant_stomp: { name: 'Deadline Stomp', voice: 'deadline', clip: 'giant_stomp', duration: STOMP.duration, trackUntil: STOMP.trackUntil, strikeStart: STOMP.impact, strikeEnd: STOMP.waveEnd, damage: 32, radius: STOMP.radius, halfAngle: STOMP.halfAngle },
});
export const SWARM_OFFSETS = [[0,0],[-3,-1.8],[3,1.8],[3,-1.8],[-3,1.8],[0,3.6],[0,-3.6]];
export function swarmTargets(target, facing = 0) {
  return SWARM_OFFSETS.map(([x,z],i) => ({
    x: Math.max(-15,Math.min(15,target[0]+x*Math.cos(facing)+z*Math.sin(facing))),
    z: Math.max(-15,Math.min(15,target[2]-x*Math.sin(facing)+z*Math.cos(facing))),
    at: SPELLS.agent_swarm.strikeStart + i * .28,
  }));
}
export function spellHitbox(id,time,origin,end,target) {
  const spell=SPELLS[id]; if(!spell || time<spell.strikeStart || time>spell.strikeEnd) return null;
  if(id==='yc_beam')return {start:origin,end,radius:spell.radius};
  if(id==='claude_drop')return {start:[target[0],.05,target[2]],end:[target[0],2.1,target[2]],radius:spell.radius};
  return null;
}
export function spellVolumes(id,time,origin,end,target,ground,facing,drops=[]) {
  const spell=SPELLS[id];if(!spell || time<spell.strikeStart || time>spell.strikeEnd)return [];
  if(id==='agent_swarm')return drops.flatMap((drop,i)=>time>=drop.at&&time<=drop.at+.18?[{id:i,start:[drop.x,.05,drop.z],end:[drop.x,2,drop.z],radius:spell.radius}]:[]);
  if(id==='giant_stomp'){
    const radius=stompFront(time);
    return [{id:0,kind:'cone',origin:ground,facing,halfAngle:spell.halfAngle,inner:Math.max(0,radius-STOMP.bandWidth),outer:radius,height:1.8}];
  }
  const volume=spellHitbox(id,time,origin,end,target);return volume?[{id:0,...volume}]:[];
}
export function spellTouches(volume,hurt) {
  if(volume.kind!=='cone')return capsulesTouch(volume,hurt);
  if(Math.min(hurt.start[1],hurt.end[1])-hurt.radius>volume.height)return false;
  const dx=hurt.start[0]-volume.origin[0],dz=hurt.start[2]-volume.origin[2],distance=Math.hypot(dx,dz);
  if(distance-hurt.radius>volume.outer || distance+hurt.radius<volume.inner)return false;
  if(distance<=hurt.radius)return true;
  const angle=Math.atan2(Math.sin(Math.atan2(dx,dz)-volume.facing),Math.cos(Math.atan2(dx,dz)-volume.facing));
  return Math.abs(angle)<=volume.halfAngle+Math.asin(Math.min(1,hurt.radius/distance));
}
export const DIVE = Object.freeze({trackUntil: .95, takeoff: .60, land: 1.45, maxRange: 17});
export function diveDestination(origin,target) {
  const dx=target[0]-origin[0],dz=target[2]-origin[2],distance=Math.hypot(dx,dz),reach=Math.min(DIVE.maxRange,Math.max(0,distance-.9));
  const scale=distance>0?reach/distance:0;
  return [Math.max(-14.5,Math.min(14.5,origin[0]+dx*scale)),0,Math.max(-14.5,Math.min(14.5,origin[2]+dz*scale))];
}
