import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOSS_WALK, walkContacts } from './boss-walk.js';
import { Footfalls, playFootfall, playStompImpact } from './footfalls.js';
import { spellTouches } from './spell-rules.js';
import { BossSpells, SPELLS } from './boss-spells.js';
import { STOMP, stompContact } from './stomp.js';
import { CLIPS } from './motion.js';
import { ATTACKS, CombatState, PLAYER_COMBAT, capsulesTouch } from './combat.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas'), stage = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x172019, .038);
const camera = new THREE.PerspectiveCamera(35, 1, .1, 60);
camera.position.set(5.5, 6.0, 20.5);
const controls = new OrbitControls(camera, canvas);
controls.target.set(.5, 2.0, 0); controls.enableDamping = true;
controls.minDistance = 2; controls.maxDistance = 35; controls.maxPolarAngle = Math.PI * .49;
scene.add(new THREE.HemisphereLight(0xe6f2cd, 0x4a5345, 2.0));
function light(color, intensity, x, y, z) {
  const light = new THREE.DirectionalLight(color, intensity); light.position.set(x, y, z); scene.add(light); return light;
}
const key = light(0xffecd2, 3.8, -3, 7, 5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -7; key.shadow.camera.right = 7;
key.shadow.camera.top = 10; key.shadow.camera.bottom = -10; key.shadow.normalBias = .025;
light(0xb9dcd7, 2.5, 5, 4, -5); light(0xdceeb9, .8, -4, 2, -3);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x242d23, roughness: .87, metalness: .12 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.025; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(60, 120, 0x49533a, 0x333d30); grid.material.transparent = true; grid.material.opacity = .24; scene.add(grid);

const models = [];
let selected = 'dirty', lineup = false, playing = true, repeat = true, speed = 1, clockTime = 0;
let combatEnabled = false, combatTime = 0, combatEpoch = 0, bossFacing = 0, lastCycle = -1, lastCombatState = 'ready';
let bossTurning = true, turnSign = 1;
const bossOrigin = new THREE.Vector3();
const fight = new CombatState(), keys = new Set(), playerPosition = new THREE.Vector3(0, 0, 1.8);
const rollOrigin = new THREE.Vector3(), knockOrigin = new THREE.Vector3(), knockDirection = new THREE.Vector3();
const previousHitboxes = new Map();
const previewClip = new URLSearchParams(location.search).get('clip');
const selectedClips = { player: 'jog_forward', boss: CLIPS.boss.some(c => c.id === previewClip) ? previewClip : 'advance' };
const kind = () => selected === 'player' ? 'player' : 'boss';
const currentClip = () => CLIPS[kind()].find((c) => c.id === selectedClips[kind()]);
const loader = new GLTFLoader();
const footfalls = new Footfalls(scene), spellPreview = new BossSpells(scene);
let footAudio, lastFootTime = 0, lastPreviewSpell = null;
const specs = [
  { id: 'player', file: 'linglong', kind: 'player', name: 'LINGLONG', height: 1.85, x: -3.4 },
  { id: 'dirty', file: 'boss', kind: 'boss', name: 'THE UNWASHED', height: 5.55, x: 0 },
  { id: 'clean', file: 'boss_clean', kind: 'boss', name: 'REDEMPTION', height: 5.55, x: 4.65 },
];
let loaded = 0;
try {
  await Promise.all(specs.map(async (spec) => {
    const gltf = await loader.loadAsync(`/models/${spec.file}-animated.glb`);
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const scale = spec.height / (bounds.max.y - bounds.min.y);
    const group = new THREE.Group(); group.position.x = spec.x;
    gltf.scene.scale.setScalar(scale); group.add(gltf.scene); scene.add(group);
    gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const skeleton = new THREE.SkeletonHelper(gltf.scene); skeleton.visible = false; scene.add(skeleton);
    skeleton.material.depthTest = false; skeleton.material.transparent = true; skeleton.material.opacity = .85; skeleton.renderOrder = 10;
    const radius = spec.height * .39;
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .012, radius, 100), new THREE.MeshBasicMaterial({ color: spec.id === 'dirty' ? 0xdeed9b : 0x748561, side: THREE.DoubleSide, transparent: true, opacity: .6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(spec.x, .003, 0); scene.add(ring);
    group.updateMatrixWorld(true);
    const contact = new THREE.Vector3().fromArray(stompContact(group.worldToLocal(gltf.scene.getObjectByName('mixamorigRightFoot').getWorldPosition(new THREE.Vector3())).toArray(), spec.height));
    models.push({ ...spec, stompContact: contact, group, gltf, mixer, skeleton, ring, active: null, label: document.querySelector(`[data-label=${spec.id}]`) });
    $('load-label').textContent = `Preparing characters… ${++loaded}/3`;
  }));
  $('loading').style.display = 'none';
} catch (error) {
  console.error(error); $('load-label').textContent = 'Could not load the animated models. Run npm run animate in apps/bossfight, then refresh.';
  document.querySelector('.spinner').style.display = 'none';
}

function activate(model, id = selectedClips[model.kind]) {
  if (model.active?.getClip().name === id) return;
  model.mixer.stopAllAction();
  const clip = model.gltf.animations.find((clip) => clip.name === id);
  if (!clip) throw new Error(`Missing animation ${id}`);
  const action = model.mixer.clipAction(clip);
  action.reset().setLoop(THREE.LoopOnce, 1).play(); action.clampWhenFinished = true; action.paused = true;
  model.active = action;
}
function setClip(id) {
  const previous = selectedClips[kind()]; selectedClips[kind()] = id; clockTime = 0; playing = true; lastFootTime = 0; footfalls.reset(); spellPreview.clear(); lastPreviewSpell = null;
  models.forEach((model) => activate(model));
  if (combatEnabled) { resetCombat(); canvas.focus(); }
  if (['jump_slam', 'giant_stomp'].includes(id) || ['jump_slam', 'giant_stomp'].includes(previous)) setCamera('three-quarter');
  refreshPanel();
}
function refreshPanel() {
  const clip = currentClip();
  $('character-name').textContent = specs.find((s) => s.id === selected).name;
  $('clip-title').textContent = clip.name; $('clip-note').textContent = clip.note;
  $('clip-count').textContent = `${CLIPS[kind()].length} CLIPS`;
  $('clips').replaceChildren(...CLIPS[kind()].map((item, i) => {
    const button = document.createElement('button'); button.className = `clip${item.id === clip.id ? ' selected' : ''}`;
    button.innerHTML = `<span class="number">${String(i + 1).padStart(2, '0')}</span><span>${item.name}</span><span class="duration">${item.duration.toFixed(1)}s ${item.loop ? '↻' : '↗'}</span>`;
    button.setAttribute('aria-pressed', String(item.id === clip.id)); button.onclick = () => setClip(item.id); return button;
  }));
  $('timeline').max = clip.duration;
  $('phase-track').replaceChildren(...(clip.phases ? [clip.phases[0], clip.phases[1] - clip.phases[0], clip.duration - clip.phases[1]] : [clip.duration]).map((length) => {
    const bar = document.createElement('i'); bar.style.flex = length; return bar;
  }));
  const spec = specs.find((s) => s.id === selected);
  $('download').href = `/models/${spec.file}-animated.glb`;
  $('download').querySelector('span').textContent = `${CLIPS[kind()].length} CLIPS`;
  document.querySelectorAll('[data-model]').forEach((button) => { button.classList.toggle('active', button.dataset.model === selected); button.setAttribute('aria-pressed', String(button.dataset.model === selected)); });
  $('play').textContent = playing ? 'Pause' : 'Play';
}
document.querySelectorAll('[data-model]').forEach((button) => button.onclick = () => { selected = button.dataset.model; clockTime = 0; if (combatEnabled && selected === 'player') toggleCombat(false); else if (combatEnabled) resetCombat(); refreshPanel(); if (!lineup) setCamera('three-quarter'); });
$('footstep-sound').onchange = () => { if ($('footstep-sound').checked) { footAudio ??= new AudioContext(); footAudio.resume(); } };
$('play').onclick = () => { playing = !playing; $('play').textContent = playing ? 'Pause' : 'Play'; };
$('restart').onclick = () => { clockTime = 0; playing = true; if (combatEnabled) resetCombat(); $('play').textContent = 'Pause'; };
$('repeat').onchange = (event) => { repeat = event.target.checked; };
$('speed').onchange = (event) => { speed = Number(event.target.value); };
$('timeline').oninput = (event) => { if (combatEnabled) toggleCombat(false); clockTime = Number(event.target.value); playing = false; $('play').textContent = 'Play'; };
function setCamera(view) {
  stage.classList.toggle('solo-mode', !lineup);
  const spec = specs.find((s) => s.id === selected);
  const x = lineup ? .5 : spec.x;
  const jumping = selected !== 'player' && selectedClips.boss === 'jump_slam';
  const eruption = selected !== 'player' && selectedClips.boss === 'giant_stomp', focusZ = eruption ? 3.2 : 0;
  const distance = lineup ? Math.max(jumping ? 21 : 19, 18 / camera.aspect) : spec.height * (jumping ? 3.65 : eruption ? 3.5 : 2.85);
  const targetY = lineup ? (jumping ? 3.2 : 2.0) : spec.height * (jumping ? .64 : .45);
  camera.position.set(x + (view === 'side' ? distance : view === 'three-quarter' ? distance * .25 : 0), targetY + distance * .18, focusZ + (view === 'side' ? .1 : view === 'back' ? -distance : distance));
  controls.target.set(x, targetY, focusZ); controls.update();
}
for (const view of ['front', 'three-quarter', 'side', 'back']) $(view).onclick = () => setCamera(view);
$('lineup').onclick = () => { lineup = true; $('lineup').classList.add('active'); $('solo').classList.remove('active'); setCamera('three-quarter'); };
$('solo').onclick = () => { lineup = false; $('solo').classList.add('active'); $('lineup').classList.remove('active'); setCamera('three-quarter'); };
document.addEventListener('keydown', (event) => {
  if (['INPUT', 'SELECT', 'BUTTON', 'A'].includes(document.activeElement?.tagName)) return;
  if (combatEnabled) {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) { keys.add(event.code); event.preventDefault(); }
    if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) fight.roll(inputDirection()); return; }
  }
  if (event.code === 'Space') { event.preventDefault(); $('play').click(); }
  if (event.key.toLowerCase() === 'r') $('restart').click();
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
function inputDirection() {
  const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const z = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
  const length = Math.hypot(x, z); return length ? [x / length, z / length] : [0, 1];
}
function resetCombat() {
  fight.reset(); combatTime = 0; clockTime = 0; combatEpoch++; lastCycle = -1; bossFacing = -.65; lastCombatState = 'ready'; bossTurning = true;
  const boss = specs.find((s) => s.id === selected);
  bossOrigin.set(boss.x, 0, 0);
  playerPosition.set(boss.x, 0, 1.8); previousHitboxes.clear(); keys.clear(); $('death').hidden = true;
}
function toggleCombat(on) {
  combatEnabled = on;
  if (on && selected === 'player') selected = 'dirty';
  $('combat-toggle').textContent = on ? 'Exit combat test' : 'Test combat'; $('combat-toggle').classList.toggle('active', on);
  $('combat-hud').hidden = !on; $('death').hidden = true; stage.classList.toggle('combat-mode', on);
  if (on) { resetCombat(); playing = true; repeat = true; $('repeat').checked = true; lineup = false; setCamera('three-quarter'); camera.position.z *= 1.08; controls.target.z = 1; canvas.focus(); }
  else models.forEach((model) => { model.group.rotation.y = 0; model.group.position.x = model.x; activate(model); });
  $('lineup').classList.toggle('active', lineup); $('solo').classList.toggle('active', !lineup);
  refreshPanel();
}
$('combat-toggle').onclick = () => toggleCombat(!combatEnabled);
$('retry').onclick = () => { resetCombat(); playing = true; canvas.focus(); };
function resize() {
  const { width, height } = stage.getBoundingClientRect();
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize(); setCamera('three-quarter'); models.forEach((model) => activate(model)); refreshPanel();

const impact = new THREE.Mesh(new THREE.RingGeometry(.3, .36, 80), new THREE.MeshBasicMaterial({ color: 0xecc8a3, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
impact.rotation.x = -Math.PI / 2; impact.position.y = .015; scene.add(impact);
const ease = (x) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
// A separate preview prop: exported GLBs contain the original characters only.
const hose = new THREE.Group(); scene.add(hose);
const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.027, .039, .34, 12), new THREE.MeshStandardMaterial({ color: 0x626c57, metalness: .7, roughness: .28 }));
barrel.rotation.x = Math.PI / 2; barrel.position.z = .15; hose.add(barrel);
const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.036, .042, .09, 12), new THREE.MeshStandardMaterial({ color: 0xdfe994, metalness: .55, roughness: .35 }));
nozzle.rotation.x = Math.PI / 2; nozzle.position.z = .32; hose.add(nozzle);
const handle = new THREE.Mesh(new THREE.CylinderGeometry(.023, .029, .14, 10), new THREE.MeshStandardMaterial({ color: 0x27352c, roughness: .8 }));
handle.position.y = -.035; handle.rotation.x = -.25; hose.add(handle);
const sprayGeometry = new THREE.BufferGeometry(); const sprayPositions = [];
for (let i = 0; i < 240; i++) { const z = (i + 1) / 240 * 1.4, angle = i * 2.39996, radius = z * .13 * Math.sqrt((i % 17) / 17); sprayPositions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z + .35); }
sprayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sprayPositions, 3));
const water = new THREE.Points(sprayGeometry, new THREE.PointsMaterial({ color: 0xbbe5e8, size: .023, transparent: true, opacity: .65, depthWrite: false })); hose.add(water);
let last = performance.now();
const capsuleDrawings = [];
function drawCapsule(index, capsule, color) {
  let drawing = capsuleDrawings[index];
  if (!drawing) {
    const material = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: .45, depthTest: false });
    const group = new THREE.Group();
    const start = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material), end = start.clone();
    const middle = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), material);
    group.add(start, end, middle); scene.add(group); drawing = { group, start, end, middle, material }; capsuleDrawings[index] = drawing;
  }
  const a = new THREE.Vector3().fromArray(capsule.start), b = new THREE.Vector3().fromArray(capsule.end), delta = b.clone().sub(a);
  drawing.group.visible = true; drawing.material.color.setHex(color);
  drawing.start.position.copy(a); drawing.end.position.copy(b);
  drawing.start.scale.setScalar(capsule.radius); drawing.end.scale.setScalar(capsule.radius);
  drawing.middle.position.copy(a).lerp(b, .5); drawing.middle.scale.set(capsule.radius, Math.max(delta.length(), .001), capsule.radius);
  drawing.middle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
}
function travelFor(id, time) {
  if (id === 'charge') return 3.0 * ease((time - .65) / 1.22);
  if (id === 'jump_slam') return 2.6 * ease((time - .60) / .85);
  return 0;
}
function updateCombat(delta, clip, cycle) {
  combatTime += delta; fight.tick(combatTime);
  if (fight.state !== lastCombatState) {
    if (fight.state === 'rolling') rollOrigin.copy(playerPosition);
    if (fight.state === 'knockedDown') { knockOrigin.copy(playerPosition); knockDirection.copy(playerPosition).sub(bossOrigin).setY(0).normalize(); }
    lastCombatState = fight.state;
  }
  if (fight.canMove && keys.size) {
    const [x, z] = inputDirection(); playerPosition.x += x * 3.3 * delta; playerPosition.z += z * 3.3 * delta;
  } else if (fight.state === 'rolling') {
    playerPosition.copy(rollOrigin).add(new THREE.Vector3(fight.rollDirection[0], 0, fight.rollDirection[1]).multiplyScalar(2.8 * ease(fight.elapsed / PLAYER_COMBAT.rollDuration)));
  } else if (fight.state === 'knockedDown') playerPosition.copy(knockOrigin).addScaledVector(knockDirection, .7 * ease(fight.elapsed / .65));
  playerPosition.x = THREE.MathUtils.clamp(playerPosition.x, -10, 10); playerPosition.z = THREE.MathUtils.clamp(playerPosition.z, -8, 12);
  if (bossTurning) {
    clockTime = 0;
    const target = Math.atan2(playerPosition.x - bossOrigin.x, playerPosition.z - bossOrigin.z);
    const angle = Math.atan2(Math.sin(target - bossFacing), Math.cos(target - bossFacing));
    turnSign = Math.sign(angle) || 1;
    bossFacing += THREE.MathUtils.clamp(angle, -delta * 1.8, delta * 1.8);
    if (Math.abs(angle) < .035) { bossFacing = target; bossTurning = false; lastCycle++; previousHitboxes.clear(); }
  } else {
    clockTime += delta;
    if (repeat && clockTime >= cycle) {
      const distance = travelFor(clip.id, clip.duration);
      bossOrigin.x += Math.sin(bossFacing) * distance; bossOrigin.z += Math.cos(bossFacing) * distance;
      bossOrigin.x = THREE.MathUtils.clamp(bossOrigin.x, -7, 7); bossOrigin.z = THREE.MathUtils.clamp(bossOrigin.z, -5, 9);
      clockTime = 0; bossTurning = true; previousHitboxes.clear();
    }
  }
}
function draw(now) {
  requestAnimationFrame(draw);
  const dt = Math.min((now - last) / 1000, .05); last = now;
  const clip = currentClip();
  const cycle = clip.duration + (clip.loop ? 0 : .55);
  if (playing) { if (combatEnabled) updateCombat(dt * speed, clip, cycle); else clockTime += dt * speed; }
  if (!repeat && clockTime > clip.duration) { clockTime = clip.duration; playing = false; $('play').textContent = 'Play'; }
  if (clockTime < lastFootTime) { lastFootTime = clockTime; footfalls.reset(); spellPreview.clear(); lastPreviewSpell = null; }
  if (playing) footfalls.update(dt * speed);
  const cursor = Math.min(combatEnabled ? clockTime : repeat ? clockTime % cycle : clockTime, clip.duration);
  $('timeline').value = cursor; $('time').textContent = `${cursor.toFixed(2)} / ${clip.duration.toFixed(2)} s`;
  const phase = combatEnabled && bossTurning ? 'FACING PLAYER' : clip.phases ? cursor < clip.phases[0] ? 'WINDUP' : cursor < clip.phases[1] ? 'STRIKE' : 'RECOVERY' : clip.loop ? 'LOOP' : 'ONE SHOT';
  $('phase').textContent = phase; $('phase').classList.toggle('strike', phase === 'STRIKE');
  for (const model of models) {
    let id = selectedClips[model.kind];
    let modelClip = CLIPS[model.kind].find((c) => c.id === id);
    let time = model.kind === kind() ? cursor : Math.min(clockTime % (modelClip.duration + (modelClip.loop ? 0 : .55)), modelClip.duration);
    if (combatEnabled && model.kind === 'player') {
      id = fight.state === 'rolling' ? 'dodge' : fight.state === 'knockedDown' || fight.state === 'dead' ? 'knockdown' : fight.state === 'gettingUp' ? 'getup' : keys.has('KeyW') ? 'jog_forward' : keys.has('KeyS') ? 'jog_backward' : keys.has('KeyA') ? 'jog_left' : keys.has('KeyD') ? 'jog_right' : 'ready';
      modelClip = CLIPS.player.find((c) => c.id === id);
      time = fight.state === 'ready' ? combatTime % modelClip.duration : fight.state === 'dead' ? modelClip.duration : Math.min(fight.elapsed, modelClip.duration);
    } else if (combatEnabled && bossTurning) { id = turnSign > 0 ? 'turn_left' : 'turn_right'; time = combatTime % .9; }
    activate(model, id);
    model.active.time = time; model.active.enabled = true; model.mixer.update(0);
    const visible = combatEnabled ? model.kind === 'player' || model.id === selected : lineup || model.id === selected;
    model.group.visible = visible; model.ring.visible = visible;
    model.skeleton.visible = visible && $('skeleton').checked;
    let z = 0;
    if ($('travel').checked || combatEnabled) {
      z = travelFor(modelClip.id, time);
      if (modelClip.id === 'advance' && !combatEnabled) z = (time / BOSS_WALK.duration - .5) * (2 * BOSS_WALK.stride * model.height / BOSS_WALK.stance);
      if (modelClip.id === 'dodge') z = 1.3 * ease((time - .1) / .52);
    }
    model.group.position.set(model.x, 0, z); model.group.rotation.y = 0;
    if (!combatEnabled && id.startsWith('turn_') && $('travel').checked) model.group.rotation.y = (id === 'turn_left' ? 1 : -1) * clockTime * .9;
    if (combatEnabled && model.kind === 'player') {
      model.group.position.copy(playerPosition);
      model.group.rotation.y = fight.state === 'rolling' ? Math.atan2(fight.rollDirection[0], fight.rollDirection[1]) : Math.atan2(bossOrigin.x - playerPosition.x, bossOrigin.z - playerPosition.z);
    } else if (combatEnabled && model.id === selected) {
      const travel = bossTurning ? 0 : z;
      model.group.position.copy(bossOrigin).add(new THREE.Vector3(Math.sin(bossFacing), 0, Math.cos(bossFacing)).multiplyScalar(travel));
      model.group.rotation.y = bossFacing;
    }
    model.ring.position.x = model.group.position.x; model.ring.position.z = model.group.position.z;
    model.group.updateMatrixWorld(true);
    const p = new THREE.Vector3(model.x, -.12, -.2).project(camera);
    model.label.style.left = `${(p.x * .5 + .5) * stage.clientWidth}px`;
    model.label.style.top = `${(-p.y * .5 + .5) * stage.clientHeight + 12}px`;
    model.label.style.display = visible && !combatEnabled ? 'block' : 'none';
    model.ring.material.opacity = model.id === selected ? .85 : .30;
  }
  const player = models.find((m) => m.id === 'player');
  if (player) {
    hose.visible = player.group.visible && (!combatEnabled || !['knockedDown', 'gettingUp', 'dead'].includes(fight.state));
    const right = player.gltf.scene.getObjectByName('mixamorigRightHand');
    const left = player.gltf.scene.getObjectByName('mixamorigLeftHand');
    if (right && left) {
      hose.position.copy(right.getWorldPosition(new THREE.Vector3()));
      const direction = left.getWorldPosition(new THREE.Vector3()).sub(hose.position).normalize();
      hose.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    }
    water.visible = selectedClips.player === 'spray'; water.rotation.z = now * .002;
  }
  const selectedModel = models.find((m) => m.id === selected);
  if (selectedModel && clip.id === 'advance' && playing && (!combatEnabled || !bossTurning)) {
    for (const contact of walkContacts(lastFootTime / BOSS_WALK.duration, clockTime / BOSS_WALK.duration)) {
      const foot = selectedModel.gltf.scene.getObjectByName('mixamorig' + contact.side + 'Foot');
      footfalls.land(foot.getWorldPosition(new THREE.Vector3()));
      if ($('footstep-sound').checked) playFootfall(footAudio, footAudio?.destination, .65);
    }
  }
  const previousFootTime = lastFootTime; lastFootTime = clockTime;
  const spellId = clip.id === 'agent_cast' ? 'agent_swarm' : Object.keys(SPELLS).find(id => SPELLS[id].clip === clip.id);
  if (spellId && selectedModel && !(combatEnabled && bossTurning)) {
    const target = combatEnabled ? playerPosition.clone() : selectedModel.group.position.clone().add(new THREE.Vector3(0, 0, 5));
    const cycleKey = selectedModel.id + ':' + spellId + ':' + combatEpoch + ':' + Math.floor(clockTime / cycle);
    if (lastPreviewSpell !== cycleKey) { spellPreview.begin(spellId, target, selectedModel.group.rotation.y); lastPreviewSpell = cycleKey; }
    const hand = name => selectedModel.gltf.scene.getObjectByName('mixamorig' + name).getWorldPosition(new THREE.Vector3());
    const origin = hand('RightHand'); if (spellId === 'yc_beam') origin.lerp(hand('LeftHand'), .5);
    if (spellId === 'giant_stomp' && playing && cursor >= STOMP.impact && (previousFootTime % cycle < STOMP.impact || Math.floor(previousFootTime / cycle) !== Math.floor(clockTime / cycle)) && $('footstep-sound').checked) playStompImpact(footAudio, footAudio?.destination, .7);
    spellPreview.update(cursor, origin, selectedModel.group.rotation.y, target, spellId === 'giant_stomp' ? selectedModel.stompContact.clone().applyMatrix4(selectedModel.group.matrixWorld).setY(0) : selectedModel.group.position);
  } else { spellPreview.clear(); lastPreviewSpell = null; }
  const hitAt = clip.impacts ? [...clip.impacts].reverse().find((at) => cursor >= at) ?? Infinity : clip.id === 'slam' ? 1.02 : .90;
  impact.visible = selectedModel && !(combatEnabled && bossTurning) && ['slam', 'stomp', 'charge', 'jump_slam'].includes(clip.id) && cursor >= hitAt && cursor < hitAt + .53;
  if (impact.visible) {
    const age = (cursor - hitAt) / .53;
    const footSide = clip.id === 'charge' ? (clip.impacts.indexOf(hitAt) % 2 ? .5 : -.5) : clip.id === 'stomp' ? -.5 : 0;
    const offset = new THREE.Vector3(footSide, 0, clip.id === 'slam' ? 1.6 : 1.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), selectedModel.group.rotation.y);
    impact.position.copy(selectedModel.group.position).add(offset); impact.position.y = .015; impact.scale.setScalar(1.5 + age * 8); impact.material.opacity = .6 * (1 - age);
  }
  capsuleDrawings.forEach((drawing) => { drawing.group.visible = false; });
  const hurt = { start: [playerPosition.x, .30, playerPosition.z], end: [playerPosition.x, 1.53, playerPosition.z], radius: .30 };
  if (combatEnabled && $('hitboxes').checked) drawCapsule(0, hurt, fight.invulnerable ? 0x8bdde0 : 0xc6e986);
  if (spellId && combatEnabled && playing && !bossTurning) {
    for (const volume of spellPreview.hitboxes(cursor)) {
      if (spellTouches(volume, hurt)) fight.hit(`${combatEpoch}:${lastCycle}:spell:${volume.id}`, SPELLS[spellId].damage);
      if ($('hitboxes').checked && volume.kind !== 'cone') drawCapsule(volume.id + 1, volume, 0xf6a476);
    }
  }
  const attack = ATTACKS[clip.id];
  if (previousHitboxes.size > 16) previousHitboxes.clear();
  if (attack && selectedModel && !(combatEnabled && bossTurning)) attack.windows.forEach((window, index) => {
    const id = `${combatEpoch}:${combatEnabled ? lastCycle : Math.floor(clockTime / cycle)}:${clip.id}:${index}`;
    if (cursor < window.start || cursor >= window.end) { previousHitboxes.delete(id); return; }
    const points = window.bones.map((name) => selectedModel.gltf.scene.getObjectByName('mixamorig' + name).getWorldPosition(new THREE.Vector3()).toArray());
    const capsule = { start: points[0], end: points[1], radius: window.radius };
    if ($('hitboxes').checked) drawCapsule(index + 1, capsule, 0xf6a476);
    if (combatEnabled && playing) {
      const previous = previousHitboxes.get(id);
      const touching = capsulesTouch(capsule, hurt) || (previous && capsulesTouch({ start: previous.end, end: capsule.end, radius: capsule.radius }, hurt));
      if (touching) fight.hit(id, attack.damage);
    }
    previousHitboxes.set(id, capsule);
  });
  if (combatEnabled) {
    $('health').value = fight.health; $('health-text').textContent = `${fight.health} / 100`;
    const states = { ready: 'READY', rolling: 'ROLLING', knockedDown: 'KNOCKED DOWN', gettingUp: 'GETTING UP', dead: 'DEFEATED' };
    $('combat-state').textContent = `${states[fight.state]} · ${fight.invulnerable ? 'INVULNERABLE' : 'VULNERABLE'}${fight.bufferedRoll ? ' · ROLL QUEUED' : ''}`;
    $('death').hidden = fight.state !== 'dead';
    const target = new THREE.Vector3().copy(bossOrigin).lerp(playerPosition, .35); target.y = clip.id === 'jump_slam' ? 3.4 : 2.0;
    const shift = target.sub(controls.target).multiplyScalar(.045); controls.target.add(shift); camera.position.add(shift);
  }
  controls.update(); renderer.render(scene, camera);
}
requestAnimationFrame(draw);
