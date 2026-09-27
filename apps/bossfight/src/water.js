import * as T from 'three';
import { waterPoint } from './cleaning.js';

export const HOSE = Object.freeze({ gravity: 5, shower: { speed: 38, range: 15 }, jet: { speed: 48, range: 23 } });
const UP = new T.Vector3(0, 1, 0), FORWARD = new T.Vector3(0, 0, 1);

// A continuous, turbulent water column supplies the weight of the hose. Moving
// droplets, short streaks and low-opacity mist supply breakup and speed.
export class Water {
  constructor(scene) {
    this.capacity = 2400; this.cursor = 0; this.emission = 0; this.splashEmission = 0; this.time = 0;
    this.flowing = false; this.tail = 0; this.flowAge = 0; this.mode = 'shower';
    this.origin = new T.Vector3(); this.velocity = new T.Vector3(); this.endTime = 0;
    this.particles = Array.from({ length: this.capacity }, () => ({ life: 0, ttl: 1, size: .04, mist: false, p: new T.Vector3(), v: new T.Vector3() }));
    this.positions = new Float32Array(this.capacity * 3); this.positions.fill(-999);
    this.sizes = new Float32Array(this.capacity); this.alphas = new Float32Array(this.capacity); this.trails = new Float32Array(this.capacity * 6); this.trails.fill(-999);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(this.positions, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('aSize', new T.BufferAttribute(this.sizes, 1).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new T.BufferAttribute(this.alphas, 1).setUsage(T.DynamicDrawUsage));
    this.pointMaterial = new T.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uScale: { value: 650 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vAlpha; uniform float uScale;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uScale/max(.2,-mv.z),1.0,90.0);vAlpha=aAlpha;}`,
      fragmentShader: `varying float vAlpha; void main(){float r=length(gl_PointCoord-.5)*2.0;if(r>1.0)discard;
        gl_FragColor=vec4(mix(vec3(.45,.81,.93),vec3(.93,.99,1.0),1.0-r),vAlpha*pow(1.0-r*r,1.5));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    this.mesh = new T.Points(geo, this.pointMaterial); this.mesh.frustumCulled = false; scene.add(this.mesh);
    const trailGeo = new T.BufferGeometry(); trailGeo.setAttribute('position', new T.BufferAttribute(this.trails, 3).setUsage(T.DynamicDrawUsage));
    this.streaks = new T.LineSegments(trailGeo, new T.LineBasicMaterial({ color: 0xc9f7ff, transparent: true, opacity: .34, depthWrite: false })); this.streaks.frustumCulled = false; scene.add(this.streaks);
    this.rings = 48; this.sides = 10;
    this.columnPositions = new Float32Array((this.rings + 1) * (this.sides + 1) * 3);
    this.centers = new Float32Array(this.columnPositions.length);
    const uvs = [], indices = [];
    for (let i = 0; i <= this.rings; i++) for (let j = 0; j <= this.sides; j++) {
      uvs.push(j / this.sides, i / this.rings);
      if (i < this.rings && j < this.sides) { const a = i * (this.sides + 1) + j, b = a + this.sides + 1; indices.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    const columnGeo = new T.BufferGeometry(); columnGeo.setAttribute('position', new T.BufferAttribute(this.columnPositions, 3).setUsage(T.DynamicDrawUsage));
    columnGeo.setAttribute('aCenter', new T.BufferAttribute(this.centers, 3).setUsage(T.DynamicDrawUsage)); columnGeo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); columnGeo.setIndex(indices);
    const material = (thickness, opacity) => new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { uTime: { value: 0 }, uThickness: { value: thickness }, uOpacity: { value: opacity }, uLength: { value: 1 } },
      vertexShader: `attribute vec3 aCenter; varying vec2 vUv; uniform float uThickness;
        void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(mix(aCenter,position,uThickness),1.0);}`,
      fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uOpacity; uniform float uLength;
        void main(){float travel=vUv.y*uLength;float vein=sin(vUv.x*37.7+sin(travel*9.0-uTime*35.0)*1.7);
          float pulse=sin(travel*30.0-uTime*110.0+vein*2.0)*.5+.5;float froth=smoothstep(.5,.98,pulse);
          vec3 color=mix(vec3(.22,.65,.84),vec3(.91,.98,1.0),.42+froth*.5);
          float edge=smoothstep(0.0,.018,vUv.y)*(1.0-smoothstep(.94,1.0,vUv.y));
          gl_FragColor=vec4(color,uOpacity*edge*(.67+.33*froth));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.column = new T.Mesh(columnGeo, material(1, .35)); this.column.frustumCulled = false; this.column.visible = false; scene.add(this.column);
    this.core = new T.Mesh(columnGeo, material(.38, .85)); this.core.frustumCulled = false; this.core.visible = false; scene.add(this.core);
    const foamGeo = new T.RingGeometry(.50, 1, 24);
    this.foam = Array.from({ length: 28 }, () => {
      const mesh = new T.Mesh(foamGeo, new T.MeshBasicMaterial({ color: 0xdffcff, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false })); mesh.visible = false; scene.add(mesh);
      return { mesh, life: 0, attachment: null, surface: null, size: .2 };
    });
    this.foamCursor = 0; this.foamClock = 0;
    this.tempPoint = new T.Vector3(); this.tangent = new T.Vector3(); this.axisA = new T.Vector3(); this.axisB = new T.Vector3();
  }
  resize(height, pixelRatio) { this.pointMaterial.uniforms.uScale.value = height * pixelRatio * .92; }
  spawn(point, velocity, life, size, mist = false) {
    const p = this.particles[this.cursor++ % this.capacity]; p.p.copy(point); p.v.copy(velocity); p.life = p.ttl = life; p.size = size; p.mist = mist;
  }
  setStream(origin, velocity, mode, endTime) {
    if (!this.flowing) this.flowAge = 0;
    this.flowing = true; this.tail = .13; this.origin.copy(origin); this.velocity.copy(velocity); this.mode = mode; this.endTime = endTime;
  }
  stop() { this.flowing = false; this.emission = 0; }
  reset() {
    for (const p of this.particles) p.life = 0;
    for (const foam of this.foam) { foam.life = 0; foam.mesh.visible = false; foam.attachment = null; }
    this.positions.fill(-999); this.trails.fill(-999); this.alphas.fill(0); this.sizes.fill(0);
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.aAlpha.needsUpdate = true; this.mesh.geometry.attributes.aSize.needsUpdate = true;
    this.streaks.geometry.attributes.position.needsUpdate = true;
    this.stop(); this.tail = 0; this.flowAge = 0; this.splashEmission = 0; this.foamClock = 0; this.column.visible = this.core.visible = false;
  }
  impact(hit, incoming, mode, dt, surface) {
    const normal = hit.face.normal.clone().normalize(); if (normal.dot(incoming) > 0) normal.negate();
    const a = new T.Vector3().crossVectors(normal, Math.abs(normal.y) > .9 ? FORWARD : UP).normalize(), b = new T.Vector3().crossVectors(normal, a).normalize();
    this.splashEmission += dt * (mode === 'jet' ? 440 : 620);
    while (this.splashEmission >= 1) {
      this.splashEmission--;
      const theta = Math.random() * Math.PI * 2, spread = 2 + Math.random() * 4.5;
      const direction = normal.clone().multiplyScalar(1.2 + Math.random() * 3).addScaledVector(a, Math.cos(theta) * spread).addScaledVector(b, Math.sin(theta) * spread);
      const point = hit.point.clone().addScaledVector(normal, .035);
      const mist = Math.random() < .22;
      this.spawn(point, direction.multiplyScalar(mist ? .4 : 1), .25 + Math.random() * .42, mist ? .25 + Math.random() * .3 : .035 + Math.random() * .035, mist);
    }
    this.foamClock += dt;
    if (this.foamClock >= .055) {
      this.foamClock = 0;
      const foam = this.foam[this.foamCursor++ % this.foam.length]; foam.life = .32; foam.size = mode === 'jet' ? .22 : .36;
      foam.surface = surface; foam.attachment = surface.attachment(hit); foam.mesh.visible = true;
    }
  }
  drawColumn() {
    const length = this.velocity.length() * Math.min(this.endTime, this.flowAge);
    const maxTime = Math.min(this.endTime, this.flowAge);
    const fading = this.flowing ? 1 : Math.max(0, this.tail / .13);
    this.column.visible = this.core.visible = length > .01 && fading > 0;
    if (!this.column.visible) return;
    const o = this.origin, v = this.velocity;
    for (let i = 0; i <= this.rings; i++) {
      const u = i / this.rings, t = maxTime * u;
      this.tempPoint.set(o.x + v.x * t, o.y + v.y * t - .5 * HOSE.gravity * t * t, o.z + v.z * t);
      this.tangent.set(v.x, v.y - HOSE.gravity * t, v.z).normalize();
      this.axisA.crossVectors(this.tangent, Math.abs(this.tangent.y) > .9 ? FORWARD : UP).normalize(); this.axisB.crossVectors(this.tangent, this.axisA).normalize();
      const radius = (this.mode === 'jet' ? .075 + .022 * u : .09 + length * .041 * u ** 1.7) * (1 + .12 * Math.sin(i * 1.8 - this.time * 57));
      for (let j = 0; j <= this.sides; j++) {
        const theta = j / this.sides * Math.PI * 2, k = (i * (this.sides + 1) + j) * 3;
        const x = Math.cos(theta) * radius, y = Math.sin(theta) * radius;
        this.centers.set(this.tempPoint.toArray(), k);
        this.columnPositions[k] = this.tempPoint.x + this.axisA.x * x + this.axisB.x * y;
        this.columnPositions[k + 1] = this.tempPoint.y + this.axisA.y * x + this.axisB.y * y;
        this.columnPositions[k + 2] = this.tempPoint.z + this.axisA.z * x + this.axisB.z * y;
      }
    }
    this.column.geometry.attributes.position.needsUpdate = true; this.column.geometry.attributes.aCenter.needsUpdate = true;
    for (const mesh of [this.column, this.core]) { mesh.material.uniforms.uTime.value = this.time; mesh.material.uniforms.uLength.value = length; }
    this.column.material.uniforms.uOpacity.value = (this.mode === 'jet' ? .45 : .2) * fading;
    this.core.material.uniforms.uOpacity.value = .82 * fading;
  }
  update(dt) {
    this.time += dt; this.flowAge += dt;
    if (!this.flowing) this.tail = Math.max(0, this.tail - dt);
    if (this.flowing) {
      this.emission += dt * (this.mode === 'jet' ? 720 : 1100);
      const speed = this.velocity.length(), spread = this.mode === 'jet' ? .016 : .12;
      while (this.emission >= 1) {
        this.emission--;
        const v = this.velocity.clone().add(new T.Vector3((Math.random() - .5) * speed * spread, (Math.random() - .5) * speed * spread, (Math.random() - .5) * speed * spread));
        const mist = Math.random() < .12;
        this.spawn(this.origin, v.multiplyScalar(mist ? .85 : 1), this.endTime * (.88 + Math.random() * .12), mist ? .12 : .04 + Math.random() * .03, mist);
      }
    }
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i]; p.life -= dt; const k = i * 3, j = i * 6;
      if (p.life > 0) {
        p.v.y -= (p.mist ? 2 : HOSE.gravity) * dt; p.p.addScaledVector(p.v, dt);
        if (p.p.y < .04) { p.p.y = .04; p.v.y = Math.abs(p.v.y) * .13; p.v.x *= .84; p.v.z *= .84; p.life = Math.min(p.life, .12); }
        this.positions.set(p.p.toArray(), k); this.sizes[i] = p.size * (p.mist ? 1 + 2 * (1 - p.life / p.ttl) : 1);
        this.alphas[i] = (p.mist ? .12 : .85) * Math.min(1, p.life * 7);
        if (!p.mist) { this.trails.set(p.p.toArray(), j); this.trails[j + 3] = p.p.x - p.v.x * .005; this.trails[j + 4] = p.p.y - p.v.y * .005; this.trails[j + 5] = p.p.z - p.v.z * .005; }
        else { this.trails[j + 1] = this.trails[j + 4] = -999; }
      } else { this.alphas[i] = 0; this.positions[k + 1] = -999; this.trails[j + 1] = this.trails[j + 4] = -999; }
    }
    for (const key of ['position', 'aSize', 'aAlpha']) this.mesh.geometry.attributes[key].needsUpdate = true;
    this.streaks.geometry.attributes.position.needsUpdate = true;
    for (const foam of this.foam) {
      foam.life -= dt; foam.mesh.visible = foam.life > 0;
      if (!foam.mesh.visible) continue;
      const normal = new T.Vector3(); foam.surface.resolveAttachment(foam.attachment, foam.mesh.position, normal);
      foam.mesh.position.addScaledVector(normal, .028); foam.mesh.quaternion.setFromUnitVectors(FORWARD, normal);
      foam.mesh.scale.setScalar(foam.size * (1 + (.32 - foam.life) * 3.5)); foam.mesh.material.opacity = .45 * foam.life / .32;
    }
    this.drawColumn();
  }
}

export function traceWater(surface, origin, velocity, maxTime) {
  const step = .025, start = origin.toArray(), speed = velocity.toArray(); let previous = origin.clone(), previousTime = 0;
  while (previousTime < maxTime) {
    const time = Math.min(previousTime + step, maxTime), point = new T.Vector3().fromArray(waterPoint(start, speed, HOSE.gravity, time));
    const hit = surface.cast(previous, point);
    if (hit) return { hit, time: previousTime + (time - previousTime) * Math.min(1, hit.distance / Math.max(.0001, previous.distanceTo(point))) };
    if (point.y < .035) return { hit: null, time: previousTime + (time - previousTime) * Math.max(0, (previous.y - .035) / (previous.y - point.y)) };
    previous.copy(point); previousTime = time;
  }
  return { hit: null, time: maxTime };
}
