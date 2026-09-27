// Cleaning lives on welded rest-pose vertices, so it survives animation and UV seams.
// Rates are seconds of exposure, and progress is weighted by actual triangle area.
export class CleaningSurface {
  constructor(positions, normals, indices) {
    this.positions = positions; this.normals = normals; this.groups = []; this.vertexGroup = new Uint32Array(positions.length / 3);
    const weld = new Map();
    for (let i = 0; i < positions.length / 3; i++) {
      const p = Array.from(positions.slice(i * 3, i * 3 + 3));
      const key = p.map(v => Math.round(v * 1e5)).join(',');
      if (!weld.has(key)) { weld.set(key, this.groups.length); this.groups.push({ p, vertices: [], area: 0, clean: 0 }); }
      const group = weld.get(key); this.vertexGroup[i] = group; this.groups[group].vertices.push(i);
    }
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map(v => this.groups[this.vertexGroup[v]].p);
      const u = b.map((v, k) => v - a[k]), v = c.map((v, k) => v - a[k]);
      const area = Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]) / 6;
      for (let k = 0; k < 3; k++) this.groups[this.vertexGroup[indices[i + k]]].area += area;
    }
    this.totalArea = this.groups.reduce((sum, g) => sum + g.area, 0); this.cleanedArea = 0;
  }
  get progress() { return this.totalArea ? this.cleanedArea / this.totalArea : 0; }
  get stink() { return Math.max(0, Math.min(1, 1 - this.progress)); }
  get won() { return this.progress >= .9; }
  reset() { this.cleanedArea = 0; for (const group of this.groups) group.clean = 0; }
  paint(point, normal, radius, rate, dt) {
    if (!(radius > 0 && rate > 0 && dt > 0) || ![...point, ...normal, radius, rate, dt].every(Number.isFinite)) return [];
    const changed = []; const r2 = radius * radius, normals = this.normals;
    const [px, py, pz] = point, [nx, ny, nz] = normal;
    for (const group of this.groups) {
      if (group.clean >= 1) continue;
      const p = group.p, d2 = (p[0] - px) ** 2 + (p[1] - py) ** 2 + (p[2] - pz) ** 2;
      if (d2 > r2) continue;
      // Keep the brush on the facing surface, rather than washing through the body.
      let facing = false;
      for (const i of group.vertices) if (nx * normals[i * 3] + ny * normals[i * 3 + 1] + nz * normals[i * 3 + 2] > .2) { facing = true; break; }
      if (!facing) continue;
      const exposure = rate * dt * (1 - .65 * d2 / r2);
      const before = group.clean; group.clean = Math.min(1, before + exposure);
      this.cleanedArea += (group.clean - before) * group.area; changed.push(group);
    }
    return changed;
  }
}

// Constant-acceleration trajectory, shared by visible water and hit detection.
export function waterPoint(origin, velocity, gravity, time) {
  return origin.map((v, i) => v + velocity[i] * time - (i === 1 ? .5 * gravity * time * time : 0));
}
