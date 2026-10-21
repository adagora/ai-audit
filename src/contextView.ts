import { SEGMENTS, type ContextComposition, type Segment } from "./context.js";
import type { SessionLink } from "./session.js";

export interface SessionCall { id: string; ts: string; model?: string; session: SessionLink; context: ContextComposition }
export interface SessionSummary { id: string; requests: number; turns: number; branches: number; firstTs: string; lastTs: string; maxBytes: number }

const COLORS: Record<Segment, string> = { system: "#6c5ce7", tools: "#00b894", user: "#0984e3", assistant: "#fdcb6e", toolResults: "#e17055", attachments: "#d63031", other: "#b2bec3" };
const LABELS: Record<Segment, string> = { system: "system", tools: "tool definitions", user: "user", assistant: "assistant", toolResults: "tool results", attachments: "attachments", other: "params / framing" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function sessionCalls(records: object[]): SessionCall[] {
  return (records as Partial<SessionCall & { kind: string }>[])
    .filter((r): r is SessionCall & { kind: string } => r.kind === "llm-call" && !!r.session && !!r.context)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

export function listSessions(records: object[]): SessionSummary[] {
  const groups = new Map<string, SessionCall[]>();
  for (const c of sessionCalls(records)) groups.set(c.session.id, [...(groups.get(c.session.id) ?? []), c]);
  return [...groups.entries()].map(([id, calls]) => {
    const distinctChildren = new Map<string, Set<string>>();
    for (const c of calls) if (c.session.parent) distinctChildren.set(c.session.parent, (distinctChildren.get(c.session.parent) ?? new Set()).add(c.session.digest));
    return { id, requests: calls.length, turns: Math.max(...calls.map((c) => c.session.turn)),
      branches: [...distinctChildren.values()].filter((s) => s.size > 1).length,
      firstTs: calls[0].ts, lastTs: calls[calls.length - 1].ts, maxBytes: Math.max(...calls.map((c) => c.context.totalBytes)) };
  }).sort((a, b) => b.lastTs.localeCompare(a.lastTs));
}

export function renderSessionHtml(records: object[], sessionId: string): string {
  const calls = sessionCalls(records).filter((c) => c.session.id === sessionId);
  if (!calls.length) throw new Error("audit_unknown_session");
  const useTokens = calls.every((c) => c.context.tokenBasis === "provider-scaled" && c.context.tokens);
  const unit = useTokens ? "tokens (provider-reported, split by size)" : "bytes";
  const value = (c: SessionCall, s: Segment) => (useTokens ? c.context.tokens![s] : c.context.bytes[s]);
  const total = (c: SessionCall) => SEGMENTS.reduce((a, s) => a + value(c, s), 0);
  const max = Math.max(1, ...calls.map(total));
  const W = 960, H = 420, left = 70, bottom = 50, top = 20, plotW = W - left - 20, plotH = H - top - bottom;
  const slot = plotW / calls.length, barW = Math.max(4, Math.min(60, slot * 0.7));
  const kindOf = (c: SessionCall, i: number) => {
    const earlier = calls.slice(0, i);
    if (earlier.some((o) => o.session.digest === c.session.digest)) return "retry";
    return earlier.some((o) => o.session.parent === c.session.parent && o.session.turn === c.session.turn) ? "branch" : "";
  };
  const bars = calls.map((c, i) => {
    const x = left + i * slot + (slot - barW) / 2; let y = top + plotH;
    const branch = kindOf(c, i);
    const rects = SEGMENTS.filter((s) => value(c, s) > 0).map((s) => {
      const h = (value(c, s) / max) * plotH; y -= h;
      const tip = `turn ${c.session.turn}${branch ? ` (${branch})` : ""} · ${LABELS[s]}: ${value(c, s).toLocaleString("en")} ${useTokens ? "tokens" : "bytes"} (${c.context.bytes[s].toLocaleString("en")} bytes) · ${c.session.messages} messages`;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" fill="${COLORS[s]}"><title>${escapeHtml(tip)}</title></rect>`;
    }).join("");
    const label = `<text x="${(x + barW / 2).toFixed(1)}" y="${H - bottom + 16}" text-anchor="middle" font-size="11">${c.session.turn}${branch === "branch" ? "′" : branch === "retry" ? "↻" : ""}</text>`;
    return rects + label;
  }).join("\n");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = top + plotH - f * plotH;
    return `<line x1="${left}" x2="${W - 20}" y1="${y}" y2="${y}" stroke="#eee"/><text x="${left - 6}" y="${y + 4}" text-anchor="end" font-size="11">${Math.round(f * max).toLocaleString("en")}</text>`;
  }).join("");
  const legend = SEGMENTS.map((s) => `<span><i style="background:${COLORS[s]}"></i>${LABELS[s]}</span>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ai-audit session ${escapeHtml(sessionId)}</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;color:#222}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#555}.legend span{margin-right:14px;white-space:nowrap}.legend i{display:inline-block;width:12px;height:12px;margin-right:4px;vertical-align:-1px}svg rect:hover{stroke:#000;stroke-width:1}</style></head>
<body><h1>Context composition · session ${escapeHtml(sessionId)}</h1>
<p>${calls.length} requests · y: ${unit} · x: turn (′ branch after edited history, ↻ retry) · hover a block for sizes. Sizes only, no content.</p>
<div class="legend">${legend}</div>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Context composition per turn">
${ticks}
<text x="${left + plotW / 2}" y="${H - 10}" text-anchor="middle" font-size="12">turn</text>
${bars}
</svg></body></html>
`;
}
