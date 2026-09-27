import * as T from 'three';
import { STOMP, stompArrival, stompFront } from './stomp.js';

const clamp = T.MathUtils.clamp;
const random = index => { const n = Math.sin(index * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
const smooth = value => { const p = clamp(value, 0, 1); return p * p * (3 - 2 * p); };

export const STOMP_SPIKES = Object.freeze([.70, 2.20, 3.70, 5.20, 6.70, 8.20, 9.40].flatMap((radius, row) => {
  const count = [3, 3, 5, 5, 7, 7, 9][row];
  return Array.from({ length: count }, (_, column) => {
    const seed = row * 31 + column, angle = (column / (count - 1) * 2 - 1) * (row === 0 ? .30 : .49);
    const r = radius + (random(seed + 1) - .5) * .12;
    return Object.freeze({ radius: r, x: Math.sin(angle) * r, z: Math.cos(angle) * r,
      at: stompArrival(r), angle, yaw: angle + (random(seed + 2) - .5) * .65,
      width: Math.min(.24 + random(seed + 3) * .15, r * Math.sin(STOMP.halfAngle - Math.abs(angle)) * .80),
      height: (row === 0 ? .7 : 1.35) + random(seed + 4) * .95 + (1 - Math.abs(angle)) * .3 });
  });
}));

export function spikeState(spike, time) {
  const age = time - spike.at;
  const rise = smooth(age / .055), sink = smooth((age - .52) / .50);
  return { visible: age >= 0 && sink < 1, rise, sink, age };
}

function rockGeometry() {
  const vertices = [], faces = [], sides = 7;
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < sides; i++) {
    const theta = i / sides * Math.PI * 2, radius = (ring ? .62 : 1) * (.82 + random(i * 9) * .30);
    vertices.push(Math.cos(theta) * radius + ring * .10, ring * (.43 + random(i + 7) * .12), Math.sin(theta) * radius + ring * .12);
  }
  vertices.push(.12, 1, .25);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push(i, j, sides + i, j, sides + j, sides + i, sides + i, sides + j, sides * 2);
  }
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geometry.setIndex(faces);
  const flat = geometry.toNonIndexed(); flat.computeVertexNormals(); geometry.dispose(); return flat;
}

function crackGeometry() {
  const vertices = [];
  for (let ray = 0; ray < 9; ray++) {
    const angle = (ray / 8 * 2 - 1) * .54;
    let previous = new T.Vector3(Math.sin(angle) * .3, 0, Math.cos(angle) * .3);
    for (let step = 1; step <= 13; step++) {
      const r = step / 13 * 9.8, theta = angle + (random(ray * 21 + step) - .5) * .08;
      const next = new T.Vector3(Math.sin(theta) * r, 0, Math.cos(theta) * r);
      const side = next.clone().sub(previous).cross(new T.Vector3(0, 1, 0)).normalize().multiplyScalar(.024 + random(step + ray) * .037);
      const a = previous.clone().add(side), b = previous.clone().sub(side), c = next.clone().add(side), d = next.clone().sub(side);
      for (const p of [a, b, c, b, d, c]) vertices.push(...p.toArray()); previous = next;
    }
  }
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); return geometry;
}

