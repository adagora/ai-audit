import { sha256, type Rec } from "./audit.js";
import { SEGMENTS, type Segment } from "./context.js";
import { listSessions, sessionView } from "./contextView.js";
import { tokenCount } from "./extract.js";
import { findingTotal, scanText } from "./scan.js";

const MAX_ROWS = 500;
const MAX_SESSIONS = 100;
const SEGMENT_LABELS: Record<Segment, string> = {
  system: "System", tools: "Tools", user: "User", assistant: "Assistant", toolResults: "Tool results", attachments: "Attachments", other: "Other",
};
const SEGMENT_COLORS: Record<Segment, string> = {
  system: "#8369d8", tools: "#26aa9a", user: "#538cf5", assistant: "#e6a044", toolResults: "#e06f91", attachments: "#8494a7", other: "#526173",
};

type Obj = Record<string, unknown>;
type Call = Rec & { decision?: unknown; context?: unknown; session?: unknown; usage?: unknown; quinelings?: unknown };

export interface WorkbenchOptions { from: string; to: string; attestation?: { decisionId: string; verdict: string; keyId: string; checkpointCount: number; head: string } }
export interface WorkbenchResult { html: string; calls: number; sessions: number; findings: number; decisions: number; observedQuinelings: number }

const obj = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string => typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
const count = (value: unknown): number | null => tokenCount(value) ?? null;
const bytes = (value: unknown): number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const times = (value: unknown): string => typeof value === "number" && Number.isSafeInteger(value) && value > 1 ? ` ×${value.toLocaleString("en-US")}` : "";
const OVERFLOW_PATH = "(paths beyond the stored 1,000)";
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const safeText = (value: unknown, max = 128): string => {
  const text = str(value);
  return text ? scanText(text).length ? "[withheld]" : escapeHtml(text.slice(0, max)) : "—";
};
const safeHash = (value: unknown): string => /^(?:ql_)?[0-9a-f]{32,64}$/.test(str(value)) ? escapeHtml(str(value)) : "—";
const short = (value: unknown, size = 14): string => {
  const text = str(value);
  if (!text) return "—";
  const visible = safeText(text, size);
  return visible === "[withheld]" ? visible : visible + (text.length > size ? "…" : "");
};
const fmt = (value: number): string => Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "—";
const fmtCount = (value: unknown): string => count(value) === null ? "unknown" : fmt(count(value)!);
const anchor = (prefix: string, value: string): string => `${prefix}-${sha256(value).slice(0, 16)}`;
const label = (value: string, tone: string): string => `<span class="chip ${tone}">${escapeHtml(value)}</span>`;
const cell = (value: string): string => `<td>${value}</td>`;
const row = (cells: string[], attributes = ""): string => `<tr ${attributes}>${cells.map(cell).join("")}</tr>`;
const section = (id: string, kicker: string, title: string, intro: string, body: string): string =>
  `<section id="${id}" class="section"><div class="section-head"><div><div class="eyebrow">${kicker}</div><h2>${title}</h2><p>${intro}</p></div></div>${body}</section>`;
