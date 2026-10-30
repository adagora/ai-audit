import BendUsage from "./bend/usage.mjs";
import { BEND_NAT_MAX, BEND_NONE, bendCount, fromBendMaybe, KIND_BY_CODE, SEGMENTS, type ArenaBlock, type BendMaybe, type ContextComposition, type Segment } from "./context.js";
import type { Usage } from "./extract.js";
import type { SessionLink } from "./session.js";

export interface SessionCall { id: string; ts: string; provider?: string; model?: string; usage?: Usage; session: SessionLink; context: ContextComposition }
export interface SessionSummary { id: string; requests: number; turns: number; branches: number; firstTs: string; lastTs: string; maxBytes: number }
export type BustSignal = "prefix-rewrite" | "provider-cache-drop";
export interface TurnTokens { cacheRead: number | null; cacheWrite: number | null; input: number | null; output: number | null; prompt: number | null }
export interface TurnView { call: SessionCall; kind: "" | "retry" | "branch"; tokens: TurnTokens; bust: BustSignal[]; preambleBytes: number; totalBytes: number }
export interface SessionView { turns: TurnView[]; peakTokens: number | null; cacheHit: number | null; busts: number; preambleShare: number; unknownUsage: number }

type BendTurn = { read: BendMaybe<number>; write: BendMaybe<number>; input: BendMaybe<number>; output: BendMaybe<number>; prompt: BendMaybe<number> };
const bendTurn = (call: Pick<SessionCall, "provider" | "usage">): BendTurn => {
  const anthropic = call.provider === "anthropic", input = bendCount(call.usage?.input), cached = bendCount(call.usage?.cached), write = bendCount(call.usage?.cacheWrite);
  const c = fromBendMaybe(cached) ?? 0, sumsFit = c + c <= BEND_NAT_MAX && (!anthropic || (fromBendMaybe(input) ?? 0) + c + (fromBendMaybe(write) ?? 0) <= BEND_NAT_MAX);
  return BendUsage.turn(anthropic, { $: "Usage", input: sumsFit ? input : BEND_NONE, output: bendCount(call.usage?.output), cached, write });
};

