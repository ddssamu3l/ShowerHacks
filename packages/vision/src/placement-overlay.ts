import { PLACEMENT_LABELS, type PlacementFrame, type PlacementZone, type Point2 } from "./placement";

const colors = { left: "#63e5ed", right: "#ff8cb9" };
export function drawPlacementOverlay(canvas: HTMLCanvasElement, frame: PlacementFrame, width: number, height: number, target?: PlacementZone | null) {
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  // Mirror coordinates explicitly, so labels remain readable over the mirrored video.
  const screen = (p: Point2) => ({ x: (1 - p.x) * width, y: p.y * height });
  const outline = (points: Point2[]) => {
    ctx.beginPath();
    points.forEach((p, i) => { const q = screen(p); if (!i) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); });
    ctx.closePath();
  };
  const label = (text: string, point: Point2, color: string) => {
    const size = Math.max(13, width / 65);
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const x = Math.max(8, Math.min(width - textWidth - 24, point.x - textWidth / 2 - 10));
    const y = Math.max(8, Math.min(height - 30, point.y));
    ctx.fillStyle = "rgba(9,17,22,.9)"; ctx.beginPath(); ctx.roundRect(x, y, textWidth + 20, size + 15, 5); ctx.fill();
    ctx.fillStyle = color; ctx.textBaseline = "top"; ctx.fillText(text, x + 10, y + 7);
  };
  for (const region of frame.regions) {
    const touching = frame.hands.filter(hand => hand.zone === region.zone && hand.visible);
    outline(region.outline);
    ctx.lineWidth = touching.length ? 3 : 1;
    ctx.strokeStyle = touching.length ? colors[touching[0].side] : "rgba(255,255,255,.22)";
    if (touching.length) {
      if (touching.length === 2) {
        const center = screen(region.center);
        const gradient = ctx.createLinearGradient(center.x - 70, 0, center.x + 70, 0);
        gradient.addColorStop(0, "#63e5ed55"); gradient.addColorStop(1, "#ff8cb955"); ctx.fillStyle = gradient;
      } else ctx.fillStyle = `${colors[touching[0].side]}38`;
      ctx.fill();
    }
    ctx.stroke();
    if (touching.length === 2) { ctx.setLineDash([8, 8]); ctx.strokeStyle = colors.right; ctx.stroke(); ctx.setLineDash([]); }
    if (region.zone === target) {
      ctx.setLineDash([12, 7]); ctx.strokeStyle = "#d5ff69"; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]);
      if (!touching.length) { ctx.fillStyle = "#d5ff6910"; ctx.fill(); }
      const center = screen(region.center);
      label("SCRUB HERE", { x: center.x, y: center.y - 46 }, "#d5ff69");
    }
    if (touching.length) {
      const center = screen(region.center);
      label(`${PLACEMENT_LABELS[region.zone]}${touching.length === 2 ? " · BOTH HANDS" : ""}`, { x: center.x, y: center.y + 24 }, touching.length === 2 ? "#fff" : colors[touching[0].side]);
    }
  }
  for (const [a, b] of [[11,12],[11,13],[13,15],[12,14],[14,16]]) {
    const p = frame.landmarks[a], q = frame.landmarks[b];
    if (!p || !q || (p.visibility ?? 0) < .35 || (q.visibility ?? 0) < .35) continue;
    const one = screen(p), two = screen(q);
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(one.x, one.y); ctx.lineTo(two.x, two.y); ctx.stroke();
  }
  for (const hand of frame.hands) {
    if (!hand.visible || !hand.point) continue;
    ctx.strokeStyle = colors[hand.side]; ctx.lineWidth = 2;
    for (const chain of [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]]) {
      ctx.beginPath();
      let connected = false;
      chain.forEach(id => { const p = hand.landmarks[id]; if (!p || p.visibility === 0) { connected = false; return; } const q = screen(p); if (!connected) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); connected = true; }); ctx.stroke();
    }
    const p = screen(hand.point);
    ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.fillStyle = `${colors[hand.side]}44`; ctx.fill();
    if (hand.source === "pose") ctx.setLineDash([4, 4]);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = colors[hand.side]; ctx.fill();
    const offset = hand.side === "left" ? -46 : 46;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + offset, p.y - 38); ctx.stroke();
    label(hand.side === "left" ? "L" : "R", { x: p.x + offset, y: p.y - 63 }, colors[hand.side]);
  }
}
