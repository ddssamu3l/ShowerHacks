import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CLIPS } from './motion.js';
import { CombatState, ATTACKS, PLAYER_COMBAT, capsulesTouch } from './combat.js';
import { BossSurface } from './boss-surface.js';
import { Water, traceWater, HOSE } from './water.js';
import { WaterReserve, BottleSupply, WATER_RULES } from './water-supply.js';
import { BottlePickups } from './bottle-pickups.js';
import { BossSpells, SPELLS } from './boss-spells.js';
import { spellTouches, DIVE, diveDestination } from './spell-rules.js';
import { BossAudio } from './boss-audio.js';
import { PlayerVoice } from './player-voice.js';
import { BOSS_WALK, walkContacts, walkCyclesForDistance } from './boss-walk.js';
import { Footfalls, playFootfall, playStompImpact } from './footfalls.js';
import { stompContact } from './stomp.js';
import { makeArena } from './arena.js';
import { createParty } from './party-ui.js';
import { RemotePlayers } from './remote-players.js';
import { BossBrain } from './boss-brain.js';
import { CoopBoss } from './coop-boss.js';

const $=id=>document.getElementById(id), canvas=$('game');
const MAX_PIXEL_RATIO=Math.min(devicePixelRatio,1.6);let pixelRatio=MAX_PIXEL_RATIO;
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(pixelRatio);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(58,innerWidth/innerHeight,.08,130);const arena=makeArena(scene,renderer),water=new Water(scene);
const fight=new CombatState(),keys=new Set(),buttons=new Set();
const spells = new BossSpells(scene), footfalls = new Footfalls(scene);
const brain = new BossBrain();
const diveTarget = new T.Vector3();
const reserve = new WaterReserve(), bottles = new BottleSupply(), pickups = new BottlePickups(scene, bottles);
let streamTrace = null, streamVelocity = new T.Vector3(), streamMode = null, lowWaterNotified = false, emptyWaterNotified = false, refillFlash = 0;
const pos=new T.Vector3(-3,0,6),rollOrigin=new T.Vector3(),knockOrigin=new T.Vector3(),knockDirection=new T.Vector3();
const forward=new T.Vector3(),right=new T.Vector3(),move=new T.Vector3(),aim=new T.Vector3(),emitter=new T.Vector3();
let player,boss,surface,nozzle,phase='loading',time=0,last=performance.now(),yaw=Math.PI,pitch=.07,lockOn=false,lastState='ready',washClock=0,flash=0,toastUntil=0,hitUntil=0,mode='shower',loaded=false,autoWater=null,practice=false;
let bossState='turn',bossTime=0,bossFacing=0,attack='giant_stomp',attackCount=0,attackStart=new T.Vector3(),lastAttack='',impactDone=new Set(),previousHitboxes=new Map();
let cameraShake=0,audio=null,waterGain=null,audioMaster=null,soundtrack=null,playerVoice=null,muted=false,masterVolume=.7;
let party=null,remotes=null,coop=false,stateClock=0,coopStink=1,coopSeconds=0,coopShares=null,spectating=false,pendingBottle=null,stroke=null;const coopBoss=new CoopBoss();const lastPose={id:'ready',t:0},SPAWN_OFFSETS=[0,-2.4,2.4];
const ring=new T.Mesh(new T.RingGeometry(1.5,1.52,80),new T.MeshBasicMaterial({color:0xd8eeb0,transparent:true,opacity:.4,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.04;scene.add(ring);
const impactRing=new T.Mesh(new T.RingGeometry(.97,1,80),new T.MeshBasicMaterial({color:0xd9eee1,transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}));impactRing.rotation.x=-Math.PI/2;impactRing.position.y=.055;scene.add(impactRing);let impactLife=0;
const loader=new GLTFLoader();
const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp,smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const duration=id=>SPELLS[id]?.duration ?? CLIPS.boss.find(c=>c.id===id).duration;
function instantiateCharacter(root,animations,height){
  const group=new T.Group();group.add(root);scene.add(group);const bones={};let mesh;
  root.traverse(o=>{if(o.isBone)bones[o.name.replace(/[^a-zA-Z0-9]/g,'').replace(/^mixamorig/,'')]=o;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;mesh=o;}});
  group.updateMatrixWorld(true);const contact=new T.Vector3().fromArray(stompContact(group.worldToLocal(bones.RightFoot.getWorldPosition(new T.Vector3())).toArray(),height));
  const mixer=new T.AnimationMixer(root);return{gltf:{scene:root,animations},group,mixer,bones,mesh,scale:root.scale.x,stompContact:contact,actions:new Map(),active:null};
}
async function loadCharacter(file,height){
  const gltf=await loader.loadAsync(`/models/${file}-animated.glb`);const bounds=new T.Box3().setFromObject(gltf.scene),scale=height/(bounds.max.y-bounds.min.y);gltf.scene.scale.setScalar(scale);
  return{...instantiateCharacter(gltf.scene,gltf.animations,height),gltf};
}
function pose(model,id,t,blendDt=0){
  let action=model.actions.get(id);
  if(!action){const clip=model.gltf.animations.find(c=>c.name===id);if(!clip)throw Error(`Missing ${id}`);action=model.mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;model.actions.set(id,action);}
  if(model.active!==action){model.blend=blendDt>0&&model.active?{age:0,bones:Object.values(model.bones).map(b=>({b,q:b.quaternion.clone(),p:b.position.clone()}))}:null;model.mixer.stopAllAction();action.reset().play();action.paused=true;model.active=action;}
  action.enabled=true;action.time=clamp(t,0,action.getClip().duration);model.mixer.update(0);
  if(blendDt<=0)model.blend=null;
  if(model.blend){
    model.blend.age+=blendDt;const weight=smooth(model.blend.age/.16);
    for(const {b,q,p}of model.blend.bones){b.quaternion.slerpQuaternions(q,b.quaternion.clone(),weight);b.position.lerpVectors(p,b.position.clone(),weight);}
    if(weight>=1)model.blend=null;
  }
  model.group.updateMatrixWorld(true);
}
try{
  [player,boss]=await Promise.all([loadCharacter('linglong',1.85),loadCharacter('boss',5.55)]);$('loading').textContent='Fitting the nozzle and preparing stubborn dirt…';
  const [nozzleGltf,texture,response]=await Promise.all([loader.loadAsync('/models/nozzle.glb'),new T.TextureLoader().loadAsync('/models/clean-transfer.png'),fetch('/models/clean-surface.bin')]);
  if(!response.ok)throw Error('Missing clean surface');
  surface=new BossSurface(boss.mesh,new Float32Array(await response.arrayBuffer()),texture);
  nozzle=new T.Group();const asset=nozzleGltf.scene;asset.scale.setScalar(.48);asset.rotation.y=-Math.PI/2;asset.position.set(0,-.24,.055);nozzle.add(asset);scene.add(nozzle);
  asset.traverse(o=>{if(o.isMesh){o.castShadow=true;o.material.normalScale?.set(.35,.35);}});
  player.group.position.copy(pos);boss.group.position.set(0,0,-1);pose(player,'ready',0);pose(boss,'idle',0);
  remotes=new RemotePlayers({scene,camera,source:player,instantiate:(root,animations)=>instantiateCharacter(root,animations,1.85),pose,tagLayer:$('name-tags')});
  party=createParty({
    inFight:()=>coop&&['fight','pause','result'].includes(phase),
    onRoom:(room,selfId)=>remotes.setRoster(room.players,selfId),
    onStart:({players,selfId,groups})=>{remotes.setRoster(players,selfId);if(groups&&groups!==surface.clean.groups.length)console.warn(`Co-op cleaning mismatch: server ${groups} groups, client ${surface.clean.groups.length}`);startCoop(Math.max(0,players.findIndex(p=>p.id===selfId)),players.length);},
    onState:(id,state)=>remotes.push(id,state),
    onGone:id=>remotes.gone(id),
    onBoss:s=>{if(coop)coopBoss.push(s);},
    onAttack:e=>{if(coop)coopBoss.attackEvent(e);},
    onClean:msg=>{if(!coop)return;surface.applyGroups(msg.g,msg.c);coopStink=msg.s;},
    onBottle:msg=>{if(coop)grantBottle(msg);},
    onEnd:msg=>{if(coop&&['fight','pause'].includes(phase)){coopStink=msg.stink;coopSeconds=msg.seconds;coopShares=msg.players;finish(msg.won);}},
  });
  loaded=true;phase='menu';$('start').disabled=false;$('practice').disabled=false;$('party-open').disabled=false;$('start').innerHTML='ENTER THE STALL <span>◇</span>';$('loading').textContent='Desktop · Mouse & keyboard · Esc to pause';
  $('party-open').onclick=()=>party.open();if(party.wantsOpen)party.open();
}catch(error){console.error(error);$('loading').textContent=`Unable to prepare the fight: ${error.message}. Refresh after running npm run boss:dev.`;}

function initAudio() {
  if (!audio) {
    audio = new AudioContext(); audioMaster = audio.createGain(); audioMaster.gain.value = muted ? 0 : masterVolume; audioMaster.connect(audio.destination);
    const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() - .5) * 2;
    const noise = audio.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 3100;
    waterGain = audio.createGain(); waterGain.gain.value = 0; noise.connect(filter).connect(waterGain).connect(audioMaster); noise.start();
    soundtrack = new BossAudio(audio, audioMaster, text => {
      $('boss-line').textContent = text; $('boss-line').classList.toggle('speaking', !!text);
    });
    playerVoice = new PlayerVoice(audio, audioMaster, { busy: () => !!soundtrack.voice, onSpeaking: speaking => soundtrack.setPlayerSpeaking(speaking) });
    soundtrack.onSpeak = () => playerVoice.stop();
  }
  audio.resume(); soundtrack.setPlaying(phase === 'fight');
}
function setAudioUI() {
  if (audioMaster) audioMaster.gain.setTargetAtTime(muted ? 0 : masterVolume, audio.currentTime, .03);
  $('audio-toggle').textContent = muted || masterVolume === 0 ? 'SOUND OFF' : 'SOUND ON';
  $('audio-toggle').setAttribute('aria-pressed', String(muted));
}
$('audio-toggle').onclick = () => { muted = !muted; setAudioUI(); };
$('audio-volume').oninput = event => { masterVolume = Number(event.target.value); muted = masterVolume === 0; setAudioUI(); };
function thump(power=1){if(!audio)return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.setValueAtTime(95,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(28,audio.currentTime+.28);gain.gain.setValueAtTime(.16*power,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.35);osc.connect(gain).connect(audioMaster);osc.start();osc.stop(audio.currentTime+.4);}
function showToast(text,seconds=1.4){$('toast').textContent=text;toastUntil=time+seconds;}
function captureMouse(){try{const result=canvas.requestPointerLock();result?.catch(()=>showToast('DRAG TO AIM · F TO TOGGLE WATER',3));}catch{showToast('DRAG TO AIM · F TO TOGGLE WATER',3);}}
function screens(){for(const id of ['menu','pause','result'])$(id).hidden=phase!==id;const inFight=['fight','pause','result'].includes(phase);$('hud').hidden=!inFight;$('pause-button').hidden=phase!=='fight';}
function reset(){
  time=0;brain.reset();footfalls.reset();fight.reset();pos.set(0,0,7);player.group.position.copy(pos);player.group.rotation.y=Math.PI;boss.group.position.set(0,0,-1);boss.group.rotation.y=0;
  yaw=Math.PI;pitch=.06;lockOn=false;bossFacing=0;bossTime=0;bossState='turn';attackCount=0;lastAttack='';previousHitboxes.clear();impactDone.clear();keys.clear();buttons.clear();autoWater=null;surface.reset();spells.clear();water.reset();reserve.reset();bottles.reset();pickups.reset();streamTrace=null;streamMode=null;lowWaterNotified=false;emptyWaterNotified=false;refillFlash=0;washClock=0;flash=0;impactLife=0;lastState='ready';cameraShake=0;hitUntil=0;
  pose(player,'ready',0);pose(boss,'idle',0);surface.updateCollision();phase='fight';soundtrack?.reset();soundtrack?.setPlaying(true);playerVoice?.reset(time);screens();showToast('REDUCE STINK TO 10%. SURVIVE THE REST.',2.8);updateCamera(1,true);updateHUD();
}
function start(practiceMode=false,coopMode=false){practice=practiceMode;coop=coopMode;remotes?.setVisible(coop);initAudio();reset();if(practice)showToast('PRACTICE · PASSIVE BOSS',3);captureMouse();}
function startCoop(slot,count){coopBoss.reset();coopStink=1;coopSeconds=0;coopShares=null;spectating=false;pendingBottle=null;stroke=null;start(false,true);
  pos.x+=SPAWN_OFFSETS[slot]??0;player.group.position.copy(pos);stateClock=0;updateCamera(1,true);
  showToast(count>1?`${count} WASHERS · HE NEEDS ${count}× THE WATER`:'CO-OP · YOU FACE HIM ALONE',3);}
function leaveCoop(){coop=false;spectating=false;coopBoss.reset();remotes.setVisible(false);menu();party.back();}
function coopTarget(id){return id===party.selfId?pos:(remotes.positionOf(id)??pos);}
function queueStroke(hit,radius,m,dt){
  const {point,normal}=surface.stroke(hit);
  if(stroke&&stroke.m!==m)flushStroke();
  stroke=stroke?{...stroke,p:point,n:normal,r:radius,dt:stroke.dt+dt}:{p:point,n:normal,r:radius,m,dt};
  if(stroke.dt>=.05)flushStroke();
}
function flushStroke(){if(!stroke)return;party.send({type:'paint',p:stroke.p,n:stroke.n,r:stroke.r,m:stroke.m,dt:Math.min(.25,stroke.dt)});stroke=null;}
function grantBottle({id,by,respawn}){
  const bottle=bottles.bottles[id];if(!bottle)return;
  bottle.readyAt=time+respawn;
  if(by===party.selfId)refillFeedback(id,reserve.refill());else pickups.collected(id,time);
  if(pendingBottle?.id===id)pendingBottle=null;
}
function localState(){
  const flowing=water.flowing&&streamTrace;
  return{p:[pos.x,pos.y,pos.z],r:Math.atan2(Math.sin(player.group.rotation.y),Math.cos(player.group.rotation.y)),c:lastPose.id,t:clamp(lastPose.t,0,60),h:fight.health,f:fight.state,
    w:flowing?{m:mode,o:emitter.toArray(),v:streamVelocity.toArray(),e:clamp(streamTrace.time,0,5)}:null};
}
function pause(){if(phase!=='fight')return;phase='pause';soundtrack?.setPlaying(false);playerVoice?.stop();keys.clear();buttons.clear();water.stop();if(waterGain)waterGain.gain.value=0;document.exitPointerLock();
  $('restart-pause').hidden=coop;$('menu-pause').textContent=coop?'LEAVE THE FIGHT · BACK TO ROOM':'RETURN TO MENU';screens();}
function resume(){phase='fight';soundtrack?.setPlaying(true);screens();captureMouse();initAudio();}
function menu(){spells.clear();footfalls.reset();phase='menu';soundtrack?.setPlaying(false);playerVoice?.stop();fight.reset();keys.clear();buttons.clear();water.reset();reserve.reset();bottles.reset();pickups.reset();surface.reset();pos.set(-3,0,6);player.group.position.copy(pos);boss.group.position.set(0,0,-1);boss.group.rotation.y=.2;document.exitPointerLock();screens();}
function finish(won){
  spells.clear();phase='result';soundtrack?.setPlaying(false);playerVoice?.stop();resultAt=performance.now();buttons.clear();keys.clear();water.stop();document.exitPointerLock();screens();$('result').classList.toggle('loss',!won);
  $('result-kicker').textContent=practice?'PRACTICE COMPLETE.':won?'A MIRACLE OF BASIC HYGIENE.':'THE STALL CLAIMS ANOTHER.';
  $('result-title').textContent=won?'FILTH VANQUISHED':'YOU DIED';$('result-copy').textContent=won?'The Unwashed is finally presentable. He is furious about it.':'Read the windup. Roll through the strike. Wash during recovery.';
  const stinkLeft=coop?coopStink:surface.clean.stink,elapsed=coop?coopSeconds:time;
  $('result-stink').textContent=`${(stinkLeft*100).toFixed(1)}%`;$('result-time').textContent=`${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;
  if(coop){$('result-kicker').textContent=won?'THE FELLOWSHIP PREVAILS.':'THE WHOLE PARTY FELL.';if(!won)$('result-copy').textContent='Nobody left standing. Read his windups and revive the attempt.';if(coopShares?.length>1)$('result-copy').textContent+=` Cleaning: ${coopShares.map(p=>`${p.name} ${Math.round(p.share*100)}%`).join(' · ')}.`;}
  $('retry').innerHTML=coop?'BACK TO THE ROOM <span aria-hidden="true">◇</span>':'ENTER THE STALL AGAIN <span aria-hidden="true">◇</span>';$('menu-result').hidden=coop;
  if(won)pose(boss,'clean_victory',0);thump(won?.5:1);
}
$('start').onclick=()=>start(false);$('practice').onclick=()=>start(true);$('retry').onclick=()=>coop?leaveCoop():start(practice);$('pause-button').onclick=pause;$('resume').onclick=resume;$('restart-pause').onclick=()=>start(practice);$('menu-pause').onclick=()=>coop?leaveCoop():menu();$('menu-result').onclick=menu;
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{if(phase!=='fight')return;if(document.pointerLockElement!==canvas)captureMouse();if(e.button===0||e.button===2){buttons.add(e.button);e.preventDefault();}});
document.addEventListener('mouseup',e=>buttons.delete(e.button));
document.addEventListener('mousemove',e=>{if(phase==='fight'&&(document.pointerLockElement===canvas||buttons.size>0)){yaw-=e.movementX*.0024;pitch=clamp(pitch-e.movementY*.002,-.65,1.1);if(Math.abs(e.movementX)+Math.abs(e.movementY)>5)lockOn=false;}});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&phase==='fight')pause();});
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
document.addEventListener('keydown',e=>{
  if(phase!=='fight')return;if(['Space','KeyW','KeyA','KeyS','KeyD','KeyQ','Escape'].includes(e.code))e.preventDefault();keys.add(e.code);
  if(e.code==='KeyF'&&!e.repeat)autoWater=autoWater==='shower'?null:'shower';
  if(e.code==='KeyG'&&!e.repeat)autoWater=autoWater==='jet'?null:'jet';
  if(e.code==='Space'&&!e.repeat){movement();const dir=move.lengthSq()>0?move:new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));fight.roll([dir.x,dir.z]);}
  if(e.code==='KeyQ'&&!e.repeat){lockOn=!lockOn;showToast(lockOn?'LOCKED ON':'FREE AIM',.8);}
  if(e.code==='Escape')pause();
});document.addEventListener('keyup',e=>keys.delete(e.code));
function movement(){forward.set(Math.sin(yaw),0,Math.cos(yaw));right.set(-Math.cos(yaw),0,Math.sin(yaw));move.set(0,0,0);if(keys.has('KeyW'))move.add(forward);if(keys.has('KeyS'))move.sub(forward);if(keys.has('KeyD'))move.add(right);if(keys.has('KeyA'))move.sub(right);move.normalize();}
function updatePlayer(dt){
  fight.tick(time);movement();
  if(fight.state!==lastState){if(fight.state==='rolling'){rollOrigin.copy(pos);player.group.rotation.y=Math.atan2(fight.rollDirection[0],fight.rollDirection[1]);}if(fight.state==='knockedDown'){knockOrigin.copy(pos);knockDirection.copy(pos).sub(boss.group.position).setY(0).normalize();}lastState=fight.state;}
  if(fight.canMove)pos.addScaledVector(move,((buttons.size||autoWater)&&!reserve.empty?2.8:3.9)*dt);
  else if(fight.state==='rolling')pos.copy(rollOrigin).add(new T.Vector3(fight.rollDirection[0],0,fight.rollDirection[1]).multiplyScalar(3.2*smooth(fight.elapsed/PLAYER_COMBAT.rollDuration)));
  else if(fight.state==='knockedDown')pos.copy(knockOrigin).addScaledVector(knockDirection,.8*smooth(fight.elapsed/.65));
  pos.x=clamp(pos.x,-16.5,16.5);pos.z=clamp(pos.z,-16.5,16.5);
  // Keep the character out of the boss's standing root, but let rolls pass beneath dives.
  if(fight.canMove&&!(bossState==='attack'&&attack==='jump_slam')){const delta=pos.clone().sub(boss.group.position).setY(0);if(delta.length()<.85){if(delta.lengthSq()<.001)delta.set(0,0,1);pos.copy(boss.group.position).add(delta.normalize().multiplyScalar(.85));pos.y=0;}}
  player.group.position.copy(pos);
  let id='ready',t=time;
  if(fight.state==='rolling'){id='dodge';t=fight.elapsed;}
  else if(['knockedDown','dead'].includes(fight.state)){id='knockdown';t=fight.state==='dead'?.9:fight.elapsed;}
  else if(fight.state==='gettingUp'){id='getup';t=fight.elapsed;}
  else{
    player.group.rotation.y+=angleDiff(yaw,player.group.rotation.y)*Math.min(1,dt*16);
    id=keys.has('KeyW')?'jog_forward':keys.has('KeyS')?'jog_backward':keys.has('KeyA')?'jog_left':keys.has('KeyD')?'jog_right':(buttons.size||autoWater)&&!reserve.empty?'spray':'ready';t%=CLIPS.player.find(c=>c.id===id).duration;
  }
  pose(player,id,t);lastPose.id=id;lastPose.t=t;
}
function beginAttack(begun){
  impactDone.clear();previousHitboxes.clear();
  if(SPELLS[begun.attack]){spells.begin(begun.attack,new T.Vector3(begun.targetX,0,begun.targetZ),begun.facing);soundtrack?.say(SPELLS[begun.attack].voice,time,true);}else spells.clear();
}
function syncBoss(b){bossState=b.state;bossTime=b.time;bossFacing=b.facing;attack=b.attack;attackCount=b.attackCount;}
function updateBoss(dt){
  if(practice){pose(boss,'idle',time%2.4,dt);return;}
  if(coop){
    const view=coopBoss.view(performance.now());
    if(!view){pose(boss,'idle',time%2.4,dt);return;}
    if(view.begun)beginAttack(view.begun);
    presentBoss(dt,view,coopTarget(view.target));
    if(view.ended)spells.clear();
    return;
  }
  const begun=brain.step(dt,pos);if(begun)beginAttack(begun);
  presentBoss(dt,brain,pos);
  if(brain.settle())spells.clear();
  syncBoss(brain);
}
// Poses the boss and runs spells, impacts and hits on the local player for one frame
// of boss state `b` (the local brain in solo, the server's boss in co-op).
function presentBoss(dt,b,target){
  const bossPose=(id,t)=>pose(boss,id,t,dt);syncBoss(b);
  boss.group.position.set(b.x,0,b.z);boss.group.rotation.y=b.facing;
  if(b.branch==='turn'){
    bossPose(Math.abs(b.difference)>.05?(b.difference>0?'turn_left':'turn_right'):'idle',time%.9);
  }else if(b.branch==='approach'){
    bossPose('advance',(b.walkCycle%1)*BOSS_WALK.duration);
    for(const contact of walkContacts(b.previousWalkCycle,b.walkCycle)){
      const foot=boss.bones[contact.side+'Foot'].getWorldPosition(new T.Vector3());
      foot.lerp(boss.bones[contact.side+'ToeBase'].getWorldPosition(new T.Vector3()),.5);
      footfalls.land(foot,1);const strength=clamp(1-(coop?pos.distanceTo(boss.group.position):b.distance)/22,.15,1);
      playFootfall(audio,audioMaster,strength);cameraShake=Math.max(cameraShake,.13*strength);
    }
  }else if(b.branch==='attack'){
    if(attack==='jump_slam')spells.updateDive(diveTarget.set(b.diveX,0,b.diveZ),bossTime);
    if (SPELLS[attack]) {
      const spell=SPELLS[attack];bossPose(spell.clip,bossTime);
      const origin=boss.bones.RightHand.getWorldPosition(new T.Vector3());
      if(attack==='yc_beam')origin.lerp(boss.bones.LeftHand.getWorldPosition(new T.Vector3()),.5);
      const ground=boss.group.position.clone();
      if(attack==='giant_stomp')ground.copy(boss.stompContact).applyMatrix4(boss.group.matrixWorld).setY(0);
      spells.update(bossTime,origin,bossFacing,target,ground);
      const hurt={start:[pos.x,.3,pos.z],end:[pos.x,1.53,pos.z],radius:.3};
      for(const volume of spells.hitboxes(bossTime))if(spellTouches(volume,hurt)&&fight.hit(`${attackCount}:spell:${volume.id}`,spell.damage)){
        flash=1;cameraShake=.3;showToast('KNOCKED DOWN · RECOVERING',1.5);thump(.8);
      }
      const impacts=attack==='agent_swarm'?spells.drops.map(d=>d.at):[spell.strikeStart];
      for(const [i,at]of impacts.entries())if(bossTime>=at&&!impactDone.has(at)){
        impactDone.add(at);const point=attack==='agent_swarm'?new T.Vector3(spells.drops[i].x,0,spells.drops[i].z):ground;
        footfalls.land(point,attack==='agent_swarm'?1:1.8);
        if(attack==='giant_stomp')playStompImpact(audio,audioMaster,1);else playFootfall(audio,audioMaster,attack==='agent_swarm'?.55:1.1);
        cameraShake=['yc_beam','giant_stomp'].includes(attack)?.3:.16;
      }
    } else {
      bossPose(attack,bossTime);
      for(const at of CLIPS.boss.find(c=>c.id===attack).impacts||[ATTACKS[attack].windows[0].start])if(bossTime>=at&&!impactDone.has(at)){impactDone.add(at);cameraShake=.12;impactLife=.55;impactRing.position.set(boss.group.position.x,.055,boss.group.position.z);thump();}
      checkHits();
    }
  }else bossPose('idle',time%2.4);
  boss.group.updateMatrixWorld(true);ring.position.x=boss.group.position.x;ring.position.z=boss.group.position.z;ring.visible=lockOn;
}
function checkHits(){
  const hurt={start:[pos.x,.30,pos.z],end:[pos.x,1.53,pos.z],radius:.3};
  ATTACKS[attack].windows.forEach((window,i)=>{
    if(bossTime<window.start||bossTime>window.end){previousHitboxes.delete(i);return;}
    const a=boss.bones[window.bones[0]].getWorldPosition(new T.Vector3()).toArray(),b=boss.bones[window.bones[1]].getWorldPosition(new T.Vector3()).toArray(),volume={start:a,end:b,radius:window.radius};
    const previous=previousHitboxes.get(i);let hit=capsulesTouch(volume,hurt);if(previous)hit||=capsulesTouch({start:previous.start,end:a,radius:window.radius},hurt)||capsulesTouch({start:previous.end,end:b,radius:window.radius},hurt);
    if(hit&&fight.hit(`${attackCount}:${i}`,ATTACKS[attack].damage)){flash=1;cameraShake=.3;showToast('KNOCKED DOWN · RECOVERING',1.5);thump(.7);}
    previousHitboxes.set(i,volume);
  });
}
function updateCamera(dt,instant=false){
  if(lockOn){const target=boss.bones.Spine2.getWorldPosition(new T.Vector3());yaw+=angleDiff(Math.atan2(target.x-pos.x,target.z-pos.z),yaw)*Math.min(1,dt*8);pitch=lerp(pitch,Math.atan2(target.y-1.45,Math.max(2,pos.distanceTo(target))),Math.min(1,dt*8));}
  const direction=new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)),center=(spectating?remotes.alivePosition()??pos:pos).clone().add(new T.Vector3(0,1.5,0));const desired=center.clone().addScaledVector(direction,-5.7).add(new T.Vector3(-Math.cos(yaw),0,Math.sin(yaw)).multiplyScalar(.65));desired.y=Math.max(.8,desired.y);desired.x=clamp(desired.x,-17.4,17.4);desired.z=clamp(desired.z,-17.4,17.4);
  camera.position.lerp(desired,instant?1:1-Math.exp(-dt*16));camera.lookAt(center.addScaledVector(direction,20));if(cameraShake>0){camera.position.x+=(Math.random()-.5)*cameraShake;camera.position.y+=(Math.random()-.5)*cameraShake;}
}
function updateNozzle(){
  const hand=player.bones.RightHand.getWorldPosition(new T.Vector3());nozzle.position.copy(hand);nozzle.rotation.set(-pitch,player.group.rotation.y,0,'YXZ');nozzle.visible=fight.canMove||phase==='menu';emitter.set(0,.14,.3).applyQuaternion(nozzle.quaternion).add(hand);
}
function updateSupplies(dt) {
  const canCollect = fight.canMove || fight.state === 'rolling';
  if (coop) {
    const bottle = canCollect && reserve.amount < WATER_RULES.capacity - 1e-8 && bottles.bottles.find(b => bottles.available(b, time) && Math.hypot(pos.x - b.x, pos.z - b.z) <= WATER_RULES.pickupRadius);
    if (bottle && (pendingBottle?.id !== bottle.id || time - pendingBottle.at > 1)) { pendingBottle = { id: bottle.id, at: time }; party.send({ type: 'pickup', id: bottle.id }); }
  } else {
    const picked = bottles.collect(pos, time, reserve, canCollect);
    if (picked) refillFeedback(picked.id, picked.added);
  }
  pickups.update(time, true, reserve.low); refillFlash = Math.max(0, refillFlash - dt * 2);
}
function refillFeedback(id, added) {
  pickups.collected(id, time); refillFlash = 1;
  lowWaterNotified = reserve.low; emptyWaterNotified = false;
  showToast(`+${Math.round(added)} WATER · REFILLED`, 1.5);
  if (audio) {
    const tone = audio.createOscillator(), gain = audio.createGain();
    tone.frequency.setValueAtTime(600, audio.currentTime); tone.frequency.exponentialRampToValueAtTime(1100, audio.currentTime + .16);
    gain.gain.setValueAtTime(.05, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .25);
    tone.connect(gain).connect(audioMaster); tone.start(); tone.stop(audio.currentTime + .26);
  }
}
function spray(dt) {
  const requested = fight.canMove && (buttons.size > 0 || autoWater);
  mode = buttons.has(2) || (!buttons.size && autoWater === 'jet') ? 'jet' : 'shower';
  const paidSeconds = reserve.consume(mode, dt, !!requested);
  if (waterGain) waterGain.gain.setTargetAtTime(paidSeconds > 0 ? (mode === 'jet' ? .072 : .058) : 0, audio.currentTime, .025);
  if (reserve.low && !lowWaterNotified) { lowWaterNotified = true; showToast('LOW WATER · RUN OVER A BLUE BOTTLE', 2.5); }
  if (reserve.empty && !emptyWaterNotified) { emptyWaterNotified = true; showToast('OUT OF WATER · FIND A BLUE BOTTLE', 3.5); }
  if (!paidSeconds) { water.stop(); washClock = 0; streamTrace = null; if (coop) flushStroke(); return; }
  washClock += dt;
  // Refresh animated collision at 25 Hz; apply cleaning using only paid exposure.
  // Visual flow follows the hand every frame so the hose does not lag while moving.
  if (!streamTrace || streamMode !== mode || washClock >= .04) {
    washClock = 0; streamMode = mode; surface.updateCollision(); camera.getWorldDirection(aim);
    const settings = HOSE[mode], far = camera.position.clone().addScaledVector(aim, 36);
    const targetHit = surface.cast(camera.position, far);
    const target = targetHit ? targetHit.point : emitter.clone().addScaledVector(aim, settings.range);
    streamVelocity.copy(target).sub(emitter);
    const travelTime = streamVelocity.length() / settings.speed;
    streamVelocity.y += .5 * HOSE.gravity * travelTime * travelTime;
    streamVelocity.normalize().multiplyScalar(settings.speed);
    streamTrace = traceWater(surface, emitter, streamVelocity, settings.range / settings.speed);
  }
  if (!water.flowing) playerVoice?.attack(time);
  water.setStream(emitter, streamVelocity, mode, streamTrace.time);
  if (streamTrace.hit) {
    const distance = emitter.distanceTo(streamTrace.hit.point), radius = (mode === 'jet' ? .55 : Math.min(1.3, .6 + distance * .065)) / boss.scale;
    if (coop) queueStroke(streamTrace.hit, radius, mode, paidSeconds); else surface.paint(streamTrace.hit, radius, mode === 'jet' ? 1.5 : .95, paidSeconds);
    water.impact(streamTrace.hit, streamVelocity, mode, paidSeconds, surface); hitUntil = time + .13;
  }
}
function updateWaterHUD() {
  const amount = Math.ceil(reserve.amount), nearest = bottles.nearest(pos, time), tank = $('water-reserve');
  $('water-label').textContent = `${amount}%`;
  $('water-fill').style.width = `${reserve.amount}%`;
  tank.setAttribute('aria-valuenow', String(amount));
  tank.classList.toggle('low', reserve.low); tank.classList.toggle('empty', reserve.empty);
  tank.style.setProperty('--refill-glow', refillFlash);
  $('water-status').textContent = reserve.empty ? 'EMPTY · PICK UP WATER' : reserve.low ? 'LOW WATER · REFILL SOON' : 'RUN OVER BLUE BOTTLES TO REFILL';
  const guide = $('refill-guide'); guide.classList.toggle('urgent', reserve.low);
  $('refill-title').textContent = reserve.empty ? 'NO WATER. GO GET SOME.' : reserve.low ? 'TIME FOR A REFILL' : 'WATER BOTTLES';
  $('refill-instruction').textContent = 'Walk over a blue bottle · +45 water';
  if (nearest) {
    const bearing = Math.atan2(nearest.x - pos.x, nearest.z - pos.z);
    $('refill-arrow').style.transform = `rotate(${-angleDiff(bearing, yaw)}rad)`;
    $('refill-distance').textContent = `${Math.ceil(nearest.distance)} m`;
  } else { $('refill-distance').textContent = 'RESTOCKING'; }
  $('crosshair').classList.toggle('empty', reserve.empty);
}
function updateHUD(){
  updateWaterHUD();
  const stink=(coop?coopStink:surface.clean.stink)*100;$('health-label').textContent=`${fight.health} / 100`;$('health-fill').style.width=`${fight.health}%`;$('health-fill').classList.toggle('critical',fight.health<=35);$('stink-label').textContent=stink.toFixed(1);$('stink-fill').style.width=`${stink}%`;$('stink-meter').setAttribute('aria-valuenow',stink.toFixed(1));
  $('player-state').textContent=fight.state==='rolling'?(fight.invulnerable?'DODGE · INVULNERABLE':'ROLL RECOVERY'):['knockedDown','gettingUp'].includes(fight.state)?'GETTING UP · PROTECTED':lockOn?'LOCKED ON · Q TO FREE AIM':'FREE AIM · Q TO LOCK ON';
  $('boss-action').textContent=spectating?'YOU FELL · YOUR ALLIES FIGHT ON':practice?'PRACTICE · THE BOSS IS PASSIVE':bossState==='attack'?`${(SPELLS[attack]?.name ?? CLIPS.boss.find(c=>c.id===attack).name).toUpperCase()} · ${bossTime<(SPELLS[attack]?.strikeStart ?? ATTACKS[attack].windows[0].start)?'WINDUP':bossTime>(SPELLS[attack]?.strikeEnd ?? ATTACKS[attack].windows.at(-1).end)?'RECOVERY':'STRIKE'}`:bossState==='recover'?'RECOVERING · KEEP WASHING':bossState==='approach'?'HE IS COMING FOR YOU.':'WATCH HIS HANDS.';
  $('mode-label').textContent=mode==='jet'?'PRESSURE JET':'SHOWER CONE';$('mode-description').textContent=mode==='jet'?'RMB · FOCUSED CLEANING':'LMB · WIDE COVERAGE';$('hit-marker').style.opacity=time<hitUntil?1:0;$('toast').style.opacity=time<toastUntil?1:0;
}
function resize(){renderer.setPixelRatio(pixelRatio);renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();water.resize(innerHeight,renderer.getPixelRatio());remotes?.resize(innerHeight,renderer.getPixelRatio());}window.addEventListener('resize',resize);resize();
// Slow GPUs drop render resolution in steps; it never climbs back, so it cannot oscillate.
const RESOLUTION={window:90,slowMs:22,step:.2,min:Math.min(MAX_PIXEL_RATIO,.75)},frameIntervals=[];
function adaptResolution(interval){
  if(interval>100||pixelRatio<=RESOLUTION.min)return;
  frameIntervals.push(interval);if(frameIntervals.length<RESOLUTION.window)return;
  frameIntervals.sort((a,b)=>a-b);const median=frameIntervals[frameIntervals.length>>1];frameIntervals.length=0;
  if(median>RESOLUTION.slowMs){pixelRatio=Math.max(RESOLUTION.min,pixelRatio-RESOLUTION.step);resize();}
}
function frame(now){
  requestAnimationFrame(frame);const interval=now-last,dt=Math.min(interval/1000,.04);last=now;
  if(loaded){
    if(phase==='fight'||(coop&&phase==='pause')){
      adaptResolution(interval);time+=dt;footfalls.update(dt);updatePlayer(dt);updateBoss(dt);updateCamera(dt);updateNozzle();updateSupplies(dt);spray(dt);water.update(dt);soundtrack?.tick(time,water.flowing,practice);updateHUD();
      if(coop&&(stateClock+=dt)>=.05){stateClock=0;party.sendState(localState());}
      if(coop){if(fight.state==='dead'&&!spectating){spectating=true;showToast('YOU FELL · YOUR ALLIES FIGHT ON',3);}}
      else if(fight.state==='dead')finish(false);else if(fight.health>0&&surface.clean.won)finish(true);
    }else if(phase==='menu'){
      pickups.update(time,false,false);
      pose(boss,'idle',now/1000%2.4);pose(player,'ready',now/1000%2.4);player.group.rotation.y=Math.PI+.25;updateNozzle();ring.visible=false;camera.position.set(9,4.5,12);camera.lookAt(-1,2.4,-1);water.stop();if(waterGain)waterGain.gain.value=0;
    }else if(phase==='result'){
      if(surface.clean.won)pose(boss,'clean_victory',Math.min(3.6,(now-resultAt)/1000));water.update(dt);if(waterGain)waterGain.gain.value=0;
    }
    if(coop)remotes.update(dt,now);
    flash=Math.max(0,flash-dt*2);$('damage-flash').style.opacity=flash*.8;cameraShake=Math.max(0,cameraShake-dt*1.5);impactLife=Math.max(0,impactLife-dt);impactRing.material.opacity=impactLife*.5;impactRing.scale.setScalar(1+(.55-impactLife)*7);
  }
  arena.update(now/1000);renderer.render(scene,camera);
}
let resultAt=0;
requestAnimationFrame(frame);