export function sessionCalls(records: object[]): SessionCall[] {
  return (records as Partial<SessionCall & { kind: string }>[])
    .filter((r): r is SessionCall & { kind: string } => r.kind === "llm-call" && !!r.session && !!r.context)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

export function listSessions(records: object[]): SessionSummary[] {
  const groups = new Map<string, SessionCall[]>();
  for (const c of sessionCalls(records)) groups.set(c.session.id, [...(groups.get(c.session.id) ?? []), c]);
  return [...groups.entries()].map(([id, calls]) => {
    const children = new Map<string, Set<string>>();
    for (const c of calls) if (c.session.parent) children.set(c.session.parent, (children.get(c.session.parent) ?? new Set()).add(c.session.digest));
    return { id, requests: calls.length, turns: Math.max(...calls.map((c) => c.session.turn)),
      branches: [...children.values()].filter((s) => s.size > 1).length,
      firstTs: calls[0].ts, lastTs: calls[calls.length - 1].ts, maxBytes: Math.max(...calls.map((c) => c.context.totalBytes)) };
  }).sort((a, b) => b.lastTs.localeCompare(a.lastTs));
}

export function turnTokens(call: Pick<SessionCall, "provider" | "usage">): TurnTokens {
  const t = bendTurn(call);
  return { cacheRead: fromBendMaybe(t.read), cacheWrite: fromBendMaybe(t.write), input: fromBendMaybe(t.input), output: fromBendMaybe(t.output), prompt: fromBendMaybe(t.prompt) };
}

export function bustSignals(call: SessionCall, previous: SessionCall | undefined): BustSignal[] {
  const signals: BustSignal[] = [];
  if (call.session.firstChanged) signals.push("prefix-rewrite");
  if (previous && BendUsage.drop(call.provider === "anthropic", bendTurn(call), bendTurn(previous))) signals.push("provider-cache-drop");
  return signals;
}

const blockBytes = (c: SessionCall) => c.context.blocks ?? SEGMENTS.filter((s) => s !== "other" && c.context.bytes[s] > 0).map((s) => [s[0], c.context.bytes[s], 0] as ArenaBlock);

export function sessionView(records: object[], sessionId: string): SessionView {
  const calls = sessionCalls(records).filter((c) => c.session.id === sessionId);
  if (!calls.length) throw new Error("audit_unknown_session");
  const turns = calls.map((call, i): TurnView => {
    const earlier = calls.slice(0, i);
    const kind = earlier.some((o) => o.session.digest === call.session.digest) ? "retry"
      : earlier.some((o) => o.session.parent === call.session.parent && o.session.turn === call.session.turn) ? "branch" : "";
    const previous = [...earlier].reverse().find((o) => kind === "retry" ? o.session.digest === call.session.digest : o.session.digest === call.session.parent);
    const blocks = blockBytes(call);
    const preambleBytes = blocks.filter(([k]) => KIND_BY_CODE[k] === "system" || KIND_BY_CODE[k] === "tools").reduce((a, b) => a + b[1], 0);
    return { call, kind, tokens: turnTokens(call), bust: bustSignals(call, previous), preambleBytes, totalBytes: blocks.reduce((a, b) => a + b[1], 0) };
  });
  const knownTurns = turns.filter((t) => t.tokens.prompt !== null);
  const promptSum = knownTurns.reduce((a, t) => a + t.tokens.prompt!, 0);
  return {
    turns,
    peakTokens: knownTurns.length ? Math.max(...knownTurns.map((t) => t.tokens.prompt! + (t.tokens.output ?? 0))) : null,
    cacheHit: promptSum ? knownTurns.reduce((a, t) => a + (t.tokens.cacheRead ?? 0), 0) / promptSum : null,
    busts: turns.filter((t) => t.bust.length).length,
    preambleShare: turns.reduce((a, t) => a + (t.totalBytes ? t.preambleBytes / t.totalBytes : 0), 0) / turns.length,
    unknownUsage: turns.length - knownTurns.length,
  };
}

const PALETTE = { cacheRead: "#2fa37c", cacheWrite: "#4a7cf0", input: "#f2a33a", output: "#9a5ae6", bust: "#e0453a", grid: "#eceef2", axis: "#8a91a0", text: "#1d2330", muted: "#5d6575" };
const KIND_COLORS: Record<Segment, string> = { tools: "#0f766e", system: "#6d28d9", user: "#1d4ed8", assistant: "#b45309", toolResults: "#be123c", attachments: "#4b5563", other: "#94a3b8" };
const KIND_LABELS: Record<Segment, string> = { tools: "tool definitions", system: "system", user: "user", assistant: "assistant", toolResults: "tool result", attachments: "attachment", other: "other" };
const SHORT_LABELS: Record<Segment, string> = { tools: "tools", system: "system", user: "user", assistant: "asst", toolResults: "result", attachments: "file", other: "other" };
const niceMax = (v: number) => { const p = 10 ** Math.floor(Math.log10(Math.max(1, v))); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!; };
const AGE_STOPS = ["#fde68a", "#fbbf24", "#a3d977", "#4fb3a9", "#2b7bb9", "#2c3e8f"];
const ageColor = (survived: number) => AGE_STOPS[Math.min(AGE_STOPS.length - 1, Math.max(0, survived))];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n: number) => n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const BUST_TEXT: Record<BustSignal, string> = { "prefix-rewrite": "prefix rewritten before the cached end", "provider-cache-drop": "provider cache read dropped below half of the expected prefix" };

