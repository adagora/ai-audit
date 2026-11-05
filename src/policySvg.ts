export const xmlEscape = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
export const POLICY_COLORS = ["#f2c14e", "#f78154", "#4d9de0", "#3bb273", "#e15554", "#7b6cf6", "#2a9d8f", "#e9c46a", "#e76f51"];

export function renderPolicyIndex(index: { nodeIds: string[]; inputs: Record<string, string[]> }): string {
  const rows = Math.max(1, Math.ceil(index.nodeIds.length / 4));
  const height = 420 / rows;
  const cells = index.nodeIds.map((id, i) => {
    const x = 12 + i % 4 * 146, y = 18 + Math.floor(i / 4) * height;
    const label = id.length > 19 ? id.slice(0, 18) + "…" : id;
    const inputs = index.inputs[id] ?? [];
    return `<g data-step="${xmlEscape(id)}"><title>${xmlEscape(id)}${inputs.length ? ` ← ${xmlEscape(inputs.join(", "))}` : ""}</title>`
      + `<rect x="${x}" y="${y.toFixed(1)}" width="138" height="${Math.max(18, height - 5).toFixed(1)}" rx="4" fill="${POLICY_COLORS[i % POLICY_COLORS.length]}"/>`
      + `<text x="${x + 6}" y="${(y + Math.max(13, (height - 5) / 2 + 4)).toFixed(1)}" fill="#10141c" font-family="monospace" font-size="10">${xmlEscape(label)}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 460" role="img" aria-label="Policy step index"><rect width="100%" height="100%" fill="#10141c"/>${cells}</svg>`;
}
