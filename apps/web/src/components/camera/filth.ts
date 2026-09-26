import type { BodyPart } from "@vibecodemaxxing/contracts";
import type { BodyRegion, HandPoint, Point } from "./CameraProvider";

/** Region-local splat: u and v run -1..1 across the region's bounding box. */
interface Splat {
  u: number;
  v: number;
  r: number;
  color: string;
  lobes: { dx: number; dy: number; r: number }[];
}

interface Sparkle {
  x: number;
  y: number;
  bornAt: number;
}

interface Shape {
  center: Point;
  outline: Point[];
  seenAt: number;
}

export interface Filth {
  /** Body parts that get filthy; everything else stays clean and is ignored by the score. Undefined = all. */
  parts?: readonly BodyPart[];
  level: Map<BodyPart, number>;
  splats: Map<BodyPart, Splat[]>;
  poops: Map<BodyPart, Point>;
  shapes: Map<BodyPart, Shape>;
  sparkles: Sparkle[];
  revealAt: number | null;
}

const MUD = ["#3b2410", "#4a2c12", "#5c3a18", "#6b4a1f", "#2e1c0b"];
/** Regions the tracker emits whenever the shoulders are visible, so the poop never flickers. */
const POOP_PARTS: BodyPart[] = ["hair", "chest", "left-shoulder", "right-shoulder"];
/** Full-strength scrubbing cleans a region in about 4.5 seconds. */
const CLEAN_PER_SECOND = 0.22;
const REVEAL_MS = 1200;
/** Keep drawing a region this long after the tracker drops it. */
const HOLD_MS = 900;
/** Share of the gap to the newest outline closed each frame; hides landmark jitter. */
const SMOOTHING = 0.35;

/** Same splat layout every run: seeded from the body part's name. */
function seeded(part: string) {
  let seed = 0;
  for (const char of part) seed = (seed * 31 + char.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSplats(part: BodyPart): Splat[] {
  const random = seeded(part);
  return Array.from({ length: 5 }, () => ({
    u: (random() - 0.5) * 1.5,
    v: (random() - 0.5) * 1.5,
    r: 0.09 + random() * 0.13,
    color: MUD[Math.floor(random() * MUD.length)],
    lobes: Array.from({ length: 4 }, () => ({
      dx: (random() - 0.5) * 1.4,
      dy: (random() - 0.5) * 1.4,
      r: 0.35 + random() * 0.5,
    })),
  }));
}

export function createFilth(parts?: readonly BodyPart[]): Filth {
  return { parts, level: new Map(), splats: new Map(), poops: new Map(), shapes: new Map(), sparkles: [], revealAt: null };
}

function ensure(filth: Filth, part: BodyPart) {
  if (!filth.level.has(part)) {
    filth.level.set(part, 1);
    filth.splats.set(part, makeSplats(part));
    if (POOP_PARTS.includes(part)) filth.poops.set(part, { x: 0, y: -0.1 });
  }
}

const lerp = (from: Point, to: Point) => ({ x: from.x + (to.x - from.x) * SMOOTHING, y: from.y + (to.y - from.y) * SMOOTHING });

function trackShapes(filth: Filth, regions: readonly BodyRegion[], now: number) {
  for (const region of regions) {
    if (filth.parts && !filth.parts.includes(region.part)) continue;
    ensure(filth, region.part);
    const shape = filth.shapes.get(region.part);
    if (!shape || shape.outline.length !== region.outline.length || now - shape.seenAt > HOLD_MS) {
      filth.shapes.set(region.part, { center: region.center, outline: region.outline, seenAt: now });
      continue;
    }
    shape.center = lerp(shape.center, region.center);
    shape.outline = shape.outline.map((point, index) => lerp(point, region.outline[index]));
    shape.seenAt = now;
  }
  for (const [part, shape] of filth.shapes) if (now - shape.seenAt > HOLD_MS) filth.shapes.delete(part);
}

/** Only scored scrubbing cleans: the same signal the shower score uses. */
export function scrubFilth(filth: Filth, hands: HandPoint[], dt: number, now: number, map: (point: Point) => Point) {
  for (const hand of hands) {
    if (!hand.zone || hand.intensity <= 0) continue;
    const parts: BodyPart[] = hand.zone === "hair" ? ["hair", "face"] : [hand.zone];
    for (const part of parts) {
      const before = filth.level.get(part);
      if (before === undefined || before <= 0) continue;
      const after = Math.max(0, before - hand.intensity * CLEAN_PER_SECOND * dt);
      filth.level.set(part, after);
      const shape = filth.shapes.get(part);
      if (after === 0 && shape) filth.sparkles.push({ ...map(shape.center), bornAt: now });
    }
  }
}

export function filthAverage(filth: Filth) {
  if (filth.level.size === 0) return 1;
  let sum = 0;
  filth.level.forEach((value) => (sum += value));
  return sum / filth.level.size;
}

function bounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, hw: (maxX - minX) / 2, hh: (maxY - minY) / 2 };
}