export function renderSessionHtml(records: object[], sessionId: string): string {
  const v = sessionView(records, sessionId), n = v.turns.length;
  const W = 1180, padL = 96, padR = 24, plotW = W - padL - padR, slot = plotW / n, barW = Math.min(46, slot * 0.68);
  const label = (t: TurnView) => `t${t.call.session.turn}${t.kind === "branch" ? "′" : t.kind === "retry" ? " ↻" : ""}`;
  const xOf = (i: number) => padL + i * slot + (slot - barW) / 2;

  const tH = 230, tTop = 18, tBase = tTop + tH;
  const stackTotal = (t: TurnView) => (t.tokens.prompt ?? 0) + (t.tokens.output ?? 0);
  const tMax = niceMax(Math.max(1, ...v.turns.map(stackTotal)));
  const ty = (val: number) => tBase - (val / tMax) * tH;
  const timeline: string[] = [];
  for (const f of [0, 0.25, 0.5, 0.75, 1]) timeline.push(`<line x1="${padL}" x2="${W - padR}" y1="${ty(f * tMax)}" y2="${ty(f * tMax)}" stroke="${PALETTE.grid}"/><text x="${padL - 10}" y="${ty(f * tMax) + 4}" class="tick" text-anchor="end">${fmt(f * tMax)}</text>`);
  v.turns.forEach((t, i) => {
    const x = xOf(i), parts: [keyof TurnTokens, string][] = [["cacheRead", PALETTE.cacheRead], ["cacheWrite", PALETTE.cacheWrite], ["input", PALETTE.input], ["output", PALETTE.output]];
    let acc = 0;
    if (t.tokens.prompt === null) timeline.push(`<rect x="${x}" y="${tBase - 18}" width="${barW}" height="18" fill="url(#unknown)" stroke="${PALETTE.axis}" stroke-dasharray="2 2"><title>${esc(label(t))}: provider reported no usage (unknown, not zero)</title></rect>`);
    for (const [key, color] of parts) {
      const val = t.tokens[key]; if (val === null || val <= 0) continue;
      const y0 = ty(acc), y1 = ty(acc + val); acc += val;
      timeline.push(`<rect x="${x}" y="${y1.toFixed(1)}" width="${barW}" height="${(y0 - y1).toFixed(1)}" fill="${color}"><title>${esc(`${label(t)} · ${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${val.toLocaleString("en")} tokens`)}</title></rect>`);
    }
    if (t.bust.length) timeline.push(`<rect x="${x - 4}" y="${tTop - 6}" width="${barW + 8}" height="${tH + 6}" fill="none" stroke="${PALETTE.bust}" stroke-width="1.6" stroke-dasharray="4 3" rx="2"><title>${esc(`cache bust at ${label(t)}: ${t.bust.map((b) => BUST_TEXT[b]).join("; ")}`)}</title></rect>`
      + `<text x="${x + barW / 2}" y="${tTop - 9}" class="bust" text-anchor="middle">${t.bust.map((b) => b === "prefix-rewrite" ? "P" : "C").join("+")}</text>`);
    timeline.push(`<text x="${x + barW / 2}" y="${tBase + 16}" class="tick" text-anchor="middle">${esc(label(t))}</text>`);
  });

  const useTokens = v.turns.every((t) => t.tokens.prompt !== null);
  const scaleOf = (t: TurnView) => useTokens && t.totalBytes ? t.tokens.prompt! / t.totalBytes : 1;
  const aMax = niceMax(Math.max(1, ...v.turns.map((t) => t.totalBytes * scaleOf(t))));
  const rowH = 22, rowGap = 7, aTop = 26, aH = n * (rowH + rowGap);
  const ax = (val: number) => padL + (val / aMax) * plotW;
  const arena: string[] = [];
  for (const f of [0, 0.25, 0.5, 0.75, 1]) arena.push(`<line x1="${ax(f * aMax)}" x2="${ax(f * aMax)}" y1="${aTop - 6}" y2="${aTop + aH}" stroke="${PALETTE.grid}"/><text x="${ax(f * aMax)}" y="${aTop + aH + 16}" class="tick" text-anchor="middle">${fmt(f * aMax)}</text>`);
  v.turns.forEach((t, i) => {
    const y = aTop + i * (rowH + rowGap), s = scaleOf(t);
    arena.push(`<text x="${padL - 10}" y="${y + rowH / 2 + 4}" class="row" text-anchor="end">${esc(label(t))}</text>`);
    let pos = 0;
    for (const [code, bytes, age] of blockBytes(t.call)) {
      const kind = KIND_BY_CODE[code] ?? "other", w = bytes * s, x0 = ax(pos), x1 = ax(pos + w); pos += w;
      const survived = age > 0 ? t.call.session.turn - age : -1;
      const fill = survived < 0 ? "url(#unknown)" : ageColor(survived);
      const tip = `${label(t)} · ${KIND_LABELS[kind]} · ${fmt(w)} ${useTokens ? "tokens (by size)" : "bytes"} · ${survived < 0 ? "age unknown" : survived === 0 ? "new or re-sent this turn" : `unchanged for ${survived} turn${survived > 1 ? "s" : ""}`}`;
      arena.push(`<g><rect x="${x0.toFixed(1)}" y="${y}" width="${Math.max(0.8, x1 - x0).toFixed(1)}" height="${rowH}" fill="${fill}" stroke="#ffffff" stroke-width="0.8"/><rect x="${x0.toFixed(1)}" y="${y + rowH - 4}" width="${Math.max(0.8, x1 - x0).toFixed(1)}" height="4" fill="${KIND_COLORS[kind]}"/><title>${esc(tip)}</title></g>`);
      if (x1 - x0 > 34) arena.push(`<text x="${((x0 + x1) / 2).toFixed(1)}" y="${y + rowH / 2 + 2}" class="blk" text-anchor="middle" fill="${survived >= 4 ? "#ffffff" : "#1f2937"}">${esc(SHORT_LABELS[kind])}</text>`);
    }
    const fc = t.call.session.firstChanged;
    if (fc) {
      const x = ax(fc.offset * s);
      arena.push(`<line x1="${x}" x2="${x}" y1="${y - 3}" y2="${y + rowH + 3}" stroke="${PALETTE.bust}" stroke-width="2.4"><title>${esc(`${label(t)}: first changed block #${fc.block} at ${fmt(fc.offset * s)} ${useTokens ? "tokens" : "bytes"}; everything after it is re-processed`)}</title></line><path d="M${x - 5} ${y - 6} L${x + 5} ${y - 6} L${x} ${y}" fill="${PALETTE.bust}"/>`);
    }
  });

  const summary = [`${n} requests`, `${Math.max(...v.turns.map((t) => t.call.session.turn))} turns`, v.peakTokens === null ? "peak unknown" : `peak ${fmt(v.peakTokens)} tok`,
    v.cacheHit === null ? "cache hit unknown" : `cache hit ${pct(v.cacheHit)}`, `${v.busts} bust${v.busts === 1 ? "" : "s"}`, `preamble ${pct(v.preambleShare)} of context`,
    ...(v.unknownUsage ? [`${v.unknownUsage} without usage`] : [])].join(" · ");
  const sw = (c: string, l: string, extra = "") => `<span class="key"><i style="background:${c};${extra}"></i>${l}</span>`;
  const legendTokens = [sw(PALETTE.cacheRead, "cache read"), sw(PALETTE.cacheWrite, "cache write"), sw(PALETTE.input, "uncached input"), sw(PALETTE.output, "output"),
    `<span class="key"><i style="border:1.6px dashed ${PALETTE.bust};background:none"></i>cache bust (P prefix rewrite, C provider cache drop)</span>`].join("");
  const legendAge = AGE_STOPS.map((c, i) => sw(c, i === 0 ? "new" : i === AGE_STOPS.length - 1 ? `${i}+ turns` : String(i))).join("")
    + `<span class="sep"></span>` + (["tools", "system", "user", "assistant", "toolResults", "attachments"] as Segment[]).map((k) => sw(KIND_COLORS[k], KIND_LABELS[k], "height:4px;vertical-align:3px")).join("")
    + `<span class="key"><i style="background:${PALETTE.bust};width:3px"></i>first changed block</span>`;
  const defs = `<defs><pattern id="unknown" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f3f4f6"/><line x1="0" y1="0" x2="0" y2="6" stroke="#c4c8d0" stroke-width="2"/></pattern></defs>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ai-audit · session ${esc(sessionId)}</title>
<style>
body{font:13px/1.45 -apple-system,"Segoe UI",Inter,system-ui,sans-serif;margin:0;background:#f6f7f9;color:${PALETTE.text}}
main{max-width:${W}px;margin:24px auto;padding:0 12px}
.card{background:#fff;border:1px solid #e3e6eb;border-radius:10px;padding:16px 18px 10px;margin-bottom:16px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
h1{font-size:17px;margin:0 0 2px}h2{font-size:14px;margin:0 0 6px}
.summary{color:${PALETTE.muted};margin-bottom:14px}.summary b{color:${PALETTE.text}}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin:2px 0 10px;color:${PALETTE.muted};font-size:12px}
.key i{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:5px;vertical-align:-2px}
.sep{width:1px;background:#e3e6eb;margin:0 4px}
.note{color:${PALETTE.muted};font-size:12px;margin:4px 0 0}
svg text{font-family:inherit}.tick{font-size:11px;fill:${PALETTE.axis}}.row{font-size:12px;fill:${PALETTE.text};font-weight:600}
.blk{font-size:10px;opacity:.8;pointer-events:none}.bust{font-size:10px;font-weight:700;fill:${PALETTE.bust}}
svg rect:hover{filter:brightness(1.08)}
</style></head><body><main>
<h1>Context map · session ${esc(sessionId)}</h1>
<div class="summary"><b>${esc(summary)}</b></div>
<section class="card"><h2>Token timeline</h2><div class="legend">${legendTokens}</div>
<svg width="${W - 40}" height="${tBase + 30}" viewBox="0 0 ${W} ${tBase + 30}" role="img" aria-label="Tokens per request">${defs}${timeline.join("")}</svg>
<p class="note">Provider-reported usage per request. Hatched: provider reported no usage (unknown, not zero).</p></section>
<section class="card"><h2>Context arena · position in the prompt (${useTokens ? "tokens, split by size" : "bytes"})</h2><div class="legend">${legendAge}</div>
<svg width="${W - 40}" height="${aTop + aH + 26}" viewBox="0 0 ${W} ${aTop + aH + 26}" role="img" aria-label="Context blocks by position and age">${defs}${arena.join("")}</svg>
<p class="note">One row per request, blocks in prompt order. Colour shows how many turns a block has stayed unchanged at its position. A change invalidates every cached token behind it, so the red marker shows where reprocessing starts. Sizes and keyed hashes only, no content.</p></section>
</main></body></html>
`;
}