export class StompRocks {
  constructor(parent) {
    this.group = new T.Group(); parent.add(this.group); this.group.visible = false;
    this.dummy = new T.Object3D();
    this.spikes = new T.InstancedMesh(rockGeometry(), new T.MeshStandardMaterial({ color: 0xffffff, roughness: .97, flatShading: true }), STOMP_SPIKES.length);
    this.spikes.castShadow = true; this.spikes.receiveShadow = true; this.spikes.frustumCulled = false;
    this.spikes.instanceMatrix.setUsage(T.DynamicDrawUsage); this.group.add(this.spikes);
    STOMP_SPIKES.forEach((_, i) => this.spikes.setColorAt(i, new T.Color().setHSL(.095, .09, .26 + random(i + 13) * .20)));
    // Each eruption throws coarse stone, pale tile chips and smaller gravel.
    this.fragments = STOMP_SPIKES.flatMap((spike, i) => Array.from({ length: 6 }, (_, j) => this.fragment(i * 6 + j, spike.x, spike.z, spike.at)));
    for (let i = 0; i < 54; i++) this.fragments.push(this.fragment(400 + i, 0, 0, STOMP.impact, 1.25));
    this.gravel = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({ color: 0xffffff, roughness: .9, flatShading: true }), this.fragments.length);
    this.gravel.instanceMatrix.setUsage(T.DynamicDrawUsage); this.gravel.frustumCulled = false; this.group.add(this.gravel);
    this.fragments.forEach((f, i) => this.gravel.setColorAt(i, new T.Color(f.tile ? 0xc7c4b6 : 0x605c53).multiplyScalar(.7 + random(i + 25) * .5)));
    this.cracks = new T.Mesh(crackGeometry(), new T.ShaderMaterial({
      uniforms: { front: { value: 0 }, opacity: { value: 1 }, active: { value: 0 } }, transparent: true, depthWrite: false, side: T.DoubleSide,
      vertexShader: 'varying float radius; void main(){radius=length(position.xz);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform float front;uniform float opacity;uniform float active;varying float radius;void main(){if(radius>front)discard;float glow=active*(1.0-smoothstep(0.0,1.6,front-radius));vec3 color=mix(vec3(.018,.014,.01),vec3(.95,.43,.11),glow);gl_FragColor=vec4(color,opacity);}',
    })); this.cracks.position.y = .045; this.group.add(this.cracks);
    this.puffs = STOMP_SPIKES.filter((_, i) => i % 2 === 0).flatMap((s, i) => [0, 1].map(j => ({ x: s.x, z: s.z, at: s.at, seed: i * 2 + j })))
      .concat(Array.from({ length: 8 }, (_, i) => ({ x: Math.cos(i) * .4, z: Math.sin(i) * .4, at: STOMP.impact, seed: i + 80 })));
    const dustGeometry = new T.PlaneGeometry(1, 1);
    this.dustAlpha = new T.InstancedBufferAttribute(new Float32Array(this.puffs.length), 1); this.dustAlpha.setUsage(T.DynamicDrawUsage); dustGeometry.setAttribute('aOpacity', this.dustAlpha);
    this.dust = new T.InstancedMesh(dustGeometry, new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      vertexShader: 'attribute float aOpacity;varying vec2 vUv;varying float opacity;void main(){vUv=uv;opacity=aOpacity;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*center;}',
      fragmentShader: 'varying vec2 vUv;varying float opacity;void main(){float r=length(vUv*2.-1.);float alpha=exp(-3.5*r*r)*(1.-smoothstep(.7,1.,r))*opacity;if(alpha<.003)discard;gl_FragColor=vec4(vec3(.56,.53,.47),alpha);}',
    }), this.puffs.length); this.dust.frustumCulled = false; this.dust.instanceMatrix.setUsage(T.DynamicDrawUsage); this.group.add(this.dust);
  }
  fragment(seed, x, z, at, boost = 1) {
    const angle = random(seed + 31) * Math.PI * 2, speed = (1 + random(seed + 41) * 3.6) * boost;
    return { x: x + Math.cos(angle) * .18, z: z + Math.sin(angle) * .18, at,
      vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: (3.2 + random(seed + 71) * 4.2) * boost,
      size: .035 + random(seed + 91) ** 2 * .15, tile: seed % 4 === 0, spin: seed * .6 };
  }
  reset() { this.group.visible = false; }
  put(mesh, index, position, scale, rotation) {
    this.dummy.position.set(...position); this.dummy.scale.set(...scale); this.dummy.rotation.set(...rotation);
    this.dummy.updateMatrix(); mesh.setMatrixAt(index, this.dummy.matrix);
  }
  update(time, origin, facing) {
    this.group.visible = time >= STOMP.impact && time < STOMP.duration;
    if (!this.group.visible) return;
    this.group.position.copy(origin).setY(0); this.group.rotation.y = facing;
    for (const [i, spike] of STOMP_SPIKES.entries()) {
      const state = spikeState(spike, time), height = state.visible ? spike.height * state.rise : 0;
      this.put(this.spikes, i, [spike.x, -.035 - spike.height * state.sink, spike.z], [spike.width, height, spike.width * .8], [0, spike.yaw, 0]);
    }
    for (const [i, f] of this.fragments.entries()) {
      const age = time - f.at, fade = 1 - smooth((age - 1.0) / .5), size = age >= 0 ? f.size * fade : 0;
      const t = Math.max(0, age), flight = (f.vy + Math.sqrt(f.vy * f.vy + 2 * 14 * .08)) / 14;
      const after = Math.max(0, t - flight);
      const y = t < flight ? .08 + f.vy * t - 7 * t * t : Math.max(.025, f.vy * .22 * after - 7 * after * after);
      const travel = t < flight ? t : flight + (1 - Math.exp(-after * 4)) / 4;
      this.put(this.gravel, i, [f.x + f.vx * travel, y, f.z + f.vz * travel], [size, size * (f.tile ? .22 : .85), size * 1.2], [f.spin + t * 7, f.spin * .4 + t * 4, t * 9]);
    }
    for (const [i, puff] of this.puffs.entries()) {
      const age = time - puff.at, active = age >= 0 && age < 1.2, radius = active ? .55 + age * (1.2 + random(puff.seed) * .6) : 0;
      const angle = random(puff.seed + 28) * Math.PI * 2, drift = Math.max(0, age) * .65;
      this.put(this.dust, i, [puff.x + Math.cos(angle) * drift, .18 + Math.max(0, age) * .8, puff.z + Math.sin(angle) * drift], [radius * 1.4, radius, 1], [0, 0, 0]);
      this.dustAlpha.setX(i, active ? .28 * Math.sin(Math.PI * age / 1.2) : 0);
    }
    this.cracks.material.uniforms.front.value = stompFront(time);
    this.cracks.material.uniforms.active.value = time <= STOMP.waveEnd ? 1 : 0;
    this.cracks.material.uniforms.opacity.value = .9 * (1 - smooth((time - 2) / .6));
    for (const mesh of [this.spikes, this.gravel, this.dust]) mesh.instanceMatrix.needsUpdate = true;
    this.dustAlpha.needsUpdate = true;
  }
}
