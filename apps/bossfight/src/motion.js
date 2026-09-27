import { Vector3, Quaternion, Euler, Matrix4, MathUtils } from 'three';
import { BOSS_WALK, walkLeg } from './boss-walk.js';
import { STOMP, stompPose } from './stomp.js';

export const CLIPS = {
  player: [
    { id: 'ready', name: 'Hose ready', duration: 2.4, loop: true, note: 'Steady hands, breathing, weight in the knees.' },
    { id: 'jog_forward', name: 'Jog forward', duration: .8, loop: true, note: 'Two-beat run cycle with a stable hose grip.' },
    { id: 'jog_backward', name: 'Jog backward', duration: .8, loop: true, note: 'Short retreating steps. Aim stays forward.' },
    { id: 'jog_left', name: 'Strafe left', duration: .8, loop: true, note: 'Lateral footwork with shoulders facing the target.' },
    { id: 'jog_right', name: 'Strafe right', duration: .8, loop: true, note: 'Lateral footwork with shoulders facing the target.' },
    { id: 'dodge', name: 'Dodge roll', duration: .8, loop: false, phases: [.12, .54], note: 'Quick tuck, shoulder roll, then back onto both feet.' },
    { id: 'spray', name: 'Brace & spray', duration: 1.2, loop: true, note: 'Subtle pressure in the shoulders; hands stay on the nozzle.' },
    { id: 'hit', name: 'Take a hit', duration: .6, loop: false, phases: [.08, .18], note: 'Sharp recoil, a stagger, then recover the grip.' },
    { id: 'knockdown', name: 'Knocked down', duration: .9, loop: false, note: 'Lose balance, fall backward, and land on the ground. Protected.' },
    { id: 'getup', name: 'Get back up', duration: 1.25, loop: false, note: 'Recover from the ground. Protected until control returns.' },
  ],
  boss: [
    { id: 'idle', name: 'Bad attitude', duration: 2.4, loop: true, note: 'Heavy breathing and a hunched, threatening guard.' },
    { id: 'advance', name: 'Heavy walk', duration: BOSS_WALK.duration, loop: true, contacts: [{ time: 0, side: 'Left' }, { time: BOSS_WALK.duration / 2, side: 'Right' }], note: 'Planted heels, rolling weight, relaxed elbows. Left leg / right arm forward, then reverse.' },
    { id: 'turn_left', name: 'Turn left', duration: .9, loop: true, note: 'Short turning steps. The controller rotates the boss to face you.' },
    { id: 'turn_right', name: 'Turn right', duration: .9, loop: true, note: 'Short turning steps. Attacks wait until the boss is facing you.' },
    { id: 'sweep', name: 'Low sweeping swat', duration: 2.1, loop: false, phases: [.75, 1.08], note: 'Crouch down → rake across player height → recover slowly.' },
    { id: 'slam', name: 'Double-fist slam', duration: 2.2, loop: false, phases: [.85, 1.15], note: 'Hands overhead → ground impact → long recovery.' },
    { id: 'kick', name: 'Get-away kick', duration: 1.8, loop: false, phases: [.60, .92], note: 'Lift the knee → kick forward at the small player → plant.' },
    { id: 'stomp', name: 'Crushing stomp', duration: 1.9, loop: false, phases: [.70, .98], note: 'Raise one foot → stomp the ground ahead → shift back.' },
    { id: 'charge', name: 'Stampeding charge', duration: 3.1, loop: false, phases: [.65, 1.93], impacts: [1.05, 1.45, 1.85], note: 'Lean in → three heavy stomping steps → brake and recover.' },
    { id: 'jump_slam', name: 'Superman slam', duration: 3.4, loop: false, phases: [.60, 1.60], impacts: [1.45], note: 'Jump high → fists-first dive → full-body landing → get up.' },
    { id: 'yc_charge', name: 'YC rejection charge', duration: 4.4, loop: false, phases: [2.85, 3.4], note: 'Deep crouch, gathering light between the hands, then a huge committed blast.' },
    { id: 'agent_cast', name: 'Deploy agents', duration: 4.4, loop: false, phases: [1.35, 3.21], note: 'Raise a casting arm and command the marked swarm drops.' },
    { id: 'giant_stomp', name: 'Deadline stomp', duration: STOMP.duration, loop: false, phases: [STOMP.impact, STOMP.waveEnd], impacts: [STOMP.impact], note: 'Brace on the left leg → chamber the right knee → drive the heel down → rock spikes tear through the marked cone.' },
    { id: 'stagger', name: 'Water stagger', duration: .85, loop: false, phases: [.1, .25], note: 'Recoil from a face full of water, then regain composure.' },
    { id: 'clean_victory', name: 'Freshly washed', duration: 3.6, loop: false, note: 'Inspect clean hands, admire the jacket, strike a proud pose.' },
  ],
};

