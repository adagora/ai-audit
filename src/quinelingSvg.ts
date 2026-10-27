export const xmlEscape = (s: unknown) => String(s ?? "").replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\'": "&apos;" }[c]!));
const esc = xmlEscape;
export const QUINELING_COLORS = ["#f2c14e", "#f78154", "#4d9de0", "#3bb273", "#e15554", "#7b6cf6", "#2a9d8f", "#e9c46a", "#e76f51"];

export function renderQuinelingBody(frame: any): string {
  const n = frame?.owners?.length ?? 0;
  if (!n || !frame.points?.length) return "";
  const stride = frame.points.length / n;
  const xs = Array.from({ length: n }, (_, i) => frame.points[i * stride]);
  const ys = Array.from({ length: n }, (_, i) => frame.points[i * stride + 1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const spanX = x1 - x0 || 1, spanY = y1 - y0 || 1;
  const scale = Math.min(560 / spanX, 420 / spanY);
  const sx = (x: number) => (16 + (x - x0) * scale).toFixed(1);
  const sy = (y: number) => (16 + (y1 - y) * scale).toFixed(1);
  const dots: string[][] = frame.nodeIds.map(() => []);
  for (let i = 0; i < n; i++) dots[frame.owners[i]].push(`<circle cx="${sx(xs[i])}" cy="${sy(ys[i])}" r="1.6"/>`);
  const ridges = Array.isArray(frame.ridges) ? frame.ridges : [];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 460" role="img" aria-label="Calculation body">`
    + `<rect width="100%" height="100%" fill="#10141c"/>`
    + dots.map((d: string[], i: number) => `<g data-step="${esc(frame.nodeIds[i])}" fill="${QUINELING_COLORS[i % QUINELING_COLORS.length]}" fill-opacity="0.9"><title>${esc(frame.nodeIds[i])}</title>${d.join("")}</g>`).join("")
    + ridges.map((r: any) => `<polyline points="${(r.line ?? []).map((p: any) => `${sx(p.x)},${sy(p.y)}`).join(" ")}" fill="none" stroke="#f0f1eb" stroke-opacity="0.55" stroke-width="1.2"/>`).join("")
    + `</svg>`;
}
