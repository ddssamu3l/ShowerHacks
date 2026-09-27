import * as T from 'three';

// Cosmetic only: wet impacts, tile grit and shock rings never create hitboxes.
export class Footfalls {
  constructor(scene) {
    this.cursor = 0; this.particleCursor = 0;
    this.rings = Array.from({ length: 8 }, () => {
      const mesh = new T.Mesh(new T.RingGeometry(.83, 1, 48), new T.MeshBasicMaterial({ color: 0xc3e6e5, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.visible = false; scene.add(mesh);
      return { mesh, age: 1, power: 1 };
    });
    this.particles = Array.from({ length: 160 }, () => ({ p: new T.Vector3(), v: new T.Vector3(), age: 1, life: 0, size: 0 }));
    this.drops = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({ color: 0xbddee0, roughness: .3, metalness: .25 }), this.particles.length);
    this.drops.instanceMatrix.setUsage(T.DynamicDrawUsage); this.drops.frustumCulled = false;
    this.dummy = new T.Object3D(); scene.add(this.drops); this.reset();
  }
  land(position, power = 1) {
    const ring = this.rings[this.cursor++ % this.rings.length];
    ring.age = 0; ring.power = power; ring.mesh.position.copy(position).setY(.035); ring.mesh.visible = true;
    for (let i = 0; i < 26; i++) {
      const particle = this.particles[this.particleCursor++ % this.particles.length];
      const a = i * 2.39996 + Math.random() * .4, speed = (1.1 + Math.random() * 2.7) * power;
      particle.p.copy(position).setY(.06).add(new T.Vector3(Math.cos(a) * .18, 0, Math.sin(a) * .18));
      particle.v.set(Math.cos(a) * speed, (.8 + Math.random() * 2.1) * power, Math.sin(a) * speed);
      particle.age = 0; particle.life = .33 + Math.random() * .32; particle.size = (.018 + Math.random() * .043) * power;
    }
  }
  reset() {
    for (const ring of this.rings) { ring.age = 1; ring.mesh.visible = false; }
    for (const p of this.particles) p.age = 1;
    this.update(0);
  }
  update(dt) {
    for (const ring of this.rings) {
      ring.age += dt;
      ring.mesh.visible = ring.age < .55;
      if (!ring.mesh.visible) continue;
      const t = ring.age / .55;
      ring.mesh.scale.setScalar((.26 + t * 1.9) * ring.power);
      ring.mesh.material.opacity = .65 * (1 - t) ** 2;
    }
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]; p.age += dt;
      if (p.age >= p.life) { this.dummy.scale.setScalar(0); }
      else {
        p.v.y -= 9.8 * dt; p.p.addScaledVector(p.v, dt);
        if (p.p.y < .025) { p.p.y = .025; p.v.y = Math.abs(p.v.y) * .18; p.v.x *= .8; p.v.z *= .8; }
        this.dummy.position.copy(p.p); this.dummy.rotation.set(p.age * 7, i, p.age * 5);
        this.dummy.scale.set(p.size, p.size * 1.7, p.size);
        this.dummy.scale.multiplyScalar(Math.min(1, (p.life - p.age) * 8));
      }
      this.dummy.updateMatrix(); this.drops.setMatrixAt(i, this.dummy.matrix);
    }
    this.drops.instanceMatrix.needsUpdate = true;
  }
}

const noiseBuffers = new WeakMap();
export function playFootfall(context, output, strength = 1) {
  if (!context || !output) return;
  const now = context.currentTime;
  let buffer = noiseBuffers.get(context);
  if (!buffer) {
    buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .45), context.sampleRate);
    const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(context, buffer);
  }
  const rumble = context.createOscillator(), bass = context.createGain();
  rumble.frequency.setValueAtTime(105, now); rumble.frequency.exponentialRampToValueAtTime(27, now + .23);
  bass.gain.setValueAtTime(.001, now); bass.gain.linearRampToValueAtTime(.34 * strength, now + .009); bass.gain.exponentialRampToValueAtTime(.001, now + .43);
  rumble.connect(bass).connect(output); rumble.start(now); rumble.stop(now + .45);
  const crack = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
  crack.buffer = buffer; filter.type = 'lowpass'; filter.frequency.setValueAtTime(3800, now); filter.frequency.exponentialRampToValueAtTime(180, now + .3);
  gain.gain.setValueAtTime(.001, now); gain.gain.linearRampToValueAtTime(.30 * strength, now + .004); gain.gain.exponentialRampToValueAtTime(.001, now + .35);
  crack.connect(filter).connect(gain).connect(output); crack.start(now); crack.stop(now + .45);
  rumble.onended = () => { rumble.disconnect(); bass.disconnect(); };
  crack.onended = () => { crack.disconnect(); filter.disconnect(); gain.disconnect(); };
}

export function playStompImpact(context, output, strength = 1) {
  if (!context || !output) return;
  playFootfall(context, output, strength * 1.3);
  const buffer = noiseBuffers.get(context), now = context.currentTime;
  // Successive dry tile cracks carry the eruption outward after the heel lands.
  for (let i = 0; i < 7; i++) {
    const at = now + i * .067, source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = buffer; source.playbackRate.value = .7 + i * .11;
    filter.type = 'bandpass'; filter.frequency.value = 550 + i * 340; filter.Q.value = .65;
    gain.gain.setValueAtTime(.001, at); gain.gain.linearRampToValueAtTime(strength * .15 * (1 - i * .08), at + .003); gain.gain.exponentialRampToValueAtTime(.001, at + .22);
    source.connect(filter).connect(gain).connect(output); source.start(at); source.stop(at + .25);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
}