const clamp = MathUtils.clamp;
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = MathUtils.lerp;
const normalizedName = (name) => name.replace(/[^a-zA-Z0-9]/g, '').replace(/^mixamorig/, '');

// World-space two-bone IK makes each authored pose work with the three different
// Tripo rest orientations. The original bind pose and skin weights stay intact.
export class MotionRig {
  constructor(root, height, kind) {
    this.root = root; this.height = height; this.kind = kind; this.bones = {};
    root.traverse((o) => { if (o.isBone) this.bones[normalizedName(o.name)] = o; });
    this.rest = new Map();
    root.updateMatrixWorld(true);
    for (const bone of Object.values(this.bones)) this.rest.set(bone, {
      position: bone.position.clone(), quaternion: bone.quaternion.clone(),
      world: bone.getWorldQuaternion(new Quaternion()), point: bone.getWorldPosition(new Vector3()),
    });
    this.origin = this.rest.get(this.bones.Hips).point.clone();
    this.origin.y = 0;
    this.feet = {};
    for (const side of ['Left', 'Right']) this.feet[side] = this.rest.get(this.bones[side + 'Foot']).point.clone();
  }

  point(x, y, z) { return new Vector3(x * this.height + this.origin.x, y * this.height, z * this.height + this.origin.z); }
  reset() {
    this.groundLift = 0;
    for (const [bone, rest] of this.rest) { bone.position.copy(rest.position); bone.quaternion.copy(rest.quaternion); }
    this.root.updateMatrixWorld(true);
  }
  rotate(name, x = 0, y = 0, z = 0) {
    const bone = this.bones[name]; if (!bone) return;
    const world = bone.getWorldQuaternion(new Quaternion());
    world.premultiply(new Quaternion().setFromEuler(new Euler(x, y, z, 'YXZ')));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world));
    bone.updateMatrixWorld(true);
  }
  orient(bone, restDirection, restNormal, direction, normal) {
    // A complete joint frame avoids the 180-degree roll flip produced by
    // shortest-arc rotation when a sweeping arm passes across the torso.
    const restFrame = new Matrix4().makeBasis(restDirection, restNormal.clone().cross(restDirection).normalize(), restNormal);
    const frame = new Matrix4().makeBasis(direction, normal.clone().cross(direction).normalize(), normal);
    const q = new Quaternion().setFromRotationMatrix(frame.multiply(restFrame.invert())).multiply(this.rest.get(bone).world);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(q));
    bone.quaternion.normalize();
    bone.updateMatrixWorld(true);
  }
  limb(upperName, lowerName, endName, target, pole) {
    const upper = this.bones[upperName], lower = this.bones[lowerName], end = this.bones[endName];
    const start = upper.getWorldPosition(new Vector3());
    const l1 = start.distanceTo(lower.getWorldPosition(new Vector3()));
    const l2 = lower.getWorldPosition(new Vector3()).distanceTo(end.getWorldPosition(new Vector3()));
    const direction = target.clone().sub(start);
    const distance = clamp(direction.length(), Math.abs(l1 - l2) + .00001, l1 + l2 - .00001);
    direction.normalize();
    const bend = pole.clone().sub(start); bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
    const knee = start.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
    const finish = start.clone().addScaledVector(direction, distance);
    const upperDirection = knee.clone().sub(start).normalize();
    const lowerDirection = finish.clone().sub(knee).normalize();
    const restUpper = this.rest.get(lower).point.clone().sub(this.rest.get(upper).point).normalize();
    const restLower = this.rest.get(end).point.clone().sub(this.rest.get(lower).point).normalize();
    const restNormal = restUpper.clone().cross(restLower).normalize();
    if (restNormal.lengthSq() < .01) restNormal.crossVectors(restUpper, new Vector3(0, 0, 1)).normalize();
    const normal = upperDirection.clone().cross(lowerDirection).normalize();
    this.orient(upper, restUpper, restNormal, upperDirection, normal);
    this.orient(lower, restLower, restNormal, lowerDirection, normal);
  }
  foot(side, target, pitch = 0, yaw = 0, poleZ = .5) {
    this.limb(side + 'UpLeg', side + 'Leg', side + 'Foot', target, this.point(side === 'Left' ? .13 : -.13, .28, poleZ));
    const foot = this.bones[side + 'Foot'];
    const q = new Quaternion().setFromEuler(new Euler(pitch, yaw, 0)).multiply(this.rest.get(foot).world);
    foot.quaternion.copy(foot.parent.getWorldQuaternion(new Quaternion()).invert().multiply(q));
    foot.updateMatrixWorld(true);
  }
  hand(side, target, pole) {
    this.limb(side + 'Arm', side + 'ForeArm', side + 'Hand', target, pole);
  }
  curl(amount) {
    for (const side of ['Left', 'Right']) {
      // Curl around the across-palm axis, computed from the bind skeleton.
      const index = this.bones[side + 'HandIndex1'], pinky = this.bones[side + 'HandPinky1'];
      const across = this.rest.get(index).point.clone().sub(this.rest.get(pinky).point).normalize();
      for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) for (let joint = 1; joint <= 3; joint++) {
        const bone = this.bones[side + 'Hand' + finger + joint];
        if (!bone) continue;
        const axis = across.clone().applyQuaternion(this.rest.get(bone).world.clone().invert());
        bone.quaternion.multiply(new Quaternion().setFromAxisAngle(axis, (side === 'Left' ? -1 : 1) * amount * (joint === 1 ? .85 : 1.05)));
      }
    }
    this.root.updateMatrixWorld(true);
  }

  sample(id, time) {
    this.reset();
    const clip = CLIPS[this.kind].find((c) => c.id === id) || CLIPS[this.kind][0];
    const t = clamp(time, 0, clip.duration);
    if (this.kind === 'player') this.player(id, t); else this.boss(id, t);
    this.root.updateMatrixWorld(true);
  }

  body({ drop = .02, forward = .04, yaw = 0, roll = 0, shiftX = 0, shiftZ = 0, hipYaw = 0 } = {}) {
    const hip = this.bones.Hips;
    hip.position.y -= drop * this.height; hip.position.x += shiftX * this.height; hip.position.z += shiftZ * this.height;
    hip.updateMatrixWorld(true);
    this.rotate('Hips', 0, hipYaw, roll * .25);
    this.rotate('Spine', forward * .4, yaw * .35, roll * .35);
    this.rotate('Spine1', forward * .3, yaw * .3, roll * .2);
    this.rotate('Spine2', forward * .3, yaw * .35, roll * .2);
    this.rotate('Head', -forward * .6, -yaw * .35, -roll * .5);
  }
  standingFeet(width = 0, zLeft = 0, zRight = 0) {
    for (const side of ['Left', 'Right']) {
      const foot = this.feet[side].clone(); foot.x += (side === 'Left' ? width : -width) * this.height;
      foot.z += (side === 'Left' ? zLeft : zRight) * this.height;
      this.foot(side, foot);
    }
  }
  gait(t, duration, direction, stride, lift, width = 0, blend = 1) {
    for (const [side, offset] of [['Left', 0], ['Right', .5]]) {
      const phase = (t / duration + offset) % 1;
      // Stance sweeps backward at constant speed; swing returns with an arc.
      const swing = phase >= .5;
      const p = swing ? (phase - .5) * 2 : phase * 2;
      const distance = swing ? lerp(-stride, stride, smooth(p)) : lerp(stride, -stride, p);
      const foot = this.feet[side].clone();
      foot.x += (direction[0] * distance + (side === 'Left' ? width : -width)) * this.height;
      foot.z += direction[1] * distance * this.height;
      foot.y += (swing ? Math.sin(p * Math.PI) * lift : 0) * this.height;
      const standing = this.feet[side].clone();
      standing.x += (side === 'Left' ? width : -width) * this.height;
      foot.lerp(standing, 1 - blend);
      this.foot(side, foot, (swing ? -.16 * Math.sin(p * Math.PI) : .08 * Math.sin(p * Math.PI)) * blend);
    }
  }
  hose(extra = 0) {
    this.hand('Right', this.point(.015, .635 + extra, .115), this.point(-.28, .53, .02));
    this.hand('Left', this.point(.015, .645 + extra, .19), this.point(.28, .53, .07));
    this.curl(.7);
  }
  guard(left = [.19, .59, .14], right = [-.19, .59, .14]) {
    this.hand('Left', this.point(...left), this.point(.38, .52, .02));
    this.hand('Right', this.point(...right), this.point(-.38, .52, .02));
    this.curl(.95);
  }
  posedArm(side, swing, elbow, spread = .25) {
    // Fixed forward elbow hinge, independent of an IK pole or hand target.
    const torsoYaw = this.bones.Spine2.getWorldQuaternion(new Quaternion())
      .multiply(this.rest.get(this.bones.Spine2).world.clone().invert());
    const sign = side === 'Left' ? 1 : -1;
    const upper = this.bones[side + 'Arm'], lower = this.bones[side + 'ForeArm'], hand = this.bones[side + 'Hand'];
    const upperDir = new Vector3(sign * spread, -Math.cos(swing), Math.sin(swing)).normalize().applyQuaternion(torsoYaw);
    const lowerDir = new Vector3(sign * spread * .72, -Math.cos(swing + elbow), Math.sin(swing + elbow)).normalize().applyQuaternion(torsoYaw);
    const normal = upperDir.clone().cross(lowerDir).normalize();
    const restUpper = this.rest.get(lower).point.clone().sub(this.rest.get(upper).point).normalize();
    const restLower = this.rest.get(hand).point.clone().sub(this.rest.get(lower).point).normalize();
    const restNormal = restUpper.clone().cross(restLower).normalize();
    this.orient(upper, restUpper, restNormal, upperDir, normal);
    this.orient(lower, restLower, restNormal, lowerDir, normal);
  }
  walkingArms(cycle, amount = 1) {
    for (const side of ['Left', 'Right']) {
      const leg = walkLeg(cycle, side), swing = -.43 * leg.z / BOSS_WALK.stride * amount;
      this.posedArm(side, swing, .24 + .09 * (swing / .43 + 1) / 2);
    }
    this.curl(.32);
  }
  player(id, t) {
    const wave = Math.sin(t / 2.4 * Math.PI * 2);
    if (id === 'knockdown' || id === 'getup') {
      const fall = id === 'knockdown' ? smooth((t - .12) / .60) : 1 - smooth(t / 1.25);
      const recoil = id === 'knockdown' ? Math.sin(Math.min(t / .3, 1) * Math.PI) : 0;
      this.body({ drop: .02 + .04 * fall, forward: -.25 * recoil + .10 * (1 - fall) });
      for (const side of ['Left', 'Right']) {
        const sign = side === 'Left' ? 1 : -1;
        const foot = this.feet[side].clone().lerp(this.point(sign * .10, .20, .10), fall);
        this.foot(side, foot);
        const hand = this.point(side === 'Left' ? .015 : .015, side === 'Left' ? .645 : .635, side === 'Left' ? .19 : .115).lerp(this.point(sign * .28, .47, .035), fall);
        this.hand(side, hand, this.point(sign * .35, .51, -.1));
      }
      this.curl(.5 * (1 - fall)); this.rotate('Hips', -Math.PI / 2 * fall); return;
    }
    if (id.startsWith('jog')) {
      const lateral = id === 'jog_left' || id === 'jog_right';
      const direction = id === 'jog_forward' ? [0, 1] : id === 'jog_backward' ? [0, -1] : id === 'jog_left' ? [1, 0] : [-1, 0];
      const stride = lateral ? .06 : id === 'jog_backward' ? .09 : .13;
      this.body({ drop: .023 + .012 * Math.cos(t / .8 * Math.PI * 4), forward: .12, roll: lateral ? -.045 * direction[0] : .02 * Math.sin(t / .8 * Math.PI * 2) });
      this.gait(t, .8, direction, stride, .085, lateral ? .035 : 0);
      this.hose(.006 * Math.sin(t / .8 * Math.PI * 4)); return;
    }
    if (id === 'dodge') {
      const tuck = t < .16 ? smooth(t / .16) : t < .53 ? 1 : 1 - smooth((t - .53) / .27);
      const spin = smooth((t - .12) / .44);
      this.body({ drop: .015 + .16 * tuck, forward: .14 });
      this.standingFeet(0, .03, -.04); this.hose();
      // Pull both knees toward the chest before rotating the whole body.
      for (const side of ['Left', 'Right']) {
        const foot = this.feet[side].clone().lerp(this.point(side === 'Left' ? .10 : -.10, .31, .08), tuck);
        this.foot(side, foot);
      }
      this.rotate('Spine', .45 * tuck); this.rotate('Head', .4 * tuck);
      this.rotate('Hips', Math.PI * 2 * spin);
      return;
    }
    if (id === 'hit') {
      const recoil = t < .1 ? smooth(t / .1) : 1 - smooth((t - .1) / .5);
      this.body({ drop: .02 + .035 * recoil, forward: -.38 * recoil, shiftZ: -.035 * recoil });
      this.standingFeet(0, .015, -.045 * recoil); this.hose(-.045 * recoil); return;
    }
    this.body({ drop: .02 + .002 * wave, forward: id === 'spray' ? .14 : .06, roll: .01 * wave });
    this.standingFeet(0, .03, -.035); this.hose(id === 'spray' ? .0025 * Math.sin(t / 1.2 * Math.PI * 8) : .002 * wave);
  }
  boss(id, t) {
    const wave = Math.sin(t / 2.4 * Math.PI * 2);
    if (id === 'turn_left' || id === 'turn_right') {
      const sign = id === 'turn_left' ? 1 : -1;
      this.body({ drop: .025 + .005 * Math.cos(t / .9 * Math.PI * 4), forward: .1, hipYaw: .06 * Math.sin(t / .9 * Math.PI * 2) });
      this.gait(t, .9, [sign, 0], .035, .055, .02); this.walkingArms(t / .9, .22); this.rotate('Head', .08, .15 * sign); return;
    }
    if (id === 'jump_slam') {
      const takeoff = .60, land = 1.45;
      const load = smooth(t / takeoff), flight = clamp((t - takeoff) / (land - takeoff), 0, 1);
      const recoverStart = 2.02, end = 3.4;
      const rise = smooth((t - recoverStart) / (end - recoverStart));
      const prone = smooth(flight / .70) * (1 - rise);
      this.body({ drop: .025 + .065 * load * (1 - smooth(flight / .25)) + .035 * prone, forward: (.12 + .12 * load * (1 - rise)) * (1 - prone) });
      for (const side of ['Left', 'Right']) {
        const sign = side === 'Left' ? 1 : -1;
        const foot = this.feet[side].clone(); foot.x += sign * .015 * this.height;
        this.foot(side, foot, -.15 * prone);
        this.posedArm(side, 2.60 * prone, .24, .12);
      }
      this.curl(.95);
      this.rotate('Head', -.2 * prone); this.rotate('Hips', Math.PI / 2 * prone);
      const airtime = flight > 0 && flight < 1 ? 4 * flight * (1 - flight) : 0;
      const since = Math.max(0, t - land);
      const bounce = t >= land && t < land + .65 ? .038 * Math.abs(Math.sin(since / .36 * Math.PI)) * Math.exp(-5 * since) : 0;
      this.groundLift = .85 * airtime + bounce;
      return;
    }
    if (id === 'yc_charge') {
      const crouch = smooth(t / .7) * (1 - smooth((t - 3.48) / .92));
      const release = smooth((t - 2.75) / .18) * (1 - smooth((t - 3.4) / .3));
      this.body({ drop: .025 + .14 * crouch, forward: .07 + .24 * crouch - .08 * release });
      this.standingFeet(.055, .018, -.018);
      for (const side of ['Left', 'Right']) this.posedArm(side, .68 * crouch + .30 * release, .27 + .70 * crouch - .38 * release, .20);
      this.curl(.40 + .3 * release); return;
    }
    if (id === 'agent_cast') {
      const cast = smooth(t / .6) * (1 - smooth((t - 3.3) / 1.1));
      this.body({ drop: .025 + .012 * cast, forward: .07, yaw: -.07 * cast });
      this.standingFeet(.02); this.posedArm('Right', 1.2 * cast, .27 + .3 * cast, .28);
      this.posedArm('Left', .25 * cast, .27 + .55 * cast, .25); this.curl(.22); return;
    }
    if (id === 'giant_stomp') {
      const p = stompPose(t);
      // Load the supporting leg first. Torso and arms counterbalance the raised
      // knee, then follow the heel into a short, visible compression/rebound.
      this.body({ drop: .025 + .028 * p.brace - .007 * p.chamber + .075 * p.compression + .025 * p.planted,
        forward: .10 - .065 * p.chamber + .24 * p.compression + .06 * p.planted,
        yaw: -.09 * p.chamber + .08 * p.compression, hipYaw: .045 * p.chamber,
        roll: -.045 * p.chamber + .025 * p.compression,
        shiftX: .052 * p.chamber - .018 * p.planted, shiftZ: -.018 * p.chamber + .045 * p.planted });
      this.standingFeet(.02);
      const rest = this.feet.Right.clone(), landing = rest.clone();
      landing.x += STOMP.stepOut * this.height; landing.z += STOMP.stepForward * this.height;
      const foot = rest.clone().lerp(this.point(-.095, .335, .115), p.lift).lerp(landing, p.strike).lerp(rest, p.recover);
      foot.y += .052 * p.returnLift * this.height;
      this.foot('Right', foot, -.30 * p.chamber - .09 * p.returnLift);
      this.posedArm('Left', .36 * p.chamber + .35 * p.compression + .12 * p.planted, .28 + .44 * p.chamber + .18 * p.compression, .29);
      this.posedArm('Right', -.32 * p.chamber + .56 * p.compression + .18 * p.planted, .28 + .30 * p.chamber + .18 * p.compression, .27);
      this.rotate('Head', .08 + .10 * p.chamber + .12 * p.compression);
      this.curl(.32 + .30 * p.chamber + .35 * p.compression); return;
    }
    if (id === 'advance') {
      const cycle = t / BOSS_WALK.duration, wave = Math.cos(cycle * Math.PI * 2);
      this.body({ drop: .036 + .009 * Math.cos(cycle * Math.PI * 4), forward: .065,
        yaw: -.055 * wave, hipYaw: .025 * wave, roll: -.018 * Math.sin(cycle * Math.PI * 2), shiftX: .012 * Math.sin(cycle * Math.PI * 2) });
      for (const side of ['Left', 'Right']) {
        const step = walkLeg(cycle, side), foot = this.feet[side].clone();
        foot.x += (side === 'Left' ? .012 : -.012) * this.height;
        foot.z += step.z * this.height; foot.y += step.lift * this.height;
        // Flat support foot; toe clears the floor in swing and settles at contact.
        this.foot(side, foot, step.swing ? -.16 * Math.sin(Math.PI * (step.phase - BOSS_WALK.stance) / (1 - BOSS_WALK.stance)) : 0);
      }
      this.walkingArms(cycle); return;
    }
    if (id === 'sweep') {
      const load = smooth(t / .75), strike = smooth((t - .75) / .33), recover = smooth((t - 1.32) / .78);
      const weight = 1 - recover;
      this.body({ drop: .025 + .255 * load * weight, forward: .10 + .90 * load * weight, yaw: (-.45 * load + .95 * strike) * weight, hipYaw: (-.10 * load + .20 * strike) * weight, shiftX: (-.03 * load + .06 * strike) * weight });
      this.standingFeet(.025 + .025 * load * weight, .015, -.015);
      const right = this.point(-.19, .59, .14).lerp(this.point(-.28, .21, .13), load).lerp(this.point(.23, .16, .32), strike).lerp(this.point(-.19, .59, .14), recover);
      this.hand('Right', right, this.point(-.04, .54, .20));
      this.hand('Left', this.point(.19, .59 - .31 * load * weight, .14 + .035 * load * weight), this.point(.40, .27, .06)); this.curl(.6); return;
    }
    if (id === 'slam') {
      const lift = smooth(t / .85), hit = smooth((t - .85) / .23), recover = smooth((t - 1.6) / .6);
      const active = 1 - recover;
      this.body({ drop: .025 - .015 * lift * (1 - hit) + .245 * hit * active, forward: .10 - .24 * lift * (1 - hit) + 1.35 * hit * active, shiftZ: .035 * hit * active });
      this.standingFeet(.045, -.01, -.01);
      for (const side of ['Left', 'Right']) {
        const sign = side === 'Left' ? 1 : -1;
        const hand = this.point(sign * .19, .59, .14).lerp(this.point(sign * .10, 1.015, .10), lift).lerp(this.point(sign * .10, .075, .30), hit).lerp(this.point(sign * .19, .59, .14), recover);
        this.hand(side, hand, this.point(sign * .32, lerp(.83, .34, hit), .10));
      }
      this.curl(.95); return;
    }
    if (id === 'kick') {
      const load = smooth(t / .60), strike = smooth((t - .60) / .24), retract = smooth((t - .95) / .32), plant = smooth((t - 1.24) / .56);
      const active = load * (1 - plant);
      this.body({ drop: .025 + .025 * active, forward: .10 - .23 * strike * (1 - retract), shiftX: .060 * active, roll: -.04 * active });
      this.standingFeet(.02);
      const rest = this.feet.Right.clone();
      const foot = rest.clone().lerp(this.point(-.09, .27, .15), load).lerp(this.point(-.09, .16, .34), strike).lerp(this.point(-.09, .24, .10), retract).lerp(rest, plant);
      this.foot('Right', foot, -.48 * strike * (1 - retract));
      this.guard([.19 + .055 * active, .59, .14], [-.19 - .04 * active, .59, .14 - .06 * strike * (1 - retract)]);
      this.rotate('Head', .22 * active); return;
    }
    if (id === 'stomp') {
      const load = smooth(t / .70), strike = smooth((t - .70) / .22), settle = smooth((t - 1.18) / .30), recover = smooth((t - 1.45) / .45);
      const active = 1 - recover;
      this.body({ drop: .025 + .035 * strike * active, forward: .10 + .20 * strike * active, shiftX: .055 * load * (1 - strike), shiftZ: .045 * strike * active });
      this.standingFeet(.02);
      const rest = this.feet.Right.clone();
      const floor = rest.clone(); floor.z += .20 * this.height;
      const foot = rest.clone().lerp(this.point(-.10, .31, .14), load).lerp(floor, strike).lerp(rest, recover);
      foot.y += .035 * Math.sin(recover * Math.PI) * this.height;
      this.foot('Right', foot, -.1 * load * (1 - strike));
      this.guard([.19 + .04 * load * active, .59 + .04 * load * (1 - strike), .14], [-.19 - .04 * load * active, .59 + .04 * load * (1 - strike), .14]);
      this.rotate('Head', .2 * load * (1 - settle)); return;
    }
    if (id === 'charge') {
      const load = smooth(t / .65), recover = smooth((t - 2.35) / .75);
      const active = load * (1 - recover);
      const pulse = [1.05, 1.45, 1.85].reduce((sum, at) => sum + .025 * Math.exp(-Math.pow((t - at) / .08, 2)), 0);
      this.body({ drop: .025 + .035 * active + pulse, forward: .10 + .30 * active, roll: t >= .65 && t < 1.9 ? .03 * Math.sin((t - .65) / .8 * Math.PI * 2) : 0 });
      if (t >= .65 && t < 2.05) this.gait(t - .65, .8, [0, 1], .12, .14, .025, smooth((t - .65) / .10) * (1 - smooth((t - 1.85) / .20)));
      else this.standingFeet(.025);
      this.guard([.20, .59 - .06 * active, .15], [-.20, .59 - .06 * active, .15]);
      this.rotate('Head', .20 * active); return;
    }
    if (id === 'stagger') {
      const hit = t < .14 ? smooth(t / .14) : 1 - smooth((t - .14) / .71);
      this.body({ drop: .03 + .035 * hit, forward: .10 - .43 * hit, yaw: -.2 * hit, shiftZ: -.025 * hit });
      this.standingFeet(.02, 0, -.06 * hit); this.guard([.19 + .07 * hit, .59 + .10 * hit, .14], [-.19 - .05 * hit, .59 + .13 * hit, .14]); return;
    }
    if (id === 'clean_victory') {
      const inspect = smooth(t / .8), admire = smooth((t - 1.55) / .75), proud = smooth((t - 2.5) / .7);
      this.body({ drop: .025 * (1 - proud), forward: .10 * (1 - proud), yaw: .05 * Math.sin(t * 3) * inspect * (1 - admire) });
      this.standingFeet(.02);
      this.rotate('Head', .38 * inspect * (1 - proud) - .12 * proud);
      for (const side of ['Left', 'Right']) {
        const sign = side === 'Left' ? 1 : -1;
        const hand = this.point(sign * .19, .59, .14).lerp(this.point(sign * .13, .76, .23), inspect).lerp(this.point(sign * .10, .57, .18), admire).lerp(this.point(sign * .15, .51, .045), proud);
        this.hand(side, hand, this.point(sign * .36, .58, .04));
      }
      this.curl(.2 * (1 - inspect) + .35 * proud); return;
    }
    this.body({ drop: .025 + .004 * wave, forward: .10 + .015 * wave, roll: .014 * wave });
    this.standingFeet(.02); this.walkingArms(0, 0);
    this.rotate('Head', .08);
  }
}
