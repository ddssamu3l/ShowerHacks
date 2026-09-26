import type { VisionFrame } from "./types";

export function drawOverlay(canvas: HTMLCanvasElement, frame: VisionFrame, width: number, height: number) {
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  const points = frame.landmarks;
  ctx.lineWidth = Math.max(2, width / 500);
  ctx.strokeStyle = "rgba(168,255,96,.5)";
  for (const [a, b] of [[11,12],[11,13],[13,15],[12,14],[14,16],[15,19],[16,20]]) {
    const p = points[a], q = points[b];
    if (!p || !q || (p.visibility ?? 0) < .45 || (q.visibility ?? 0) < .45) continue;
    ctx.beginPath(); ctx.moveTo(p.x * width, p.y * height); ctx.lineTo(q.x * width, q.y * height); ctx.stroke();
  }
  for (const id of [0,11,12,13,14,15,16]) {
    const p = points[id];
    if (!p || (p.visibility ?? 0) < .45) continue;
    ctx.beginPath(); ctx.arc(p.x * width, p.y * height, id >= 15 ? 9 : 4, 0, Math.PI * 2);
    ctx.fillStyle = id >= 15 ? "#edffb0" : "#b0ff60"; ctx.fill();
    if (id >= 15) { ctx.strokeStyle = "rgba(221,255,140,.3)"; ctx.lineWidth = 5; ctx.stroke(); }
  }
  for (const marker of frame.markers) {
    const active = marker.zone === frame.zone;
    const radius = active ? 28 : 15;
    ctx.beginPath(); ctx.arc(marker.x * width, marker.y * height, radius, 0, Math.PI * 2);
    ctx.strokeStyle = active ? (frame.scrubbing ? "#ceff57" : "#ffce73") : "rgba(255,255,255,.2)";
    ctx.lineWidth = active ? 3 : 1; ctx.stroke();
    if (active) {
      ctx.beginPath(); ctx.arc(marker.x * width, marker.y * height, radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frame.progress);
      ctx.strokeStyle = "#dfff6c"; ctx.lineWidth = 5; ctx.stroke();
    }
  }
}
