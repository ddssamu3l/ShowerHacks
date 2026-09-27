import * as T from 'three';
import { SPELLS, swarmTargets, spellVolumes } from './spell-rules.js';
import { STOMP, stompFront } from './stomp.js';
import { StompRocks } from './stomp-effects.js';
export { SPELLS, spellHitbox } from './spell-rules.js';
const up=new T.Vector3(0,1,0), clamp=T.MathUtils.clamp;
const glow=color=>new T.MeshBasicMaterial({color,transparent:true,opacity:.8,depthWrite:false,side:T.DoubleSide,toneMapped:false});
function groundArea(radius,color) {
  const group=new T.Group();
  for(const r of [radius,radius*.87]){const ring=new T.Mesh(new T.RingGeometry(r-.035,r,64),glow(color));ring.rotation.x=-Math.PI/2;group.add(ring);}
  const disc=new T.Mesh(new T.CircleGeometry(radius,64),glow(color));disc.material.opacity=.11;disc.rotation.x=-Math.PI/2;group.add(disc);return group;
}
function sector(radius,halfAngle) {
  const points=[0,0,0],indices=[];
  for(let i=0;i<=48;i++){const angle=-halfAngle+i/48*halfAngle*2;points.push(Math.sin(angle)*radius,0,Math.cos(angle)*radius);if(i)indices.push(0,i,i+1);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function agentBody() {
  const group=new T.Group(),shell=new T.MeshStandardMaterial({color:0x293b49,metalness:.6,roughness:.3,emissive:0x174655,emissiveIntensity:.4});
  const head=new T.Mesh(new T.BoxGeometry(.86,.66,.6),shell);head.position.y=.74;group.add(head);
  const body=new T.Mesh(new T.BoxGeometry(.66,.5,.45),shell);body.position.y=.13;group.add(body);
  const face=new T.Mesh(new T.BoxGeometry(.73,.39,.025),new T.MeshBasicMaterial({color:0x071112}));face.position.set(0,.75,.32);group.add(face);
  for(const sign of [-1,1]){
    const eye=new T.Mesh(new T.BoxGeometry(.13,.10,.045),glow(0x8bffe2));eye.position.set(sign*.18,.76,.35);group.add(eye);
    const arm=new T.Mesh(new T.BoxGeometry(.18,.58,.21),shell);arm.position.set(sign*.53,.17,0);arm.rotation.z=-sign*.2;group.add(arm);
    const leg=new T.Mesh(new T.BoxGeometry(.20,.37,.25),shell);leg.position.set(sign*.20,-.28,0);group.add(leg);
  }
  const antenna=new T.Mesh(new T.CylinderGeometry(.035,.035,.25,6),shell);antenna.position.y=1.18;group.add(antenna);
  const bulb=new T.Mesh(new T.SphereGeometry(.09,8,6),glow(0x8bffe2));bulb.position.y=1.34;group.add(bulb);
  return group;
}
export class BossSpells {
  constructor(scene){
    this.group=new T.Group();scene.add(this.group);this.group.visible=false;this.type=null;
    this.origin=new T.Vector3();this.end=new T.Vector3();this.target=new T.Vector3();this.ground=new T.Vector3();this.drops=[];this.facing=0;
    const cylinder=new T.CylinderGeometry(1,1,1,32,1,true);
    this.beam=new T.Mesh(cylinder,glow(0xff5811));this.core=new T.Mesh(cylinder,glow(0xffebac));this.group.add(this.beam,this.core);
    this.orb=new T.Mesh(new T.IcosahedronGeometry(1,3),glow(0xffa143));this.group.add(this.orb);
    this.halos=Array.from({length:3},(_,i)=>{const mesh=new T.Mesh(new T.TorusGeometry(1,.025+i*.008,6,64),glow(0xffa35e));this.group.add(mesh);return mesh;});
    this.chargeRays=new T.Group();this.group.add(this.chargeRays);
    for(let i=0;i<16;i++){const ray=new T.Mesh(new T.ConeGeometry(.045,.6,5),glow(0xffc46e));this.chargeRays.add(ray);}
    this.guide=new T.Mesh(new T.PlaneGeometry(1,1),glow(0xff793e));this.guide.rotation.x=-Math.PI/2;this.group.add(this.guide);
    this.area=groundArea(2.25,0xf99b66);this.group.add(this.area);
    this.mark=new T.Group();this.group.add(this.mark);
    const material=new T.MeshStandardMaterial({color:0xde805d,emissive:0xc85120,emissiveIntensity:1,roughness:.6});
    for(let i=0;i<12;i++){const theta=i/12*Math.PI*2,length=1.05+.12*Math.sin(i*2.3);const spoke=new T.Mesh(new T.BoxGeometry(.22,length,.32),material);spoke.position.set(Math.sin(theta)*length*.43,Math.cos(theta)*length*.43,0);spoke.rotation.z=-theta;this.mark.add(spoke);}
    this.agents=Array.from({length:7},()=>{const body=agentBody(),area=groundArea(SPELLS.agent_swarm.radius,0x69edcf),trail=new T.Mesh(cylinder,glow(0x73ffdb));this.group.add(body,area,trail);return{body,area,trail};});
    this.cone=new T.Mesh(sector(10,SPELLS.giant_stomp.halfAngle),glow(0xffb670));this.cone.position.y=.045;this.group.add(this.cone);
    this.wave=new T.Mesh(new T.TorusGeometry(1,.065,6,64,2*SPELLS.giant_stomp.halfAngle),glow(0xffd4a6));this.group.add(this.wave);
    this.light=new T.PointLight(0xff8c40,0,18,2);this.group.add(this.light);
    this.diveArea=groundArea(2,0xff9d63);scene.add(this.diveArea);this.diveArea.visible=false;
    this.stompRocks=new StompRocks(this.group);this.stompLocked=false;
  }
  begin(type,target,facing=0){this.clear();this.type=type;this.target.copy(target).setY(.9);this.facing=facing;this.drops=type==='agent_swarm'?swarmTargets(target.toArray(),facing):[];this.group.visible=true;}
  clear(){this.type=null;this.group.visible=false;this.diveArea.visible=false;this.stompLocked=false;this.stompRocks.reset();}
  updateDive(target,time){this.diveArea.visible=time<1.65;this.diveArea.position.copy(target).setY(.055);this.diveArea.scale.setScalar(time>1.45?1+(time-1.45)*3:1);this.diveArea.children.forEach(m=>m.material.opacity=time<.95?.3:time<1.45?.7:Math.max(0,(1.65-time)*3));}
  update(time,origin,facing,player,ground){
    if(!this.type)return;const spell=SPELLS[this.type],firing=time>=spell.strikeStart&&time<=spell.strikeEnd,beam=this.type==='yc_beam';
    this.origin.copy(origin);
    if(this.type!=='giant_stomp'||!this.stompLocked){this.ground.copy(ground);this.facing=facing;}
    if(this.type==='giant_stomp'&&time>=STOMP.trackUntil)this.stompLocked=true;
    if(beam&&time<spell.trackUntil)this.target.copy(player).setY(.9);
    this.beam.visible=this.core.visible=beam&&firing;this.orb.visible=beam&&time<spell.strikeEnd;this.chargeRays.visible=beam&&time<spell.strikeStart;
    this.halos.forEach(h=>h.visible=beam&&time<spell.strikeEnd);this.area.visible=this.mark.visible=this.type==='claude_drop';
    this.guide.visible=beam&&time<spell.strikeStart;this.cone.visible=this.type==='giant_stomp'&&time<spell.strikeEnd;this.wave.visible=this.type==='giant_stomp'&&firing;
    this.agents.forEach(a=>a.body.visible=a.area.visible=a.trail.visible=this.type==='agent_swarm');
    this.light.position.copy(origin);this.light.intensity=beam?(firing?18:time<spell.strikeStart?time*3:0):0;
    const charge=clamp(time/spell.strikeStart,0,1),pulse=1+.035*Math.sin(time*55);
    this.orb.position.copy(origin);this.orb.scale.setScalar((.16+charge*1.12)*pulse);
    for(const [i,halo]of this.halos.entries()){halo.position.copy(origin);halo.scale.setScalar((.4+charge*1.25)*(1+i*.25));halo.rotation.set(time*(2+i),time*(3-i),i);}
    this.chargeRays.position.copy(origin);
    this.chargeRays.children.forEach((ray,i)=>{const a=i*2.4+time,r=1.4+((i*.31-time*1.7)%1+1)%1*1.5;ray.position.set(Math.cos(a)*r,Math.sin(a*1.3)*r,Math.sin(a)*r);ray.quaternion.setFromUnitVectors(up,ray.position.clone().negate().normalize());ray.scale.y=.5+charge;});
    const direction=this.target.clone().sub(origin).normalize();let length=32;
    if(direction.y<-.01)length=Math.min(length,(origin.y-.08)/-direction.y+1.0);
    this.end.copy(origin).addScaledVector(direction,Math.max(.1,length));
    const middle=origin.clone().lerp(this.end,.5),rotation=new T.Quaternion().setFromUnitVectors(up,direction);
    for(const [mesh,r]of [[this.beam,spell.radius??1.35],[this.core,.65]]){mesh.position.copy(middle);mesh.quaternion.copy(rotation);mesh.scale.set(r*pulse,length,r*pulse);}
    const groundLength=Math.hypot(this.end.x-origin.x,this.end.z-origin.z);this.guide.position.set(middle.x,.06,middle.z);this.guide.rotation.set(-Math.PI/2,0,-Math.atan2(direction.x,direction.z));this.guide.scale.set(SPELLS.yc_beam.radius*2,groundLength,1);this.guide.material.opacity=time<spell.trackUntil?.10:.24+Math.sin(time*30)*.08;
    if(this.type==='claude_drop'){
      this.area.position.set(this.target.x,.06,this.target.z);this.area.scale.setScalar(1);const fall=clamp((time-1.02)/.68,0,1);
      this.mark.position.set(T.MathUtils.lerp(origin.x,this.target.x,fall),T.MathUtils.lerp(origin.y+3.5,.3,fall*fall),T.MathUtils.lerp(origin.z,this.target.z,fall));this.mark.rotation.set(-Math.PI*.12*fall,facing,Math.sin(time*3)*.08);
      const fade=time>spell.strikeEnd?Math.max(0,1-(time-spell.strikeEnd)/.35):1;this.mark.scale.setScalar(fade);if(!fade)this.area.visible=false;
    }
    if(this.type==='agent_swarm')for(const [i,a]of this.agents.entries()){
      const drop=this.drops[i],fall=clamp((time-(drop.at-.65))/.65,0,1),after=time-drop.at,fade=clamp(1-after/.48,0,1);
      a.area.position.set(drop.x,.06,drop.z);a.area.scale.setScalar(after>0?1+after*2:1);a.area.visible=after<.48;
      a.area.children.forEach((m,j)=>m.material.opacity=(j===2?.10:.65)*fade*(.8+.2*Math.sin(time*12)));
      a.body.visible=fall>0&&after<.48;a.body.position.set(drop.x,.55+(1-fall*fall)*10,drop.z);a.body.rotation.set(-.12,facing+Math.sin(i)*.8,Math.sin(time*6+i)*.05);a.body.scale.setScalar(after>0?fade:1);
      a.trail.visible=fall>0&&fall<1;a.trail.position.copy(a.body.position).add(new T.Vector3(0,2,0));a.trail.scale.set(.10,3,.10);
    }
    if(this.type==='giant_stomp'){
      this.cone.position.copy(this.ground).setY(.065);this.cone.rotation.y=this.facing;this.cone.material.opacity=firing?.045:.07+charge*.10;
      const r=stompFront(time);
      this.wave.position.copy(this.ground).setY(.12);this.wave.rotation.set(Math.PI/2,0,Math.PI/2-spell.halfAngle-this.facing);this.wave.scale.setScalar(r);this.wave.material.opacity=.35;
      this.stompRocks.update(time,this.ground,this.facing);
    }
  }
  hitboxes(time){return spellVolumes(this.type,time,this.origin.toArray(),this.end.toArray(),this.target.toArray(),this.ground.toArray(),this.facing,this.drops);}
}