const table = (headings: string[], rows: string[], empty: string): string => rows.length
  ? `<div class="table-wrap"><table><thead><tr>${headings.map((heading) => `<th scope="col">${heading}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`
  : `<div class="empty">${empty}</div>`;
const shown = (total: number, limit: number): string => total > limit ? `<p class="notice">Showing the latest ${fmt(limit)} of ${fmt(total)} rows. Narrow the interval with <code>--from</code> and <code>--to</code> to inspect earlier records.</p>` : "";

function contextBar(call: Call): string {
  const context = obj(call.context), sizes = obj(context.bytes);
  const present = SEGMENTS.map((segment) => ({ segment, value: bytes(sizes[segment]) })).filter((part) => part.value > 0);
  const total = present.reduce((sum, part) => sum + part.value, 0);
  if (!total) return `<span class="muted">No context metadata</span>`;
  const bars = present.map(({ segment, value }) => `<span class="bar-part" style="width:${(value / total * 100).toFixed(3)}%;background:${SEGMENT_COLORS[segment]}" title="${SEGMENT_LABELS[segment]}: ${fmt(value)} bytes"></span>`).join("");
  const breakdown = present.map(({ segment, value }) => `<span><i style="background:${SEGMENT_COLORS[segment]}"></i>${SEGMENT_LABELS[segment]} ${fmt(value)}</span>`).join("");
  const basis = context.tokenBasis === "provider-scaled" ? "Provider-scaled token attribution" : "Token attribution unknown";
  return `<div class="context-bar" role="img" aria-label="Context composition by byte size">${bars}</div><div class="breakdown">${breakdown}</div><div class="subtle">${fmt(total)} bytes · ${basis}</div>`;
}

function usage(call: Call): string {
  const values = obj(call.usage);
  return `<span class="numbers">in ${fmtCount(values.input)} · out ${fmtCount(values.output)} · cached ${fmtCount(values.cached)}</span>`;
}

function callLink(call: Call, displayed: Set<string>): string {
  const id = str(call.id);
  return displayed.has(id) ? `<a href="#${anchor("call", id)}">${short(id)}</a>` : short(id);
}

const dataRow = (cells: string[], attributes = ""): string => row(cells, `data-search-row ${attributes}`);
const fact = (name: string, value: string, basis: string): string => `<div class="case-fact"><span>${name}</span><strong>${value}</strong><small>${basis}</small></div>`;
const traceStep = (number: number, title: string, basis: string, summary: string, body: string): string =>
  `<details class="trace-step"><summary><span class="trace-number">${number}</span><span class="trace-title">${title}<small>${summary}</small></span>${label(basis, basis === "unknown" ? "amber" : basis === "derived" ? "blue" : "green")}</summary><div class="trace-body">${body}</div></details>`;

export function renderWorkbench(records: Rec[], digest: string, options: WorkbenchOptions): WorkbenchResult {
  if (!Number.isFinite(Date.parse(options.from)) || !Number.isFinite(Date.parse(options.to))) throw new Error("audit_invalid_time_range");
  const from = new Date(options.from).toISOString(), to = new Date(options.to).toISOString();
  if (from >= to) throw new Error("audit_invalid_time_range");
  const selected = records.filter((record) => typeof record.ts === "string" && record.ts >= from && record.ts < to);
  const calls = selected.filter((record) => record.kind === "llm-call") as Call[];
  const decisions = selected.filter((record) => record.kind === "decision" && !record.qdl);
  const companions = new Map(records.filter((record) => record.kind === "decision" && record.qdl && typeof record.refId === "string").map((record) => [record.refId!, record]));
  const reviews = new Map<string, Rec>();
  records.filter((record) => record.kind === "review" && typeof record.refId === "string").forEach((record) => reviews.set(record.refId!, record));
  const sessions = listSessions(calls.filter((call) => str(obj(call.session).id) && obj(call.context).bytes));
  const visibleSessions = new Set(sessions.slice(0, MAX_SESSIONS).map((session) => session.id));
  const callRows = calls.slice(-MAX_ROWS).reverse();
  const displayed = new Set(callRows.map((call) => str(call.id)));
  const findings = calls.flatMap((call) => {
    const decision = obj(call.decision);
    return [...array(decision.findings).map((finding) => ({ call, kind: "Scan finding", value: obj(finding) })),
      ...Object.entries(obj(decision.findingsOverflow)).map(([rule, n]): { call: Call; kind: string; value: Obj } => ({ call, kind: "Scan finding", value: { rule, path: OVERFLOW_PATH, count: n } })),
      ...array(decision.signals).map((signal) => ({ call, kind: "Injection signal", value: obj(signal) }))];
  });
  const scanEvents = calls.reduce((total, call) => total + findingTotal(call.decision) + array(obj(call.decision).signals).length, 0);
  const events = calls.flatMap((call) => array(call.quinelings).map((event) => ({ call, event: obj(event) })));
  const unknownUsage = calls.filter((call) => {
    const status = bytes(call.upstreamStatus), values = obj(call.usage);
    return status >= 200 && status < 400 && (count(values.input) === null || count(values.output) === null);
  }).length;
  const contextCoverage = calls.filter((call) => bytes(obj(call.context).totalBytes) > 0).length;
  const digestText = safeHash(digest);
  const head = records.length ? safeHash(records[records.length - 1].hash) : "genesis";
  const cards = [
    ["LLM calls", calls.length, "Requests in interval"], ["Sessions", sessions.length, "Linked conversations in interval"],
    ["Scan events", scanEvents, "Rules and paths only"], ["Quinelings seen", events.length, "Observed tool traffic"],
    ["Decisions", decisions.length, "Recorded decisions"], ["Unknown usage", unknownUsage, "Successful calls with missing tokens"],
  ].map(([name, value, caption]) => `<div class="metric"><div class="metric-label">${name}</div><div class="metric-value">${fmt(Number(value))}</div><div class="metric-caption">${caption}</div></div>`).join("");

  const sessionRows = sessions.slice(0, MAX_SESSIONS).map((session) => {
    const matches = calls.filter((call) => obj(call.session).id === session.id);
    const visibleMatches = matches.slice(-MAX_ROWS);
    let view: ReturnType<typeof sessionView> | undefined;
    try { view = sessionView(visibleMatches, session.id); } catch { }
    const turns = new Map(view?.turns.map((turn) => [turn.call.id, turn]) ?? []);
    const detailRows = visibleMatches.map((call) => {
      const turn = turns.get(call.id), link = callLink(call, displayed), decision = obj(call.decision);
      const markers = [turn?.kind, ...(turn?.bust ?? [])].filter(Boolean).map((value) => label(String(value), "amber")).join(" ") || "—";
      return dataRow([safeText(call.ts, 40), `${link}<div class="subtle">turn ${safeText(obj(call.session).turn)}</div>`, contextBar(call), usage(call), markers,
        label(str(decision.action) || "unknown", str(decision.action) === "block" || str(decision.action) === "reject" ? "red" : "blue")]);
    });
    const cache = view?.cacheHit === null || view?.cacheHit === undefined ? "unknown" : `${Math.round(view.cacheHit * 100)}%`;
    return `<details class="session-card" id="${anchor("session", session.id)}"><summary><span class="session-id">${safeText(session.id)}</span><span>${fmt(session.requests)} calls</span><span>${fmt(session.turns)} turns</span><span>${fmt(session.branches)} branches</span><span>peak ${view?.peakTokens === null || view?.peakTokens === undefined ? "unknown" : fmt(view.peakTokens)} tokens${matches.length > MAX_ROWS ? " in shown calls" : ""}</span><span>cache read ${cache}${matches.length > MAX_ROWS ? " in shown calls" : ""}</span></summary>${shown(matches.length, MAX_ROWS)}${table(["Time", "Call", "Context composition", "Provider usage", "Cache / branch", "Decision"], detailRows, "No linked calls in this interval.")}</details>`;
  });

  const historyRows = callRows.map((call) => {
    const decision = obj(call.decision), session = obj(call.session), signals = array(decision.signals);
    const status = typeof call.upstreamStatus === "number" ? String(call.upstreamStatus) : "—";
    const client = call.virtualKey ? `client ${safeText(call.virtualKey)}` : "no virtual key";
    const alias = call.requestedModel ? `requested ${safeText(call.requestedModel)}` : "";
    const profile = safeHash(obj(call.inspectionProfile).digest);
    const action = `${label(str(decision.action) || "unknown", ["block", "reject"].includes(str(decision.action)) ? "red" : "blue")}<div class="subtle">${safeText(decision.mode)}${profile !== "—" ? ` · profile ${profile.slice(0, 12)}…` : ""}</div>`;
    const extra = [decision.sandbox ? `sandbox ${safeText(decision.sandbox)}` : "", call.content === "redacted" ? "redacted output retained" : call.content === "hash" ? "output hash only" : ""].filter(Boolean).join(" · ");
    return dataRow([safeText(call.ts, 40), `<span id="${anchor("call", str(call.id))}"><a href="#${anchor("investigate", str(call.id))}">${short(call.id)}</a></span>`, `${safeText(call.provider)} / ${safeText(call.model)}`,
      `${safeText(call.systemId)}<div class="subtle">${client}${alias ? ` · ${alias}` : ""}</div>`, session.id ? `${visibleSessions.has(str(session.id)) ? `<a href="#${anchor("session", str(session.id))}">${short(session.id)}</a>` : short(session.id)} · t${safeText(session.turn)}` : "unlinked",
      action, `${status}<div class="subtle">${fmt(findingTotal(decision))} findings ·${fmt(signals.length)} signals${extra ? ` · ${extra}` : ""}</div>`, usage(call)]);
  });

  const findingRows = findings.slice(-MAX_ROWS).reverse().map(({ call, kind, value }) => dataRow([
    safeText(call.ts, 40), label(kind, kind === "Scan finding" ? "red" : "amber"), safeText(value.rule), `${safeText(value.path, 256)}${times(value.count)}`,
    safeText(obj(call.decision).action), callLink(call, displayed), obj(call.session).id ? short(obj(call.session).id) : "—",
  ]));

  const eventRows = events.slice(-MAX_ROWS).reverse().map(({ call, event }) => dataRow([
    safeText(call.ts, 40), safeText(event.where), safeText(event.op), safeText(event.path, 256), safeText(event.status), safeText(obj(event.error).code), safeHash(event.sourceHash), safeHash(event.intentHash), callLink(call, displayed),
  ]));

  const decisionRows = decisions.slice(-MAX_ROWS).reverse().map((decision) => {
    const companion = companions.get(decision.id), qdl = obj(companion?.qdl), review = obj(reviews.get(decision.id)?.review);
    const id = str(decision.id), commandId = /^[A-Za-z0-9:_-]{1,128}$/.test(id) ? id : "DECISION_ID";
    const command = `ai-audit receipt --log LOG --decision ${commandId} --format svg --output decision.svg`;
    const exportCell = qdl.status === "completed" ? `<details><summary>Export command</summary><code class="command">${escapeHtml(command)}</code><div class="subtle">Export verifies and replays before creating a portable receipt. Review exact source and inputs before sharing.</div></details>` : `<span class="muted">Not portable</span>`;
    return dataRow([safeText(decision.ts, 40), `<span id="${anchor("decision", id)}">${short(id)}</span>`, `${safeText(decision.systemId)} / ${safeText(decision.useCase)}`,
      label(str(qdl.status) || "no QDL step", str(qdl.status) === "completed" ? "green" : "amber"), safeHash(qdl.sourceHash), safeHash(qdl.inputHash), safeHash(qdl.outputsHash), `${safeText(review.decision)}${options.attestation?.decisionId === id ? `<div>${label("signed review record", "green")}</div>` : ""}`,
      decision.llmCallId ? short(decision.llmCallId) : "—", exportCell]);
  });

  const decisionsByCall = new Map<string, Rec[]>();
  for (const entry of decisions) if (entry.llmCallId) decisionsByCall.set(entry.llmCallId, [...(decisionsByCall.get(entry.llmCallId) ?? []), entry]);
  const visibleDecisionIds = new Set(decisions.slice(-MAX_ROWS).map((entry) => entry.id));
  const investigationRows = callRows.map((call) => {
    const id = str(call.id), decision = obj(call.decision), session = obj(call.session), context = obj(call.context), values = obj(call.usage);
    const findings = array(decision.findings).map(obj), signals = array(decision.signals).map(obj), events = array(call.quinelings).map(obj);
    const linked = decisionsByCall.get(id) ?? [];
    const stopped = decision.action === "block" || decision.action === "reject";
    const upstreamKnown = typeof call.upstreamStatus === "number" && Number.isInteger(call.upstreamStatus);
    const requestFacts = [fact("API route", `${safeText(call.api)} · ${safeText(call.endpoint)}`, "observed record"), fact("Provider / model", `${safeText(call.provider)} · ${safeText(call.model)}`, "observed record"),
      fact("Client / system", `${safeText(call.virtualKey)} · ${safeText(call.systemId)}`, "observed record"), fact("Context", bytes(context.totalBytes) ? `${fmt(bytes(context.totalBytes))} bytes` : "unknown", bytes(context.totalBytes) ? "observed size" : "not recorded"),
      fact("Input tokens", fmtCount(values.input), count(values.input) === null ? "unknown" : "provider reported"), fact("Output tokens", fmtCount(values.output), count(values.output) === null ? "unknown" : "provider reported")].join("");
    const findingList = [...findings.map((entry) => `<li>Finding · ${safeText(entry.rule)} · <code>${safeText(entry.path, 256)}</code>${times(entry.count)}</li>`),
      ...Object.entries(obj(decision.findingsOverflow)).map(([rule, n]) => `<li>Finding · ${safeText(rule)} · ${OVERFLOW_PATH}${times(n)}</li>`),
      ...signals.map((entry) => `<li>Advisory signal · ${safeText(entry.rule)} · <code>${safeText(entry.path, 256)}</code></li>`)].join("");
    const eventList = events.map((entry) => `<li>${safeText(entry.where)} · ${safeText(entry.op)} · ${safeText(entry.status)} · <code>${safeText(entry.path, 256)}</code></li>`).join("");
    const linkedList = linked.map((entry) => {
      const qdl = obj(companions.get(entry.id)?.qdl), review = obj(reviews.get(entry.id)?.review), visible = visibleDecisionIds.has(entry.id);
      return `<li>${visible ? `<a href="#${anchor("decision", str(entry.id))}">${short(entry.id)}</a>` : short(entry.id)} · QDL ${safeText(qdl.status)} · review ${safeText(review.decision)}${options.attestation?.decisionId === entry.id ? " · signed checkpoint verified with supplied key" : " · origin not checked"}</li>`;
    }).join("");
    const flow = [
      traceStep(1, "Client request", "observed", "Route and context metadata", `<div class="case-facts">${fact("Requested model", safeText(call.requestedModel ?? call.model), "observed record")}${fact("Stream", call.stream === true ? "yes" : call.stream === false ? "no" : "unknown", call.stream === undefined ? "unknown" : "observed record")}${fact("Session", session.id ? `${short(session.id)} · turn ${safeText(session.turn)}` : "unlinked", session.id ? "derived from message prefix" : "unknown")}</div><div class="case-composition">${contextBar(call)}</div><p>Prompt text is not retained in the audit log.</p>`),
      traceStep(2, "Inspection", decision.action ? "observed" : "unknown", `${safeText(decision.mode)} · ${safeText(decision.action)}`, `<p>${fmt(findingTotal(decision))} scan findings ·${fmt(signals.length)} advisory signals. Values are not retained.</p>${findingList ? `<ul>${findingList}</ul>` : "<p>No rule paths recorded.</p>"}<p>Profile digest: <code>${safeHash(obj(call.inspectionProfile).digest)}</code></p>`),
      traceStep(3, "Forwarding", stopped || upstreamKnown ? "observed" : "unknown", stopped ? "Stopped by policy" : upstreamKnown ? `Upstream status ${call.upstreamStatus}` : "No upstream response recorded", `<div class="case-facts">${fact("Action", safeText(decision.action), "observed record")}${fact("Upstream status", upstreamKnown ? safeText(call.upstreamStatus) : "unknown", upstreamKnown ? "observed record" : "not recorded")}${fact("Error", safeText(call.error), call.error ? "observed record" : "not recorded")}</div><p>${stopped ? "The policy record says this request was stopped before forwarding." : upstreamKnown ? "An upstream response was recorded. The audit log does not retain the forwarded request body." : "The record does not establish that the upstream received this request."}</p>`),
      traceStep(4, "Provider result", upstreamKnown ? "observed" : "unknown", upstreamKnown ? `HTTP ${call.upstreamStatus} · ${fmtCount(values.input)} input / ${fmtCount(values.output)} output tokens` : "No provider response metadata", `<div class="case-facts">${fact("Response model", safeText(call.responseModel), call.responseModel ? "observed record" : "unknown")}${fact("Latency", typeof call.latencyMs === "number" ? `${fmt(call.latencyMs)} ms` : "unknown", "proxy measured")}${fact("Output content", call.content === "redacted" ? "redacted content retained in log" : call.content === "hash" ? "hash only" : "not recorded", "retention mode")}</div><p>Unknown usage is not counted as zero.</p>`),
      traceStep(5, "Tool observations", events.length ? "observed" : "unknown", events.length ? `${events.length} Quineling event${events.length === 1 ? "" : "s"}` : "No Quineling event recorded", eventList ? `<ul>${eventList}</ul><p>A tool call is a request; a tool result is an observation in traffic. Neither proves independent execution.</p>` : "<p>No Quineling tool event is linked to this call.</p>"),
      traceStep(6, "QDL decision and review", linked.length ? "derived" : "unknown", linked.length ? `${linked.length} decision${linked.length === 1 ? "" : "s"} linked by call ID` : "No linked decision in this interval", linkedList ? `<ul>${linkedList}</ul><p>The workbench does not replay QDL. Export and verify a receipt separately.</p>` : "<p>A QDL decision may be outside the selected interval or may not exist.</p>"),
      traceStep(7, "Integrity and origin", "derived", "Chain verified · external anchor not checked", `<p>This request belongs to the verified snapshot. Chain consistency does not establish who produced it. No external anchor is checked here.</p>`),
    ].join("");
    return `<details class="investigation-card" id="${anchor("investigate", id)}" data-search-row><summary><span class="case-id">${short(id, 36)}</span><span>${safeText(call.provider)} / ${safeText(call.model)}</span><span>${label(str(decision.action) || "unknown", stopped ? "red" : "blue")}</span><span class="subtle">${safeText(call.ts, 40)}</span></summary><div class="investigation-body"><div class="case-facts">${requestFacts}</div><div class="trace">${flow}</div></div></details>`;
  });

  const legend = SEGMENTS.map((segment) => `<span><i style="background:${SEGMENT_COLORS[segment]}"></i>${SEGMENT_LABELS[segment]}</span>`).join("");
  const content = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>ai-audit evidence workbench</title><style>
  :root{color-scheme:dark;font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0c111b;color:#e7edf6}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 80% 0%,#172b3a 0,#0c111b 34rem)}a{color:#84c8ff;text-decoration:none}a:hover{text-decoration:underline}button,input{font:inherit}.shell{display:grid;grid-template-columns:236px minmax(0,1fr);min-height:100vh}.nav{position:sticky;top:0;align-self:start;height:100vh;padding:30px 18px;background:#101a27;border-right:1px solid #28394a}.brand{font-weight:800;font-size:20px;letter-spacing:-.04em}.brand span{color:#54d7bf}.nav small{display:block;color:#93a8bb;margin:2px 0 30px}.nav a{display:block;color:#b7c9d9;padding:10px 12px;border-radius:9px;margin:4px 0}.nav a:hover,.nav a:focus-visible{background:#1b3040;color:#fff}.nav-note{margin-top:34px;padding:14px;border:1px solid #365064;border-radius:12px;color:#9eb4c4;font-size:12px}.main{min-width:0;max-width:1600px;padding:34px clamp(18px,3vw,54px) 70px}.eyebrow{text-transform:uppercase;letter-spacing:.15em;color:#72d9c8;font-size:11px;font-weight:800}.hero{display:flex;gap:24px;align-items:end;justify-content:space-between}.hero h1{font-size:clamp(31px,4vw,54px);line-height:1.08;letter-spacing:-.055em;margin:7px 0 10px}.hero p{max-width:720px;color:#aebfd0;margin:0}.stamp{font-size:12px;color:#9db2c4;white-space:nowrap}.status{display:flex;gap:12px;flex-wrap:wrap;margin:25px 0}.status span{border:1px solid #325a58;background:#132d2c;color:#9becd6;border-radius:100px;padding:7px 12px;font-weight:700}.status .private{border-color:#735d38;background:#352a19;color:#f3ca7b}.toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;margin:30px 0 16px}.toolbar input{width:min(100%,420px);background:#152131;border:1px solid #365064;color:#fff;border-radius:10px;padding:11px 14px;outline:none}.toolbar input:focus{border-color:#72d9c8;box-shadow:0 0 0 3px #72d9c822}.toolbar span{color:#9fb4c7}.metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.metric{background:linear-gradient(145deg,#172839,#121d2c);border:1px solid #304255;border-radius:14px;padding:18px;min-height:126px}.metric-label{color:#aac2d0;font-weight:700}.metric-value{font-size:34px;font-weight:800;letter-spacing:-.06em;margin:7px 0 0}.metric-caption{color:#8fa5b6;font-size:12px}.section{scroll-margin-top:20px;margin-top:52px}.section-head{display:flex;justify-content:space-between;gap:20px;margin-bottom:18px}.section h2{font-size:27px;letter-spacing:-.035em;margin:3px 0}.section p{color:#a8bac9;margin:0;max-width:850px}.card,.session-card{background:#121e2d;border:1px solid #2d4053;border-radius:14px;padding:18px;margin:12px 0}.session-card{padding:0;overflow:hidden}.session-card summary{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center;cursor:pointer;padding:16px 18px;color:#aec3d3}.session-card summary:hover{background:#192b3b}.session-id{font-weight:800;color:#e5f5fb;min-width:160px}.session-card .table-wrap{border:0;border-top:1px solid #2d4053;border-radius:0;margin:0}.table-wrap{overflow:auto;border:1px solid #2d4053;border-radius:12px;background:#101b29}table{border-collapse:collapse;width:100%;min-width:850px}th{text-align:left;position:sticky;top:0;background:#1b2a39;color:#a9c0d0;font-size:11px;text-transform:uppercase;letter-spacing:.09em;padding:12px 14px;white-space:nowrap}td{border-top:1px solid #243447;padding:12px 14px;vertical-align:top}tbody tr:hover{background:#192b3b}code{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#c2e6f7;overflow-wrap:anywhere}.command{display:block;margin:8px 0;padding:10px;background:#0d1724;border-radius:7px;min-width:210px}.chip{display:inline-block;border-radius:100px;padding:3px 9px;font-size:11px;font-weight:800;white-space:nowrap}.chip.blue{background:#153b61;color:#8bc9ff}.chip.red{background:#602b38;color:#ffb5c0}.chip.amber{background:#594322;color:#f9d08f}.chip.green{background:#214d42;color:#9ee7c3}.subtle,.muted{color:#8fa6b8;font-size:12px}.numbers{white-space:nowrap;font-variant-numeric:tabular-nums}.context-bar{height:15px;display:flex;min-width:230px;border-radius:5px;overflow:hidden;background:#34475b}.bar-part{height:100%;min-width:1px}.breakdown,.legend{display:flex;flex-wrap:wrap;gap:3px 10px;margin-top:8px;color:#9fb3c4;font-size:11px}.breakdown span,.legend span{white-space:nowrap}.breakdown i,.legend i{display:inline-block;width:7px;height:7px;border-radius:2px;margin-right:4px}.legend{margin:10px 0 18px}.notice,.empty{padding:14px 18px;background:#1c2935;border:1px solid #384a57;border-radius:10px;color:#bbccda}.empty{padding:24px}.explain{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.explain .card{margin:0}.explain h3{margin:0 0 8px;font-size:16px}.explain p{font-size:13px}.foot{margin-top:50px;padding-top:25px;border-top:1px solid #304252;color:#8fa6b8;font-size:12px}.hash{font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.filter-hidden{display:none!important}a:focus-visible,summary:focus-visible{outline:2px solid #72d9c8;outline-offset:3px}@media(max-width:1050px){.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.shell{grid-template-columns:1fr}.nav{position:static;height:auto;display:flex;flex-wrap:wrap;gap:4px 10px;padding:14px 18px}.nav .brand,.nav small,.nav-note{display:none}.nav a{margin:0;padding:7px 9px}.main{padding-top:24px}}@media(max-width:650px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{min-height:106px;padding:13px}.metric-value{font-size:28px}.hero{display:block}.stamp{margin-top:15px;white-space:normal}.toolbar{display:block}.toolbar input{width:100%;margin-bottom:6px}.explain{grid-template-columns:1fr}.nav{overflow:auto;flex-wrap:nowrap}.nav a{white-space:nowrap}.main{padding:20px 14px 50px}}
  .investigation-card{background:#121e2d;border:1px solid #2d4053;border-radius:14px;margin:10px 0;scroll-margin-top:16px}.investigation-card>summary{display:flex;align-items:center;gap:16px;flex-wrap:wrap;cursor:pointer;padding:16px 18px}.investigation-card>summary:hover,.trace-step>summary:hover{background:#192b3b}.investigation-card[open]>summary{border-bottom:1px solid #2d4053}.case-id{font-weight:800;color:#e5f5fb;min-width:165px}.investigation-body{padding:18px}.case-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.case-fact{padding:11px 12px;background:#0d1724;border:1px solid #263a4a;border-radius:9px;min-width:0}.case-fact span,.case-fact small{display:block;color:#91a8ba;font-size:11px}.case-fact strong{display:block;margin:3px 0;color:#e1eff6;font-size:13px;overflow-wrap:anywhere}.case-composition{margin:16px 0}.trace{margin-top:18px;border-left:2px solid #3f6a76;padding-left:13px}.trace-step{margin:8px 0;background:#142232;border:1px solid #2d4053;border-radius:10px}.trace-step>summary{display:flex;gap:12px;align-items:center;cursor:pointer;padding:12px}.trace-number{width:24px;height:24px;border-radius:50%;background:#245965;color:#c5fff3;display:grid;place-items:center;font-size:11px;font-weight:800;flex:none}.trace-title{flex:1;font-weight:800}.trace-title small{display:block;color:#9fb4c7;font-weight:400}.trace-body{padding:0 15px 15px 48px;color:#b9cbd9}.trace-body p{margin:8px 0;font-size:13px}.trace-body ul{margin:8px 0;padding-left:18px}.trace-body li{margin:5px 0;overflow-wrap:anywhere}@media(max-width:760px){.case-facts{grid-template-columns:1fr}.trace-body{padding-left:15px}}
  </style></head><body><div class="shell"><nav class="nav" aria-label="Workbench sections"><div class="brand">ai<span>·</span>audit</div><small>Evidence workbench</small><a href="#overview">Overview</a><a href="#investigations">Investigate</a><a href="#sessions">Sessions</a><a href="#calls">Call history</a><a href="#scan">Scan history</a><a href="#quinelings">Quinelings</a><a href="#decisions">Decisions</a><a href="#evidence">Evidence &amp; sharing</a><a href="#coverage">Coverage</a><div class="nav-note">Private local snapshot. Share a verified receipt for one decision, not this entire workbench.</div></nav><main class="main"><header id="overview" class="hero"><div><div class="eyebrow">Verified local snapshot</div><h1>Evidence workbench</h1><p>Trace one interval from proxy activity to sessions, context composition, scan events and QDL decisions. Prompt text and detected values were not retained by the proxy.</p></div><div class="stamp">${safeText(from, 36)}<br>to ${safeText(to, 36)}</div></header><div class="status"><span>✓ Hash chain verified</span><span>${fmt(records.length)} records in snapshot</span><span class="private">Private investigation file</span></div><div class="toolbar"><input id="search" type="search" aria-label="Filter history rows and investigations" placeholder="Filter by ID, rule, model, status…"><span>Showing metadata only · ${fmt(contextCoverage)} of ${fmt(calls.length)} calls have context sizes</span></div><div class="metrics">${cards}</div>
  ${section("investigations", "01 / Request path", "Investigate a request", "Open a call to follow recorded metadata and linked decisions. Observed means present in the verified log; derived means joined or inferred; unknown means evidence is absent. Prompt values are never reconstructed.", `${shown(calls.length, MAX_ROWS)}${investigationRows.length ? investigationRows.join("") : '<div class="empty">No proxied LLM calls in this interval.</div>'}`)}
  ${section("sessions", "01 / Conversation map", "Sessions & context", "Segments show byte composition, not prompt text. Provider-scaled tokens are estimates by size; unknown usage stays unknown.", `<div class="legend">${legend}</div>${shown(sessions.length, MAX_SESSIONS)}${sessionRows.length ? sessionRows.join("") : '<div class="empty">No linked sessions in this interval. Calls using previous_response_id or unlinked message histories can appear in call history instead.</div>'}<div class="card"><strong>Need the full context map?</strong><p>Run <code>ai-audit context --log LOG --session SESSION_ID --output session.html</code> for the per-turn arena, cache busts, retries and branches.</p></div>`)}
  ${section("calls", "02 / Request trail", "Call history", "Every row is one proxied LLM request. It links decisions, provider usage, scan counts and the inferred session when one exists.", `${shown(calls.length, MAX_ROWS)}${table(["Time", "Request ID", "Provider / model", "System", "Session", "Action", "Upstream", "Usage"], historyRows, "No proxied LLM calls in this interval.")}`)}
  ${section("scan", "03 / Safety trail", "Scan & signal history", "A finding records a rule and JSON path, never the matched value. Prompt-injection signals are advisory observations on untrusted content.", `${shown(findings.length, MAX_ROWS)}${table(["Time", "Type", "Rule", "JSON path", "Action", "Call", "Session"], findingRows, "No findings or injection signals in this interval.")}`)}
  ${section("quinelings", "04 / Observed tools", "Quinelings activity", "These events came through LLM tool traffic. A call or result does not prove that a recorded decision was approved or independently verified.", `${shown(events.length, MAX_ROWS)}${table(["Time", "Where", "Operation", "JSON path", "Status", "Error code", "Program hash", "Intent hash", "Call"], eventRows, "No Quinelings tool events observed in this interval.")}`)}
  ${section("decisions", "05 / Recorded outcomes", "QDL decisions & reviews", "The companion QDL step supplies status and program identity. Exporting a portable receipt separately verifies a completed decision before creating a shareable file.", `${shown(decisions.length, MAX_ROWS)}${table(["Time", "Decision ID", "System / use case", "QDL status", "Program hash", "Input hash", "Output hash", "Latest review", "LLM call", "Share one decision"], decisionRows, "No recorded decisions in this interval. Observed Quinelings tool activity above may still exist.")}`)}
  ${section("evidence", "06 / Trust boundary", "Evidence, reports & sharing", "Use the local log for investigation. Give a recipient a selected portable receipt after reviewing its exact contents.", `<div class="explain"><div class="card"><h3>What this snapshot proves</h3><p>The records form a self-consistent hash chain at export time. Snapshot digest:</p><div class="hash">${digestText}</div><p>Head record hash:</p><div class="hash">${head}</div></div><div class="card"><h3>${options.attestation ? "Signed decision checkpoint" : "What it does not prove"}</h3>${options.attestation ? `<p>Receipt replay, signature and public-key fingerprint verified for decision ${short(options.attestation.decisionId, 40)}. The verified log contains the signed checkpoint at record ${fmt(options.attestation.checkpointCount)}.</p><p>Recorded verdict: ${label(options.attestation.verdict, options.attestation.verdict === "approved" ? "green" : options.attestation.verdict === "rejected" ? "red" : "amber")}. A signature authenticates the key, not a person's identity or the time claimed by the signer.</p><div class="hash">Key ${safeHash(options.attestation.keyId)}<br>Head ${safeHash(options.attestation.head)}</div>` : `<p>A chain alone does not authenticate who created it. Compare against an independently held anchor when origin matters. This page does not replay QDL or verify human identity.</p><code>ai-audit verify --log LOG --anchors ANCHORS</code>`}</div><div class="card"><h3>Share one Quinelings decision</h3><p>Export a portable SVG or JSON package, then let the recipient run the independent verifier. The package contains exact QDL source and inputs, so review it first.</p><code>ai-audit receipt --log LOG --decision ID --format svg --output decision.svg</code><br><code>ai-audit verify-receipt --input decision.svg</code><br><code>ai-audit verify-attestation --input decision.svg --attestation FILE --public-key KEY</code></div><div class="card"><h3>More investigation</h3><p>Generate a period report, compare session-policy limits, or scrub an input history. Grafana alerts are live operational signals and are not stored in this audit log.</p><code>ai-audit report --log LOG --from ISO --to ISO</code><br><code>ai-audit lab --log LOG --session ID --output comparison.html</code><br><code>ai-audit scrub --input HISTORY --output CLEAN.json</code></div></div>`)}
  ${section("coverage", "07 / Feature map", "Where every feature lives", "The workbench shows what the audit log can prove. Other features have their own source of truth or require an explicit export.", table(["Feature", "Visible here", "Deeper view or boundary"], [
    row(["Secret and PII protection", "Action, rule and JSON path", "Detected values are never stored. Use <code>profile</code> for scanner identity."]),
    row(["Prompt-injection signals", "Advisory rule and path", "Signal does not prove an attack succeeded."]),
    row(["Attachments and sandbox", "Attachment context size and per-call sandbox state", "Inspection counts and current sandbox health are in Grafana; attachment content is not in the log."]),
    row(["Sessions and context", "Linked calls, composition, usage and cache markers", "Use <code>context --session ID</code> for the full arena. Prompt text was not retained."]),
    row(["Virtual keys and aliases", "Client name and requested model on each call", "Provider keys are never displayed or logged."]),
    row(["Quinelings observed in traffic", "Operation, path, status and identity hashes", "An observed tool result is separate from a recorded QDL decision."]),
    row(["Recorded QDL decisions", "Outcome, program/input/output hashes and review verdict", "Use <code>receipt</code>, <code>verify-receipt</code> and <code>policies</code> for replay and versions."]),
    row(["Reports and log integrity", "Snapshot digest, head hash and selected counts", "Use <code>report</code> and independently held anchors for stronger origin evidence."]),
    row(["Live alerts and performance", "Not recorded in this file", "Grafana reads aggregate metrics and evaluates alert rules."]),
    row(["Quote checks and history scrub", "Not written to the proxy log by default", "Use <code>check-quotes</code> and <code>scrub</code> explicitly; keep their outputs separately."]),
  ], ""))}
  <footer class="foot">Generated from a verified local log snapshot. Tables show at most ${fmt(MAX_ROWS)} latest rows per section and ${fmt(MAX_SESSIONS)} sessions. Regenerate after new requests. Retained source, inputs, output content and reviewer notes are excluded from this page.</footer></main></div><script>const search=document.getElementById('search');search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase();for(const row of document.querySelectorAll('[data-search-row]'))row.classList.toggle('filter-hidden',!!q&&!row.textContent.toLocaleLowerCase().includes(q))});function revealHash(){const target=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(!target)return;for(let node=target;node;node=node.parentElement)if(node instanceof HTMLDetailsElement)node.open=true}addEventListener('hashchange',revealHash);document.addEventListener('click',event=>{const link=event.target.closest?.('a[href^=\"#\"]');if(!link)return;const target=document.getElementById(decodeURIComponent(link.hash.slice(1)));for(let node=target;node;node=node.parentElement)if(node instanceof HTMLDetailsElement)node.open=true});revealHash()</script></body></html>`;
  return { html: content, calls: calls.length, sessions: sessions.length, findings: scanEvents, decisions: decisions.length, observedQuinelings: events.length };
}
