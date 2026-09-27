import * as T from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Water } from './water.js';

const RENDER_DELAY_MS = 100, BUFFER = 30, WHITE = new T.Color(1, 1, 1);
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// Teammates in a co-op fight: tinted Linglong clones driven by relayed snapshots,
// rendered slightly in the past so movement stays smooth between packets.
export class RemotePlayers {
  constructor({ scene, camera, source, instantiate, pose, tagLayer }) {
    Object.assign(this, { scene, camera, source, instantiate, pose, tagLayer });
    this.peers = new Map(); this.visible = false; this.viewport = [innerHeight, 1];
    this.clips = new Set(source.gltf.animations.map((clip) => clip.name));
    this.head = new T.Vector3(); this.origin = new T.Vector3(); this.velocity = new T.Vector3();
  }
  setRoster(players, selfId) {
    const keep = new Set();
    for (const info of players) {
      if (info.id === selfId) continue;
      keep.add(info.id);
      const peer = this.peers.get(info.id);
      if (peer) { peer.info = info; peer.label.textContent = info.name; }
      else this.peers.set(info.id, this.create(info));
    }
    for (const id of [...this.peers.keys()]) if (!keep.has(id)) this.remove(id);
  }
  create(info) {
    const scene3d = cloneSkinned(this.source.gltf.scene), tint = new T.Color(info.color).lerp(WHITE, .55);
    scene3d.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(tint); } });
    const model = this.instantiate(scene3d, this.source.gltf.animations);
    model.group.visible = false;
    const tag = document.createElement('div'), label = document.createElement('span'), bar = document.createElement('i'), fill = document.createElement('b');
    tag.className = 'name-tag'; tag.style.setProperty('--tag-color', info.color); label.textContent = info.name;
    bar.append(fill); tag.append(label, bar); tag.hidden = true; this.tagLayer.append(tag);
    const water = new Water(this.scene, { capacity: 1200, emissionScale: .5 }); water.resize(...this.viewport);
    return { info, model, water, buffer: [], tag, label, fill };
  }
  resize(height, pixelRatio) {
    this.viewport = [height, pixelRatio];
    for (const peer of this.peers.values()) peer.water.resize(height, pixelRatio);
  }
  push(id, state) {
    const peer = this.peers.get(id); if (!peer) return;
    peer.buffer.push({ at: performance.now(), s: state });
    if (peer.buffer.length > BUFFER) peer.buffer.shift();
  }
  gone(id) { const peer = this.peers.get(id); if (peer) peer.buffer.length = 0; }
  remove(id) {
    const peer = this.peers.get(id); if (!peer) return;
    this.scene.remove(peer.model.group); peer.water.dispose(); peer.tag.remove();
    peer.model.group.traverse((o) => { if (o.isMesh) o.material.dispose(); });
    this.peers.delete(id);
  }
  positionOf(id) { const peer = this.peers.get(id); return peer?.model.group.visible ? peer.model.group.position : null; }
  alivePosition() {
    for (const peer of this.peers.values()) if (peer.model.group.visible && (peer.buffer.at(-1)?.s.h ?? 0) > 0) return peer.model.group.position;
    return null;
  }
  clear() { for (const id of [...this.peers.keys()]) this.remove(id); }
  setVisible(visible) {
    this.visible = visible;
    for (const peer of this.peers.values()) { if (!visible) { peer.model.group.visible = false; peer.tag.hidden = true; peer.water.stop(); } peer.buffer.length = 0; }
  }
  sample(buffer, at) {
    if (!buffer.length) return null;
    let i = buffer.length - 1; while (i > 0 && buffer[i - 1].at > at) i--;
    const b = buffer[i], a = buffer[i - 1];
    if (!a || at >= b.at) return { s: b.s, k: 1, a: b.s };
    return { s: b.s, a: a.s, k: Math.max(0, Math.min(1, (at - a.at) / Math.max(1, b.at - a.at))) };
  }
  update(dt, now) {
    if (!this.visible) return;
    const at = now - RENDER_DELAY_MS;
    for (const peer of this.peers.values()) {
      const snap = this.sample(peer.buffer, at), group = peer.model.group;
      if (!snap) { group.visible = false; peer.tag.hidden = true; peer.water.stop(); peer.water.update(dt); continue; }
      const { a, s, k } = snap;
      group.visible = true;
      group.position.set(a.p[0] + (s.p[0] - a.p[0]) * k, a.p[1] + (s.p[1] - a.p[1]) * k, a.p[2] + (s.p[2] - a.p[2]) * k);
      group.rotation.y = lerpAngle(a.r, s.r, k);
      const clip = this.clips.has(s.c) ? s.c : 'ready', sameClip = a.c === s.c && s.t >= a.t;
      this.pose(peer.model, clip, sameClip ? a.t + (s.t - a.t) * k : s.t);
      if (s.w) { this.origin.fromArray(s.w.o); this.velocity.fromArray(s.w.v); peer.water.setStream(this.origin, this.velocity, s.w.m, s.w.e); }
      else peer.water.stop();
      peer.water.update(dt);
      this.head.copy(group.position); this.head.y += 2.15; this.head.project(this.camera);
      const onScreen = this.head.z < 1 && Math.abs(this.head.x) < 1.1 && Math.abs(this.head.y) < 1.1;
      peer.tag.hidden = !onScreen;
      if (onScreen) peer.tag.style.transform = `translate(${(this.head.x * .5 + .5) * innerWidth}px, ${(-this.head.y * .5 + .5) * innerHeight}px) translate(-50%, -100%)`;
      peer.fill.style.width = `${s.h}%`;
      peer.tag.classList.toggle('down', s.h <= 0);
    }
  }
}