export function drawFilth(
  ctx: CanvasRenderingContext2D,
  filth: Filth,
  regions: readonly BodyRegion[] | undefined,
  map: (point: Point) => Point,
  now: number,
  reduce: boolean,
) {
  trackShapes(filth, regions ?? [], now);
  if (filth.shapes.size === 0) return;
  filth.revealAt ??= now;
  const reveal = Math.min(1, (now - filth.revealAt) / REVEAL_MS);

  let head: { x: number; y: number; size: number; level: number } | null = null;

  for (const [part, shape] of filth.shapes) {
    const fade = Math.min(1, Math.max(0, 1 - (now - shape.seenAt - HOLD_MS / 2) / (HOLD_MS / 2)));
    const level = (filth.level.get(part) ?? 0) * reveal * fade;
    const outline = shape.outline.map(map);
    if (outline.length < 3) continue;
    const box = bounds(outline);
    if (part === "hair") head = { x: box.cx, y: box.cy - box.hh, size: Math.max(box.hw, box.hh), level };
    if (level <= 0.01) continue;

    ctx.save();
    ctx.beginPath();
    outline.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.closePath();
    ctx.clip();
    // Keep the camera image visible: dirt is a handful of small spots,
    // rather than an opaque wash over the whole tracked body region.
    for (const splat of filth.splats.get(part) ?? []) {
      const x = box.cx + splat.u * box.hw;
      const y = box.cy + splat.v * box.hh;
      const r = Math.min(22, splat.r * Math.max(box.hw, box.hh));
      ctx.globalAlpha = 0.7 * level;
      ctx.fillStyle = splat.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      for (const lobe of splat.lobes) {
        ctx.moveTo(x + lobe.dx * r + lobe.r * r, y + lobe.dy * r);
        ctx.arc(x + lobe.dx * r, y + lobe.dy * r, lobe.r * r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();

    const poop = filth.poops.get(part);
    if (poop && level > 0.35) {
      const size = Math.max(10, Math.min(24, Math.min(box.hw, box.hh) * 0.42));
      ctx.save();
      ctx.globalAlpha = Math.min(1, (level - 0.35) / 0.3);
      ctx.font = `${size}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u{1F4A9}", box.cx + poop.x * box.hw, box.cy + poop.y * box.hh);
      ctx.restore();
    }
  }

  const average = filthAverage(filth) * reveal;
  if (head && average > 0.25 && !reduce) {
    const t = now / 1000;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (average - 0.25) / 0.3);
    ctx.strokeStyle = "rgba(140, 190, 60, 0.8)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let line = 0; line < 3; line++) {
      const baseX = head.x + (line - 1) * head.size * 0.45;
      ctx.beginPath();
      for (let step = 0; step <= 12; step++) {
        const rise = step / 12;
        const x = baseX + Math.sin(rise * 6 + t * 3 + line) * 8;
        const y = head.y - 10 - rise * head.size * 0.9 - ((t * 20 + line * 15) % 20);
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "#111111";
    const flies = Math.round(2 + average * 4);
    for (let fly = 0; fly < flies; fly++) {
      const angle = t * (2.2 + fly * 0.37) + fly * 1.7;
      const radius = head.size * (0.9 + 0.25 * Math.sin(t * 5 + fly));
      const x = head.x + Math.cos(angle) * radius;
      const y = head.y + head.size * 0.6 + Math.sin(angle * 1.3) * radius * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha *= 0.6;
      ctx.beginPath();
      ctx.ellipse(x - 2, y - 3, 3, 1.5, -0.6, 0, Math.PI * 2);
      ctx.ellipse(x + 2, y - 3, 3, 1.5, 0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fill();
      ctx.fillStyle = "#111111";
      ctx.globalAlpha = Math.min(1, (average - 0.25) / 0.3);
    }
    ctx.restore();
  }

  filth.sparkles = filth.sparkles.filter((sparkle) => now - sparkle.bornAt < 900);
  for (const sparkle of filth.sparkles) {
    const age = (now - sparkle.bornAt) / 900;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.font = `${24 + age * 20}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u2728", sparkle.x, sparkle.y - age * 30);
    ctx.restore();
  }
}
