import * as T from 'three';

export class BottlePickups {
  constructor(scene, supply) {
    this.supply = supply;
    this.group = new T.Group(); this.group.visible = false; scene.add(this.group);
    const plastic = new T.MeshPhysicalMaterial({ color: 0x8ae1ed, metalness: .05, roughness: .18, transparent: true, opacity: .7, clearcoat: 1, depthWrite: false });
    const liquid = new T.MeshStandardMaterial({ color: 0x25b2dc, emissive: 0x0b93ad, emissiveIntensity: .7, roughness: .23, metalness: .15 });
    const cap = new T.MeshStandardMaterial({ color: 0x176cbd, roughness: .45 });
    const label = new T.MeshStandardMaterial({ color: 0xe6ffff, emissive: 0x89e8ed, emissiveIntensity: .25, roughness: .5 });
    const bodyGeometry = new T.CylinderGeometry(.2, .21, .62, 14);
    const waterGeometry = new T.CylinderGeometry(.174, .184, .46, 14);
    const capGeometry = new T.CylinderGeometry(.12, .12, .12, 12);
    const shoulderGeometry = new T.CylinderGeometry(.11, .2, .16, 14);
    const labelGeometry = new T.CylinderGeometry(.214, .214, .2, 14, 1, true);
    const floorGeometry = new T.RingGeometry(.49, .56, 48);
    const circle = new T.CanvasTexture(this.makeGlow());
    const markerTexture = new T.CanvasTexture(this.makeLabel());
    this.items = supply.bottles.map(bottle => {
      const root = new T.Group(); root.position.set(bottle.x, 0, bottle.z); this.group.add(root);
      const model = new T.Group(); root.add(model);
      for (const [geometry, material, y] of [[bodyGeometry, plastic, .4], [waterGeometry, liquid, .35], [shoulderGeometry, plastic, .79], [capGeometry, cap, .92], [labelGeometry, label, .48]]) {
        const mesh = new T.Mesh(geometry, material); mesh.position.y = y; model.add(mesh);
      }
      for (const y of [.17, .24, .66]) {
        const rib = new T.Mesh(new T.TorusGeometry(.206, .011, 4, 16), plastic); rib.rotation.x = Math.PI / 2; rib.position.y = y; model.add(rib);
      }
      const ring = new T.Mesh(floorGeometry, new T.MeshBasicMaterial({ color: 0x8cefff, transparent: true, opacity: .75, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = .047; root.add(ring);
      const glow = new T.Sprite(new T.SpriteMaterial({ map: circle, color: 0x45d6f4, transparent: true, opacity: .28, depthWrite: false, blending: T.AdditiveBlending })); glow.position.y = .5; glow.scale.set(1.7, 2, 1); root.add(glow);
      const tag = new T.Sprite(new T.SpriteMaterial({ map: markerTexture, transparent: true, depthWrite: false })); tag.position.y = 1.3; tag.scale.set(1.05, .40, 1); root.add(tag);
      return { root, model, ring, glow, tag, collectedAt: -Infinity };
    });
  }
  makeGlow() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#ffffffcc'); g.addColorStop(.35, '#ffffff44'); g.addColorStop(1, '#ffffff00'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); return c;
  }
  makeLabel() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const ctx = c.getContext('2d');
    ctx.fillStyle = '#101a1ee8'; ctx.fillRect(4, 4, 248, 71); ctx.beginPath(); ctx.rect(4, 4, 248, 71);
    ctx.strokeStyle = '#ac9b72'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#dcecf1'; ctx.font = 'bold 27px Georgia'; ctx.textAlign = 'center'; ctx.fillText('+45 WATER', 128, 48);
    ctx.beginPath(); ctx.moveTo(118, 77); ctx.lineTo(138, 77); ctx.lineTo(128, 92); ctx.fill(); return c;
  }
  collected(id, now) { this.items[id].collectedAt = now; }
  reset() { for (const item of this.items) item.collectedAt = -Infinity; }
  update(now, active, low) {
    this.group.visible = active;
    if (!active) return;
    this.items.forEach((item, id) => {
      const available = this.supply.available(this.supply.bottles[id], now), since = now - item.collectedAt;
      const burst = !available && since < .65;
      item.root.visible = available || burst;
      item.model.visible = item.tag.visible = item.glow.visible = available;
      item.model.position.y = .08 + Math.sin(now * 2.6 + id) * .09; item.model.rotation.y = now * .7 + id;
      item.tag.position.y = 1.28 + Math.sin(now * 2.6 + id) * .05;
      item.glow.material.opacity = (low ? .42 : .23) + Math.sin(now * 3 + id) * .06;
      item.ring.scale.setScalar(burst ? 1 + since * 4 : 1 + Math.sin(now * 3 + id) * .06);
      item.ring.material.opacity = burst ? .9 * (1 - since / .65) : low ? .95 : .55;
    });
  }
}
