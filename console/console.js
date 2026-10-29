"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const PAGES = [
  ["overview", "Overview"], ["decisions", "Decisions"], ["use-cases", "Use cases"], ["flow", "Request flow"], ["requests", "Requests"],
  ["sessions", "Sessions and context"], ["keys", "Keys and budgets"], ["integrity", "Integrity"], ["live", "Live counters"],
];
const SUBTITLES = {
  overview: "What needs attention now, and what the log suggests changing.",
  decisions: "Results of rules and models that a person approves, overrides or rejects. Your verdict is written to the log.",
  "use-cases": "Each kind of work, its limits from gateway.json, and how it behaved (ADR 0053).",
  flow: "Every request passes the same states. The numbers show how many reached each state and where they stopped.",
  requests: "One row per request or refusal. Open a row for its path and its context.",
  sessions: "Conversations linked by the proxy. Each row is one turn; each block is part of the context sent to the model.",
  keys: "Virtual keys from gateway.json, their limits, budgets and use.",
  integrity: "Whether the log can be trusted: hash chain, segments, anchors and inspection profiles.",
  live: "Counters read from the running proxy's /metrics.",
};
const STAGES = [
  ["received", "Request received", "An HTTP request reached the proxy."],
  ["key", "Virtual key", "The client key is known and may use this provider."],
  ["useCase", "Use case", "The request names a row of the use-case table."],
  ["shape", "Route and body", "Known route, body within the size limit, valid JSON."],
  ["model", "Model allowed", "The model is on the key's list and the use case's list."],
  ["inspect", "Inspection", "Secrets and personal data are looked for in the whole request."],
  ["decide", "Decision", "Forward as is, forward redacted, or block."],
  ["budget", "Token budget", "The key's token budget has room for this request."],
  ["upstream", "Provider", "The provider was called and answered."],
  ["gate", "Tool gate", "Tool calls the model proposed are checked before the client gets them."],
  ["recorded", "Delivered and recorded", "The answer reached the client and one record is in the log."],
];
const OUTCOMES = {
  delivered: ["Delivered", "ok"], held: ["Tool call held", "warn"], rewritten: ["Answer rewritten", "warn"], "upstream-error": ["Provider error", "warn"],
  "upstream-failed": ["No provider answer", "bad"], blocked: ["Blocked", "bad"], rejected: ["Rejected", "bad"], budget: ["Budget refused", "bad"], refused: ["Refused", "bad"],
};
const KINDS = { s: "system", t: "tools", u: "user", a: "assistant", r: "toolResults", f: "attachments", o: "other" };
const KIND_LABELS = { system: "System", tools: "Tool definitions", user: "User", assistant: "Assistant", toolResults: "Tool results", attachments: "Attachments", other: "Other" };
const STATE_CHIPS = { waiting: "warn", acted: "ok", approved: "ok", overridden: "info", rejected: "bad" };
const STATE_LABELS = { waiting: "Waiting", acted: "Done by rule", approved: "Approved", overridden: "Overridden", rejected: "Rejected", all: "All" };

let token = "";
let route = { page: "overview", id: null };
let range = "24";
let timer = null;
let colorBy = "kind";

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  append(el, children);
  return el;
}
function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
}
const fmt = (n) => typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : "—";
const pct = (part, whole) => whole ? `${Math.round((part / whole) * 1000) / 10}%` : "—";
const bytes = (n) => typeof n !== "number" ? "—" : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`;
const short = (v, n = 10) => typeof v === "string" ? (v.length > n ? v.slice(0, n) + "…" : v) : "—";
const time = (iso) => { if (!iso) return "—"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
const ago = (iso) => { if (!iso) return "never"; const s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const chip = (text, tone) => h("span", { class: `chip${tone ? " " + tone : ""}` }, text);
const outcomeChip = (o) => chip((OUTCOMES[o] ?? [o])[0], (OUTCOMES[o] ?? [])[1]);
const value = (v) => v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
const card = (title, sub, body, extra) => h("article", { class: "card" }, h("header", {}, h("div", {}, h("h2", {}, title), sub ? h("p", {}, sub) : null), extra ?? null), body);
const table = (heads, rows, empty) => rows.length
  ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, heads.map((x) => h("th", { class: x.startsWith("#") ? "num" : null }, x.replace(/^#/, ""))))), h("tbody", {}, rows)))
  : h("div", { class: "empty" }, empty);
const td = (v, cls) => h("td", { class: cls ?? null }, v);
const tdn = (v) => h("td", { class: "num" }, typeof v === "number" ? fmt(v) : v);
const link = (text, hash) => h("a", { href: hash, onclick: (e) => { e.stopPropagation(); } }, text);

function tip(el, text) {
  el.addEventListener("pointermove", (e) => { const t = $("tip"); t.textContent = text; t.hidden = false; t.style.left = `${Math.min(e.clientX + 14, innerWidth - 360)}px`; t.style.top = `${e.clientY + 14}px`; });
  el.addEventListener("pointerleave", () => { $("tip").hidden = true; });
  return el;
}

async function api(path, init) {
  const response = await fetch(`/api/${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`), { status: response.status });
  return body;
}
const withRange = (path) => `${path}${path.includes("?") ? "&" : "?"}hours=${range}`;

function readRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  route = { page: PAGES.some(([p]) => p === parts[0]) ? parts[0] : "overview", id: parts[1] ?? null, filter: parts[2] ?? null };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function nav(counts) {
  $("nav").replaceChildren(...PAGES.map(([id, label]) => {
    const n = counts?.[id];
    return h("a", { href: `#/${id}`, "aria-current": route.page === id ? "page" : null }, label, n ? h("span", { class: `badge ${id === "overview" ? "bad" : "warn"}` }, fmt(n)) : null);
  }));
}

async function render() {
  readRoute();
  const [, title] = PAGES.find(([p]) => p === route.page);
  $("title").textContent = title;
  $("subtitle").textContent = SUBTITLES[route.page];
  $("banner").hidden = true;
  try {
    const overview = await api(withRange("overview"));
    header(overview);
    nav({ overview: overview.attention.filter((a) => a.severity === "critical").length, decisions: overview.kpis.waiting });
    const page = await PAGE_RENDERERS[route.page](overview);
    $("page").replaceChildren(page);
  } catch (error) {
    if (error.status === 401) return login("The token was refused. Copy the URL the console printed at start.");
    $("banner").hidden = false;
    $("banner").textContent = `Could not load: ${error.message}`;
  }
}

function header(o) {
  const pill = $("chain-pill");
  pill.className = `pill ${o.log.chain.ok ? "ok" : "bad"}`;
  pill.textContent = o.log.chain.ok ? `Chain intact · ${fmt(o.log.records)} records` : "Chain broken";
  $("side-foot").replaceChildren(
    h("div", {}, h("b", {}, "Log "), o.log.path), h("div", {}, `${fmt(o.log.files)} file${o.log.files === 1 ? "" : "s"} · last record ${ago(o.log.lastTs)}`),
    h("div", {}, h("b", {}, "Config "), o.config ?? "none"), h("div", {}, h("b", {}, "Reviewer "), o.reviewer ?? "read-only"));
}

function kpi(label, n, sub, hash, tone) {
  const inner = [h("span", {}, label), h("strong", { class: "num" }, typeof n === "string" ? n : fmt(n)), sub ? h("small", {}, sub) : null];
  return hash ? h("a", { class: `card kpi${tone ? " " + tone : ""}`, href: hash }, inner) : h("div", { class: `card kpi${tone ? " " + tone : ""}` }, inner);
}

function snippet(text) {
  const pre = h("pre", {}, text);
  const button = h("button", { class: "btn small", type: "button", onclick: async () => { try { await navigator.clipboard.writeText(text); button.textContent = "Copied"; } catch { button.textContent = "Select and copy"; } } }, "Copy");
  return h("div", { class: "snippet" }, pre, button);
}

async function overviewPage(o) {
  const k = o.kpis;
  const attention = o.attention.length
    ? h("ul", { class: "list" }, o.attention.map((a) => h("li", {}, h("span", { class: `sev ${a.severity}` }), h("div", {}, h("strong", {}, a.title), h("p", {}, a.detail), h("div", { class: "evidence" }, link(`Open ${PAGES.find(([p]) => p === a.page)?.[1] ?? a.page}`, `#/${a.page}`))))))
    : h("div", { class: "empty" }, "Nothing needs attention in this range.");
  const ideas = o.suggestions.length
    ? h("ul", { class: "list" }, o.suggestions.map((x) => h("li", {}, h("span", { class: `sev ${x.severity}` }), h("div", {}, h("strong", {}, x.title), h("p", {}, x.detail),
      h("div", { class: "evidence" }, x.evidence.map((e) => chip(e))), x.snippet ? snippet(x.snippet) : null))))
    : h("div", { class: "empty" }, "No rule found anything to change. Suggestions use fixed rules; each shows the evidence it used.");
  return h("div", { class: "page" },
    h("div", { class: "grid kpis" },
      kpi("Requests", k.requests, "in range", "#/requests"), kpi("Delivered", k.delivered, pct(k.delivered, k.requests), "#/requests/all/delivered"),
      kpi("Blocked or rejected", k.blocked, "stopped by inspection", "#/flow", k.blocked ? "bad" : null), kpi("Refused", k.refused, "before inspection", "#/flow"),
      kpi("Tool calls held", k.held, "by the gate", "#/requests/all/held", k.held ? "warn" : null), kpi("Waiting for review", k.waiting, `of ${fmt(k.decisions)} decisions`, "#/decisions", k.waiting ? "warn" : null)),
    h("div", { class: "grid two" }, card("Needs attention", "Things to act on now.", h("div", { class: "body flush" }, attention)),
      card("Suggestions", "Fixed rules over the log. Nothing is changed for you.", h("div", { class: "body flush" }, ideas))),
    card("Request flow", "The state machine every request goes through. Open Request flow for the full view.", h("div", { class: "body" }, flowDiagram(o.flow, { compact: true }))));
}

function stageRows(flowData) {
  const byStage = Object.fromEntries((flowData?.stages ?? []).map((x) => [x.stage, x]));
  return STAGES.map(([id, label, help]) => ({ id, label, help, data: byStage[id] }));
}

const STOP_OUTCOME = { decide: "blocked", budget: "budget", upstream: "upstream-failed", inspect: "rejected" };

function flowDiagram(flowData, opts = {}) {
  const rows = stageRows(flowData), rowH = opts.compact ? 50 : 62, nodeH = opts.compact ? 36 : 44, W = 720, nodeX = 6, nodeW = 300, sideX = 352, sideW = 362;
  const svg = s("svg", { class: "diagram fixed", viewBox: `0 0 ${W} ${rows.length * rowH}`, width: W, role: "img", "aria-label": "Request state machine with counts" });
  svg.append(s("defs", {}, ["", "live", "out", "flag"].map((k) => s("marker", { id: `arrow${k}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, s("path", { d: "M0,0 L10,5 L0,10 z", class: `arrow ${k}` })))));
  rows.forEach((row, i) => {
    const d = row.data ?? { reached: 0, skipped: 0, flagged: 0, stopped: 0, stops: {}, flags: {} }, y = 2 + i * rowH, mid = y + nodeH / 2;
    const passed = d.reached - d.stopped;
    const state = !d.reached ? "unreached" : d.stopped && d.stopped === d.reached ? "stop" : d.flagged ? "flag" : d.skipped === d.reached ? "skip" : "pass";
    const g = s("g", { class: !d.reached ? "unreached" : null });
    g.append(s("rect", { class: `node ${state}`, x: nodeX, y, width: nodeW, height: nodeH, rx: 9 }));
    g.append(s("text", { x: nodeX + 14, y: mid + 5 }, row.label));
    g.append(s("text", { class: "count", x: nodeX + nodeW - 14, y: mid + 5, "text-anchor": "end" }, fmt(d.reached)));
    svg.append(tip(g, `${row.label}: ${row.help} Reached ${fmt(d.reached)}${d.skipped ? `, not applicable to ${fmt(d.skipped)}` : ""}, stopped ${fmt(d.stopped)}, flagged ${fmt(d.flagged)}.`));
    if (i < rows.length - 1) {
      const live = passed > 0;
      svg.append(s("line", { class: `edge${live ? " live" : ""}`, x1: nodeX + 34, y1: y + nodeH, x2: nodeX + 34, y2: y + rowH - 2, "stroke-width": live ? 2 : 1.2, "marker-end": `url(#arrow${live ? "live" : ""})` }));
      if (!opts.compact && live) svg.append(s("text", { class: "sub", x: nodeX + 46, y: y + nodeH + 13 }, `${fmt(passed)} continue${d.skipped ? ` · ${fmt(d.skipped)} not applicable` : ""}`));
    }
    const stops = Object.entries(d.stops ?? {}).sort((a, b) => b[1] - a[1]), flags = Object.entries(d.flags ?? {}).sort((a, b) => b[1] - a[1]);
    if (!stops.length && !flags.length) return;
    const bad = stops.length > 0, outcome = bad ? STOP_OUTCOME[row.id] ?? "refused" : row.id === "gate" ? "held" : null;
    const side = s("g", { class: outcome ? "clickable" : null, onclick: outcome ? () => go(`#/requests/all/${outcome}`) : null });
    svg.append(s("line", { class: `edge ${bad ? "out" : "flagline"}`, x1: nodeX + nodeW, y1: mid, x2: sideX - 4, y2: mid, "stroke-width": 2, "marker-end": `url(#arrow${bad ? "out" : "flag"})` }));
    side.append(s("rect", { class: bad ? "exit" : "flagbox", x: sideX, y, width: sideW, height: nodeH, rx: 9 }));
    const flagText = flags.map(([k, n]) => `${fmt(n)} ${k}`).join(", ");
    const first = bad ? `${fmt(d.stopped)} stopped: ${stops.map(([k, n]) => `${k.replace(/^audit_/, "")}${stops.length > 1 ? ` ${fmt(n)}` : ""}`).join(", ")}` : `flagged: ${flagText}`;
    const twoLines = bad && flags.length && !opts.compact;
    side.append(s("text", { class: bad ? "exit-text" : "flagtext", x: sideX + 12, y: twoLines ? y + 18 : mid + 5 }, first.length > 50 ? first.slice(0, 49) + "…" : first));
    if (twoLines) side.append(s("text", { class: "flagtext", x: sideX + 12, y: y + 36 }, `also flagged: ${flagText}`));
    svg.append(tip(side, [...stops.map(([k, n]) => `stopped ${k}: ${fmt(n)}`), ...flags.map(([k, n]) => `flagged ${k}: ${fmt(n)}`)].join("\n")));
  });
  return svg;
}

function pathDiagram(path) {
  const rowH = 54, nodeH = 38, W = 520, nodeX = 4, nodeW = 250, noteX = 270;
  const stopIndex = path.stoppedAt ? STAGES.findIndex(([id]) => id === path.stoppedAt) : STAGES.length - 1;
  const svg = s("svg", { class: "diagram fixed", viewBox: `0 0 ${W} ${STAGES.length * rowH}`, width: W, role: "img", "aria-label": "Path of this request through the state machine" });
  svg.append(s("defs", {}, ["", "live"].map((k) => s("marker", { id: `parrow${k}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, s("path", { d: "M0,0 L10,5 L0,10 z", class: `arrow ${k}` })))));
  STAGES.forEach(([id, label, help], i) => {
    const state = path.stages[id] ?? "unreached", y = 4 + i * rowH;
    const g = s("g", { class: state === "unreached" ? "unreached" : null });
    g.append(s("rect", { class: `node ${state}`, x: nodeX, y, width: nodeW, height: nodeH, rx: 9 }));
    g.append(s("text", { x: nodeX + 12, y: y + 24 }, label));
    g.append(s("text", { class: "sub", x: nodeX + nodeW - 12, y: y + 24, "text-anchor": "end" }, { pass: "passed", flag: "flagged", stop: "stopped", skip: "n/a", unreached: "—" }[state]));
    const note = path.notes?.[id] ?? (state === "stop" ? path.code ?? "" : "");
    if (note) g.append(s("text", { class: state === "stop" ? "exit-text" : state === "flag" ? "flagtext" : "sub", x: noteX, y: y + 24 }, note.length > 34 ? note.slice(0, 33) + "…" : note));
    svg.append(tip(g, `${label}: ${help}`));
    if (i < STAGES.length - 1) {
      const live = i < stopIndex;
      svg.append(s("line", { class: `edge${live ? " live" : ""}`, x1: nodeX + 34, y1: y + nodeH, x2: nodeX + 34, y2: y + rowH - 2, "stroke-width": live ? 2.2 : 1, "marker-end": `url(#parrow${live ? "live" : ""})` }));
    }
  });
  return svg;
}

async function flowPage(o) {
  const f = o.flow;
  const outcomes = Object.entries(f.outcomes).sort((a, b) => b[1] - a[1]);
  return h("div", { class: "page" },
    card("Where requests ended", `${fmt(f.total)} requests in range. Open an outcome to list its requests.`, h("div", { class: "body" }, h("div", { class: "outcomes" },
      outcomes.length ? outcomes.map(([k, n]) => h("button", { type: "button", class: "outcome", onclick: () => go(`#/requests/all/${k}`) }, outcomeChip(k), h("strong", { class: "num" }, fmt(n)), h("span", { class: "muted" }, pct(n, f.total))))
        : h("span", { class: "muted" }, "No requests in range."),
      f.offPath ? h("span", { class: "muted small" }, `${fmt(f.offPath)} refusals are not on this path: admin requests, internal errors, per-minute summaries.`) : null))),
    card("State machine of a request", "Each box is a state. Green: passed. Amber: passed with a flag. Red: stopped there. Dashed: the state does not apply. Hover a box for its meaning.",
      h("div", { class: "body" }, h("div", { class: "diagram-wrap" }, flowDiagram(f)),
        h("p", { class: "small muted" }, "The proxy decides once per request, before forwarding (ADR 0009). A request stops at the first state that refuses it, and exactly one record is written. A refusal before the log can take a record (503 audit_log_unavailable) has no record and is not counted here."))));
}

function decisionMachine(list) {
  const count = (state) => list.filter((d) => d.state === state).length;
  const qdl = { completed: 0, refused: 0, failed: 0 };
  for (const d of list) if (d.qdl) qdl[d.qdl.status] = (qdl[d.qdl.status] ?? 0) + 1;
  const state = (name, n, label) => h("div", { class: `state ${name}` }, h("span", {}, label), h("strong", { class: "num" }, fmt(n)));
  const effects = list.flatMap((d) => d.effects ?? []);
  const done = effects.filter((e) => e.status === "done"), unauthorized = done.filter((e) => !e.authorized);
  return h("div", {}, h("div", { class: "machine" },
    state("", list.length, "Recorded"), h("span", { class: "arrow" }, "→"), h("div", { class: "fan" }, state("waiting", count("waiting"), "Waiting for a person"), state("approved", count("acted"), "Done by the rule, no review needed")), h("span", { class: "arrow" }, "→"),
    h("div", { class: "fan" }, state("approved", count("approved"), "Approved"), state("overridden", count("overridden"), "Overridden"), state("rejected", count("rejected"), "Rejected")),
    h("span", { class: "arrow" }, "→"),
    h("div", { class: "fan" }, state("approved", done.length - unauthorized.length, "Action done"), state("", effects.length - done.length, "Skipped or failed"), unauthorized.length ? state("rejected", unauthorized.length, "Done without approval") : null)),
    h("p", { class: "muted small" }, `Rule results: ${fmt(qdl.completed)} completed, ${fmt(qdl.refused)} refused, ${fmt(qdl.failed)} failed. An action is recorded by the application with ai-audit effect; a rule's own action needs no review, any other needs an approval first.`));
}

async function decisionsPage(o) {
  const list = await api("decisions");
  const filter = route.filter ?? (route.id && route.id !== "all" ? null : "waiting");
  const shown = list.filter((d) => !filter || filter === "all" || d.state === filter);
  const selected = route.id && route.id !== "all" ? list.find((d) => d.id === route.id) : shown[0];
  const tabs = h("div", { class: "tabs" }, ["waiting", "acted", "approved", "overridden", "rejected", "all"].map((f) =>
    h("button", { type: "button", "aria-pressed": String((filter ?? "all") === f), onclick: () => go(`#/decisions/all/${f}`) }, `${STATE_LABELS[f]} ${fmt(f === "all" ? list.length : list.filter((d) => d.state === f).length)}`)));
  const subject = (d) => Object.values(d.params ?? {}).find((v) => typeof v === "string") ?? d.systemId ?? "—";
  const rows = shown.map((d) => h("tr", { class: "clickable", "aria-selected": String(selected?.id === d.id), onclick: () => go(`#/decisions/${encodeURIComponent(d.id)}/${filter ?? "all"}`) },
    td(time(d.ts)), td(d.useCase ?? "—"), td(subject(d), "mono"),
    td(d.qdl && d.qdl.status !== "completed" ? chip(`rule ${d.qdl.status}`, "bad") : d.actions.filter((a) => a.status === "simulated").map((a) => chip(a.action, "accent"))), td(chip(STATE_LABELS[d.state] ?? d.state, STATE_CHIPS[d.state]))));
  return h("div", { class: "page" },
    card("Decision states", "A recorded decision waits for a person until a review is written. The latest review counts.", h("div", { class: "body" }, decisionMachine(list))),
    h("div", { class: "grid split" },
      card("Decisions", null, h("div", { class: "body flush" }, table(["Time", "Use case", "Item", "Proposed action", "State"], rows, "No decision in this state.")), tabs),
      h("div", { class: "sticky" }, selected ? decisionDetail(selected, o) : card("No decision selected", null, h("div", { class: "empty" }, "Select a decision.")))));
}

function inputsTable(inputs) {
  if (!inputs || typeof inputs !== "object") return h("p", { class: "muted" }, "No stored inputs.");
  return h("dl", { class: "kv" }, Object.entries(inputs).flatMap(([k, v]) => [h("dt", {}, k), h("dd", { class: "mono" }, value(v))]));
}

function decisionDetail(d, o) {
  const result = h("div", {});
  const note = h("textarea", { class: "note-box", maxlength: "500", placeholder: "Why? At most 500 characters. Text with a secret or personal data is refused." });
  const status = h("p", { class: "small muted" });
  const send = async (verdict) => {
    status.textContent = "Saving…";
    try { await api(`decisions/${encodeURIComponent(d.id)}/review`, { method: "POST", body: JSON.stringify({ verdict, note: note.value }) }); status.textContent = `Saved: ${verdict}.`; setTimeout(render, 400); }
    catch (e) { status.textContent = e.message === "audit_sensitive_note" ? "Refused: the note contains a secret or personal data. Remove it and try again." : `Not saved: ${e.message}`; }
  };
  const replay = async () => {
    result.replaceChildren(h("p", { class: "muted" }, "Running the rule again from the log…"));
    try {
      const r = await api(`decisions/${encodeURIComponent(d.id)}/replay`, { method: "POST" });
      const trace = r.replay?.trace ?? [];
      result.replaceChildren(
        h("div", { class: "evidence", style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, chip(r.replay?.reproduced ? "Same result again" : "Result differs", r.replay?.reproduced ? "ok" : "bad"),
          chip(r.chain?.ok ? "Chain intact" : "Chain broken", r.chain?.ok ? "ok" : "bad"), chip(r.consistency?.ok ? "Records agree" : `Records disagree: ${r.consistency?.reason}`, r.consistency?.ok ? "ok" : "bad"), chip(`Anchor: ${r.anchor}`, r.anchor === "verified" ? "ok" : r.anchor === "failed" ? "bad" : null)),
        trace.length ? h("div", {}, h("div", { class: "section-title" }, "How the rule computed it"), h("ol", { class: "trace" }, trace.map((t) => h("li", {}, h("span", {}, h("b", {}, t.nodeId), " ", h("span", { class: "muted" }, t.op)), h("span", { class: "mono" }, value(t.value)))))) : null);
    } catch (e) { result.replaceChildren(h("p", { class: "muted" }, e.message === "audit_qdl_unavailable" ? "Quinelings is not installed, so the rule cannot run here." : `Replay failed: ${e.message}`)); }
  };
  const simulated = d.actions.filter((a) => a.status === "simulated"), skipped = d.actions.filter((a) => a.status !== "simulated");
  return card(`${d.useCase ?? "Decision"}${d.systemId ? ` · ${d.systemId}` : ""}`, `${time(d.ts)} · ${d.id}`, h("div", { class: "body" },
    h("div", { class: "section-title" }, "What the rule proposes"),
    simulated.length || skipped.length
      ? h("div", {}, simulated.map((a) => h("p", { style: { margin: "2px 0" } }, chip("would do", "accent"), " ", h("b", {}, a.action))), skipped.map((a) => h("p", { class: "muted", style: { margin: "2px 0" } }, chip("would not do"), " ", a.action)),
        h("p", { class: "small muted" }, "Actions are simulated. The rule does not act; your application does, after this review."))
      : h("p", { class: "muted" }, "The rule names no action."),
    h("div", { class: "section-title" }, "Result"),
    d.outputNames ? h("dl", { class: "kv" }, d.outputNames.flatMap((name, i) => {
      const v = d.output[i];
      return [h("dt", {}, name), h("dd", { class: "mono" }, v && typeof v === "object" && typeof v.action === "string" ? `${v.status === "simulated" ? "would do" : "would not do"} ${v.action}` : typeof v === "number" ? fmt(Math.round(v * 100) / 100) : value(v))];
    })) : h("pre", { class: "mono", style: { whiteSpace: "pre-wrap", margin: 0 } }, JSON.stringify(d.output, null, 2) ?? "—"),
    h("div", { class: "section-title" }, "Inputs the rule used"), inputsTable(d.qdl?.inputs),
    d.params ? [h("div", { class: "section-title" }, "Recorded with the decision"), inputsTable(d.params)] : null,
    h("div", { class: "section-title" }, "Rule"),
    d.qdl ? h("dl", { class: "kv" }, h("dt", {}, "Program"), h("dd", {}, d.qdl.program ?? "unnamed"), h("dt", {}, "Hash"), h("dd", { class: "mono" }, short(d.qdl.sourceHash, 22)), h("dt", {}, "Status"), h("dd", {}, d.qdl.status),
      d.qdl.error ? [h("dt", {}, "Error"), h("dd", { class: "mono" }, value(d.qdl.error))] : null) : h("p", { class: "muted" }, "Recorded without a QDL rule."),
    d.llmCallId ? h("p", {}, "Model call: ", link(short(d.llmCallId, 16), `#/requests/${encodeURIComponent(d.llmCallId)}`)) : null,
    h("div", { class: "actions-row" }, d.qdl ? h("button", { class: "btn", type: "button", onclick: replay }, "Run the rule again") : null), result,
    h("div", { class: "section-title" }, "What the application did"),
    (d.effects ?? []).length ? h("ul", { class: "list" }, d.effects.map((e) => h("li", {}, h("span", { class: `sev ${e.status === "done" && !e.authorized ? "critical" : e.status === "failed" ? "warn" : ""}` }),
      h("div", {}, h("strong", {}, `${e.status === "done" ? "Done" : e.status === "skipped" ? "Skipped" : "Failed"}: ${e.action}`),
        h("p", { class: "small muted" }, `${time(e.ts)}${e.code ? ` · ${e.code}` : ""}${e.review ? " · after a review" : ""}`),
        e.status === "done" ? chip(e.authorized ? "authorized" : "without approval", e.authorized ? "ok" : "bad") : null))))
      : h("p", { class: "muted" }, d.state === "waiting" ? "Nothing yet. The application waits for a verdict." : "No action recorded."),
    h("div", { class: "section-title" }, "Reviews"),
    d.reviews.length ? h("ul", { class: "list" }, d.reviews.map((r) => h("li", {}, h("span", { class: "sev" }), h("div", {}, h("strong", {}, `${r.verdict} by ${r.reviewer}`), h("p", { class: "small muted" }, time(r.at)), r.note ? h("p", {}, r.note) : null)))) : h("p", { class: "muted" }, "No review yet."),
    o.reviewer
      ? h("div", {}, h("div", { class: "section-title" }, `Your verdict (as ${o.reviewer})`), note,
        h("div", { class: "actions-row" }, h("button", { class: "btn good", type: "button", onclick: () => send("approved") }, "Approve"), h("button", { class: "btn warn", type: "button", onclick: () => send("overridden") }, "Override"),
          h("button", { class: "btn bad", type: "button", onclick: () => send("rejected") }, "Reject")), status)
      : h("p", { class: "small muted" }, "Read-only. Start the console with --reviewer NAME to record verdicts.")));
}

async function useCasesPage() {
  const rows = await api(withRange("use-cases"));
  if (!rows.length) return card("No use cases", null, h("div", { class: "body" }, h("p", {}, "No request names a use case and gateway.json has no useCases table. See Overview for a suggested table.")));
  return h("div", { class: "page" }, card("Use cases", "Tier and limits come from gateway.json; numbers come from the log in the selected range. Overridden = latest reviews other than approved.", h("div", { class: "body flush" }, table(
    ["Use case", "Tier", "Models", "Tools", "#Calls", "#Delivered", "#Redacted", "#Blocked", "#Refused", "#Tools held", "#Tokens in / out", "#Decisions", "#Reviewed", "#Overridden", "Row"],
    rows.map((u) => {
      const st = u.stats ?? {}, tier = u.row?.tier ?? st.tiers?.[st.tiers.length - 1];
      return h("tr", { class: "clickable", onclick: () => go(`#/requests/all/use-case:${encodeURIComponent(u.name)}`) },
        td(h("b", {}, u.name)), td(tier ? chip(tier, tier === "off" ? "bad" : tier === "transact" ? "warn" : "accent") : "—"),
        td(u.row?.models ? u.row.models.join(", ") : h("span", { class: "muted" }, "key's list")), td(u.row?.tools ? `${u.row.tools.mode}: ${u.row.tools.allow.join(", ")}` : h("span", { class: "muted" }, "any")),
        tdn(st.calls ?? 0), tdn(st.forwarded ?? 0), tdn(st.redacted ?? 0), tdn((st.blocked ?? 0) + (st.rejected ?? 0)), tdn(st.refused ?? 0), tdn(st.gateHolds ?? 0),
        tdn(`${fmt(st.inputTokens ?? 0)} / ${fmt(st.outputTokens ?? 0)}`), tdn(st.decisions ?? 0), tdn(st.reviewed ?? 0), tdn(st.overrideRatePct === null || st.overrideRatePct === undefined ? "—" : `${fmt(st.overridden)} (${st.overrideRatePct}%)`),
        td(!u.configured ? chip("not in table", "warn") : u.changedSinceSeen ? chip("changed since last call", "info") : chip("configured", "ok")));
    }), "No use cases."))));
}

function dots(stages) {
  return h("span", { class: "dots", "aria-hidden": "true" }, STAGES.map(([id, label]) => tip(h("i", { class: stages[id] ?? "" }), `${label}: ${stages[id] ?? "not reached"}`)));
}

async function requestsPage() {
  if (route.id && route.id !== "all") return requestDetail(route.id);
  const filter = route.filter;
  const useCase = filter?.startsWith("use-case:") ? decodeURIComponent(filter.slice(9)) : null, outcome = useCase ? null : filter;
  const rows = await api(withRange(`requests?limit=500${outcome ? `&outcome=${encodeURIComponent(outcome)}` : ""}${useCase ? `&useCase=${encodeURIComponent(useCase)}` : ""}`));
  const tabs = h("div", { class: "tabs" }, [["", "All"], ...Object.entries(OUTCOMES).map(([k, [label]]) => [k, label])].map(([k, label]) =>
    h("button", { type: "button", "aria-pressed": String((outcome ?? "") === k && !useCase), onclick: () => go(`#/requests/all/${k}`) }, label)));
  return h("div", { class: "page" }, card(useCase ? `Requests of use case ${useCase}` : "Requests", "The dots are the 11 states of the request machine, in order. Open a row for its path and its context.", h("div", { class: "body flush" }, table(
    ["Time", "Key", "Use case", "Model", "Path", "Outcome", "#Status", "#Findings", "#Tokens in / out", "#Latency"],
    rows.map((r) => h("tr", { class: "clickable", onclick: () => go(`#/requests/${encodeURIComponent(r.id)}`) },
      td(time(r.ts)), td(r.key ?? "—"), td(r.useCase ?? "—"), td(r.model ?? "—", "mono"), td(dots(r.stages)), td([outcomeChip(r.outcome), r.code ? h("div", { class: "small muted mono" }, r.code) : null]),
      tdn(r.status ?? "—"), tdn(r.findings + r.signals), tdn(r.usage ? `${fmt(r.usage.input)} / ${fmt(r.usage.output)}` : "—"), tdn(r.latencyMs === null ? "—" : `${fmt(r.latencyMs)} ms`))),
    "No request matches.")), tabs));
}

function blocksOf(context) {
  if (Array.isArray(context?.blocks) && context.blocks.length) return context.blocks.map(([code, size, age]) => ({ kind: KINDS[code] ?? "other", bytes: size, age }));
  return Object.entries(context?.bytes ?? {}).filter(([, n]) => n > 0).map(([kind, n]) => ({ kind, bytes: n, age: null }));
}
const ageColor = (age, turn) => age === null || age === 0 || !turn ? "var(--age-unknown)" : `var(--age-${Math.min(4, Math.max(0, turn - age))})`;
const ageText = (age, turn) => age === null ? "age not recorded" : age === 0 ? "age unknown (untracked after restart)" : turn - age === 0 ? "new or changed in this turn" : `unchanged for ${turn - age} turn${turn - age === 1 ? "" : "s"}, since turn ${age}`;

function strip(blocks, turn, total, marker, thin) {
  const sum = blocks.reduce((a, b) => a + b.bytes, 0) || 1, scale = total || sum;
  const el = h("div", { class: `strip${thin ? " thin" : ""}`, style: { width: `${Math.max(4, (sum / scale) * 100)}%` } });
  blocks.forEach((b, i) => el.append(tip(h("i", { style: { width: `${(b.bytes / sum) * 100}%`, background: colorBy === "kind" ? `var(--k-${b.kind})` : ageColor(b.age, turn) } }),
    `Block ${i + 1}: ${KIND_LABELS[b.kind] ?? b.kind}, ${bytes(b.bytes)} (${pct(b.bytes, sum)} of this request), ${ageText(b.age, turn)}`)));
  if (marker && typeof marker.offset === "number") el.append(tip(h("span", { class: "marker", style: { left: `calc(${Math.min(100, (marker.offset / sum) * 100)}% - 1px)` } }), `First changed byte at ${bytes(marker.offset)}: the provider cache cannot cover anything after this point.`));
  return el;
}

function legend(turnKnown) {
  return h("div", { class: "legend" }, colorBy === "kind"
    ? Object.entries(KIND_LABELS).map(([k, label]) => h("span", {}, h("i", { style: { background: `var(--k-${k})` } }), label))
    : [["0", "new this turn"], ["1", "1 turn old"], ["2", "2"], ["3", "3"], ["4", "4+ turns"], ["unknown", "unknown"]].map(([k, label]) => h("span", {}, h("i", { style: { background: `var(--age-${k})` } }), label)),
    turnKnown ? h("span", {}, h("i", { style: { background: "var(--bad)", width: "3px" } }), "first changed byte") : null);
}
const colorToggle = (onChange) => h("div", { class: "tabs" }, ["kind", "age"].map((k) => h("button", { type: "button", "aria-pressed": String(colorBy === k), onclick: () => { colorBy = k; onChange(); } }, k === "kind" ? "Colour by kind" : "Colour by age")));

function contextPanel(record) {
  const ctx = record.context;
  if (!ctx) return card("Context", null, h("div", { class: "empty" }, "No context was recorded: the request stopped before its body was read."));
  const holder = h("div", {});
  const turn = record.session?.turn ?? null, blocks = blocksOf(ctx), sum = blocks.reduce((a, b) => a + b.bytes, 0);
  const draw = () => {
    const segments = Object.entries(ctx.bytes ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const preamble = (ctx.bytes?.system ?? 0) + (ctx.bytes?.tools ?? 0);
    const fresh = blocks.filter((b) => turn && b.age !== null && b.age > 0 && b.age === turn).reduce((a, b) => a + b.bytes, 0);
    const old = blocks.filter((b) => turn && b.age !== null && b.age > 0 && b.age < turn).reduce((a, b) => a + b.bytes, 0);
    const largest = blocks.map((b, i) => ({ ...b, i })).sort((a, b) => b.bytes - a.bytes).slice(0, 6);
    holder.replaceChildren(
      h("div", { class: "actions-row", style: { justifyContent: "space-between", marginTop: 0 } }, h("span", {}, h("b", {}, bytes(ctx.totalBytes)), ` sent in ${blocks.length} block${blocks.length === 1 ? "" : "s"}`, ctx.tokens ? ` · about ${fmt(Object.values(ctx.tokens).reduce((a, n) => a + n, 0))} tokens (split by size)` : " · tokens unknown"), colorToggle(draw)),
      h("div", { style: { marginTop: "10px" } }, strip(blocks, turn, 0, record.session?.firstChanged)), legend(!!record.session),
      h("div", { class: "grid two", style: { marginTop: "14px", gap: "14px" } },
        h("div", {}, h("div", { class: "section-title" }, "What is in it"), table(["Part", "#Bytes", "#Share", "#Tokens"], segments.map(([k, n]) =>
          h("tr", {}, td(h("span", {}, h("i", { style: { display: "inline-block", width: "10px", height: "10px", borderRadius: "3px", background: `var(--k-${k})`, marginRight: "8px" } }), KIND_LABELS[k] ?? k)), tdn(n), tdn(pct(n, ctx.totalBytes)), tdn(ctx.tokens?.[k] ?? "—"))), "Empty.")),
        h("div", {}, h("div", { class: "section-title" }, "Why it is this big"), h("dl", { class: "kv" },
          h("dt", {}, "Fixed preamble"), h("dd", {}, `${bytes(preamble)} (${pct(preamble, ctx.totalBytes)}): system prompt and tool definitions, sent on every turn`),
          h("dt", {}, "Carried from earlier turns"), h("dd", {}, turn ? `${bytes(old)} (${pct(old, sum)})` : "not linked to a session"),
          h("dt", {}, "New in this turn"), h("dd", {}, turn ? `${bytes(fresh)} (${pct(fresh, sum)})` : "—"),
          h("dt", {}, "Cache"), h("dd", {}, record.session?.firstChanged ? `prefix changed at ${bytes(record.session.firstChanged.offset)}; later tokens are paid again` : record.session ? "prefix unchanged; only appended" : "—")),
          h("div", { class: "section-title" }, "Largest blocks"), h("ol", { class: "trace" }, largest.map((b) => h("li", {}, h("span", {}, `${KIND_LABELS[b.kind] ?? b.kind}`, h("span", { class: "muted" }, ` · block ${b.i + 1}`)), h("span", { class: "muted small" }, ageText(b.age, turn)), h("b", { class: "num" }, bytes(b.bytes))))))),
      h("p", { class: "small muted" }, "The log stores the size, kind and age of each block, never its text (ADR 0007, 0017, 0020)."));
  };
  draw();
  return card("Context sent to the model", record.session ? `Session turn ${record.session.turn}` : "Not linked to a session", h("div", { class: "body" }, holder),
    record.session?.id ? link("Open the session", `#/sessions/${encodeURIComponent(record.session.id)}`) : null);
}

async function requestDetail(id) {
  const { record: r, path, decisions } = await api(`requests/${encodeURIComponent(id)}`);
  const d = r.decision ?? {};
  const findings = [...(d.findings ?? []).map((f) => ({ type: "Finding", ...f })), ...(d.signals ?? []).map((x) => ({ type: "Injection signal", ...x }))];
  const gate = r.actionGate?.calls ?? [];
  return h("div", { class: "page" },
    h("p", {}, link("← All requests", "#/requests")),
    h("div", { class: "grid split" },
      card("Path through the state machine", path ? `${(OUTCOMES[path.outcome] ?? [path.outcome])[0]}${path.code ? ` · ${path.code}` : ""}` : "Not an LLM request", h("div", { class: "body" }, path ? pathDiagram(path) : h("p", { class: "muted" }, "This record is not on the request path."))),
      h("div", { class: "grid" },
        card("Request", `${time(r.ts)} · ${r.id}`, h("div", { class: "body" }, h("dl", { class: "kv" },
          [["Kind", r.kind], ["Key", r.virtualKey], ["Use case", r.useCase ? `${r.useCase}${r.useCasePolicy ? ` · ${r.useCasePolicy.tier}` : ""}` : null], ["Provider", r.provider], ["Route", r.endpoint ?? r.route],
            ["Model", r.requestedModel ? `${r.requestedModel} → ${r.model}` : r.model], ["Response model", r.responseModel], ["Decision", d.action], ["Status", r.status ?? r.upstreamStatus], ["Error", r.error ?? r.code],
            ["Tokens", r.usage ? `${fmt(r.usage.input)} in · ${fmt(r.usage.output)} out${r.usage.cached ? ` · ${fmt(r.usage.cached)} cached` : ""}` : null], ["Latency", r.latencyMs !== undefined ? `${fmt(r.latencyMs)} ms` : null],
            ["Inspection profile", r.inspectionProfile?.digest ? short(r.inspectionProfile.digest, 16) : null]].filter(([, v]) => v !== null && v !== undefined).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, String(v))])),
          decisions.length ? h("p", {}, "Decisions from this call: ", decisions.map((x) => link(short(x, 12), `#/decisions/${encodeURIComponent(x)}`))) : null)),
        card("Findings and signals", "Rule and place only, never the value.", h("div", { class: "body flush" }, table(["Type", "Rule", "Where", "#Count"], findings.map((f) => h("tr", {}, td(f.type), td(f.rule, "mono"), td(f.path, "mono"), tdn(f.count ?? 1))), "None."))),
        gate.length ? card("Tool gate", r.actionGate.rewritten ? "Enforce mode rewrote the answer." : null, h("div", { class: "body flush" }, table(["Tool", "Mode", "Result", "Why"], gate.map((c) =>
          h("tr", {}, td(c.tool, "mono"), td(c.mode), td(chip(c.result, c.result === "hold" ? "warn" : "ok")),
            td([c.toolAllowed === false ? chip("outside key list", "warn") : null, c.useCaseToolAllowed === false ? chip("outside use-case list", "warn") : null,
              (c.atoms ?? []).map((a) => h("div", { class: "small mono" }, `${a.path} ${a.kind} from ${a.origin ?? "?"}${a.source ? ` (${a.source})` : ""}: ${a.result}`))]))), ""))) : null)),
    contextPanel(r));
}

async function sessionsPage() {
  if (route.id) return sessionDetail(route.id);
  const list = await api("sessions");
  return card("Sessions", "Conversations the proxy linked by their message prefixes (ADR 0018). Open one to see how its context grew.", h("div", { class: "body flush" }, table(
    ["Session", "#Calls", "#Turns", "#Branches", "#Largest context", "First", "Last"],
    list.map((x) => h("tr", { class: "clickable", onclick: () => go(`#/sessions/${encodeURIComponent(x.id)}`) }, td(short(x.id, 14), "mono"), tdn(x.requests), tdn(x.turns), tdn(x.branches), tdn(bytes(x.maxBytes)), td(time(x.firstTs)), td(time(x.lastTs)))),
    "No linked sessions.")));
}

async function sessionDetail(id) {
  const v = await api(`sessions/${encodeURIComponent(id)}`);
  const holder = h("div", {});
  const max = Math.max(...v.turns.map((t) => blocksOf(t.call.context).reduce((a, b) => a + b.bytes, 0)), 1);
  const maxTokens = Math.max(...v.turns.map((t) => (t.tokens.cacheRead ?? 0) + (t.tokens.cacheWrite ?? 0) + (t.tokens.input ?? 0) + (t.tokens.output ?? 0)), 1);
  const draw = () => holder.replaceChildren(
    h("div", { class: "actions-row", style: { justifyContent: "space-between", marginTop: 0 } }, h("span", { class: "muted small" }, "Each row is one turn, scaled to the largest turn. Bars on the right: cache read, cache write, uncached input, output."), colorToggle(draw)),
    h("div", { class: "arena", style: { marginTop: "12px" } }, v.turns.map((t) => {
      const turn = t.call.session.turn, tk = t.tokens;
      const parts = [["cacheRead", "var(--age-3)"], ["cacheWrite", "var(--age-0)"], ["input", "var(--k-user)"], ["output", "var(--k-assistant)"]];
      const size = blocksOf(t.call.context).reduce((a, b) => a + b.bytes, 0);
      return [h("div", { class: "label" }, link(`turn ${turn}${t.kind ? ` · ${t.kind}` : ""}`, `#/requests/${encodeURIComponent(t.call.id)}`), h("span", { class: "muted" }, ` ${bytes(size)}`), t.bust.length ? h("div", {}, t.bust.map((b) => chip(b === "prefix-rewrite" ? "prefix rewrite" : "cache drop", "bad"))) : null),
        strip(blocksOf(t.call.context), turn, max, t.call.session.firstChanged, true),
        tip(h("div", { class: "tokens", style: { width: `${Math.max(4, (((tk.cacheRead ?? 0) + (tk.cacheWrite ?? 0) + (tk.input ?? 0) + (tk.output ?? 0)) / maxTokens) * 100)}%` } },
          parts.map(([k, c]) => tk[k] ? h("i", { style: { width: `${(tk[k] / ((tk.cacheRead ?? 0) + (tk.cacheWrite ?? 0) + (tk.input ?? 0) + (tk.output ?? 0))) * 100}%`, background: c } }) : null)),
          `cache read ${fmt(tk.cacheRead)} · cache write ${fmt(tk.cacheWrite)} · uncached input ${fmt(tk.input)} · output ${fmt(tk.output)}`)];
    })), legend(true));
  draw();
  return h("div", { class: "page" }, h("p", {}, link("← All sessions", "#/sessions")),
    h("div", { class: "grid kpis" }, kpi("Turns", v.turns.length, `${bytes(max)} at the largest`), kpi("Peak tokens", v.peakTokens ?? NaN, v.peakTokens === null ? "unknown" : "largest prompt"),
      kpi("Cache hit", v.cacheHit === null ? "—" : `${Math.round(v.cacheHit * 100)}%`, v.cacheHit === null ? "unknown" : "of prompt tokens read from cache"), kpi("Cache busts", v.busts, "prefix rewrites and cache drops", null, v.busts ? "warn" : null),
      kpi("Preamble", `${Math.round(v.preambleShare * 100)}%`, "of the context is system prompt and tool definitions"), kpi("Unknown usage", v.unknownUsage, "turns without token counts")),
    card("How the context grew", `Session ${v.id}`, h("div", { class: "body" }, holder)));
}

async function keysPage() {
  const list = await api("keys");
  if (!list.length) return card("No keys", null, h("div", { class: "body" }, h("p", {}, "Start the console with --config gateway.json to see virtual keys and budgets.")));
  const meter = (spent, reserved, limit) => h("div", { class: "meter" }, h("i", { style: { width: `${Math.min(100, (spent / Math.max(1, limit)) * 100)}%` } }), h("i", { class: "reserved", style: { width: `${Math.min(100, (reserved / Math.max(1, limit)) * 100)}%` } }));
  return h("div", { class: "keys" }, list.map((k) => card(k.name, `${fmt(k.calls)} calls · last ${ago(k.lastTs)}`, h("div", { class: "body" },
    h("dl", { class: "kv" }, h("dt", {}, "Models"), h("dd", {}, k.models ? k.models.join(", ") : "any"), h("dt", {}, "Providers"), h("dd", {}, k.providers ? k.providers.join(", ") : "both"),
      h("dt", {}, "Use cases"), h("dd", {}, k.useCases ? k.useCases.join(", ") : "every row"), h("dt", {}, "Tools"), h("dd", {}, k.tools ? `${k.tools.mode}: ${k.tools.allow.join(", ")}` : "not limited"),
      h("dt", {}, "Output text"), h("dd", {}, k.logContent ? chip("logged, redacted", "warn") : "hash only")),
    k.budget && !k.budget.error ? h("div", {}, h("div", { class: "section-title" }, `Token budget, per ${k.budget.period}${k.budget.blocked ? " · BLOCKED" : ""}`),
      h("p", { class: "small" }, `Input ${fmt(k.budget.spent.input)} spent + ${fmt(k.budget.reserved.input)} reserved of ${fmt(k.budget.limits.input)}`), meter(k.budget.spent.input, k.budget.reserved.input, k.budget.limits.input),
      h("p", { class: "small" }, `Output ${fmt(k.budget.spent.output)} spent + ${fmt(k.budget.reserved.output)} reserved of ${fmt(k.budget.limits.output)}`), meter(k.budget.spent.output, k.budget.reserved.output, k.budget.limits.output))
      : k.budget?.error ? h("p", { class: "muted" }, "Budget state could not be read.") : null,
    Object.keys(k.toolsCalled).length ? h("div", {}, h("div", { class: "section-title" }, "Tools the model called"), h("div", { class: "evidence", style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, Object.entries(k.toolsCalled).map(([t, n]) => chip(`${t} ${fmt(n)}`)))) : null))));
}

async function integrityPage() {
  const x = await api("integrity");
  return h("div", { class: "page" },
    h("div", { class: "grid two" },
      card("Hash chain", x.chain.ok ? "Every record links to the one before it." : "A record does not match the chain.", h("div", { class: "body" }, h("dl", { class: "kv" },
        h("dt", {}, "Status"), h("dd", {}, chip(x.chain.ok ? "intact" : "broken", x.chain.ok ? "ok" : "bad")), h("dt", {}, "Records"), h("dd", {}, fmt(x.chain.records)), h("dt", {}, "Files"), h("dd", {}, fmt(x.chain.files)),
        x.chain.ok ? null : [h("dt", {}, "Break"), h("dd", {}, `${x.chain.file ?? "current file"} line ${x.chain.badLine}: ${x.chain.reason}`)],
        x.chain.prunedBefore ? [h("dt", {}, "Pruned before"), h("dd", {}, time(x.chain.prunedBefore))] : null),
        h("p", { class: "small muted" }, "A chain shows the records were not changed after they were written. It does not show who wrote them; compare with anchors kept elsewhere."))),
      card("Anchors", "Checkpoints of the chain kept outside the log.", h("div", { class: "body" }, x.anchors ? h("dl", { class: "kv" }, h("dt", {}, "Status"), h("dd", {}, chip(x.anchors.ok ? "verified" : "failed", x.anchors.ok ? "ok" : "bad")), h("dt", {}, "Anchors"), h("dd", {}, fmt(x.anchors.anchors)), x.anchors.reason ? [h("dt", {}, "Reason"), h("dd", {}, x.anchors.reason)] : null)
        : h("p", {}, "No anchors file given. Run ", h("code", {}, "ai-audit anchor --log LOG --anchors FILE"), " on a schedule and start the console with --anchors FILE.")))),
    h("div", { class: "grid two" },
      card("Files", "Closed segments and the current file (ADR 0049).", h("div", { class: "body flush" }, table(["File", "#Size"], x.files.map((f) => h("tr", {}, td(f.name, "mono"), tdn(bytes(f.bytes)))), "No file."))),
      card("Inspection profiles", "Scanner version and settings each request ran with (ADR 0014).", h("div", { class: "body flush" }, table(["Profile", "Scanner", "#Calls", "First", "Last"], x.profiles.map((p) => h("tr", {}, td(short(p.digest, 14), "mono"), td(String(p.scannerVersion ?? "—")), tdn(p.calls), td(time(p.first)), td(time(p.last)))), "No call records.")))),
    card("Prunes and summaries", null, h("div", { class: "body" }, h("p", {}, `${fmt(x.prunes.length)} prune record${x.prunes.length === 1 ? "" : "s"}. ${fmt(x.suppressedRefusals)} refusals were counted only in per-minute summaries.`))));
}

async function livePage() {
  const x = await api("live");
  if (!x.configured) return card("Live counters", null, h("div", { class: "body" }, h("p", {}, "Start the console with ", h("code", {}, "--metrics http://127.0.0.1:8787/metrics"), " to read the running proxy's counters here. Counters reset when the proxy restarts.")));
  if (!x.ok) return card("Live counters", null, h("div", { class: "body" }, h("p", {}, chip("unreachable", "bad"), " The proxy's /metrics did not answer.")));
  const by = (name, key) => x.samples.filter((m) => m.name === name).reduce((acc, m) => { const k = key(m.labels); acc[k] = (acc[k] ?? 0) + m.value; return acc; }, {});
  const block = (title, data) => card(title, null, h("div", { class: "body flush" }, table(["Label", "#Count"], Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, n]) => h("tr", {}, td(k, "mono"), tdn(n))), "None yet.")));
  return h("div", { class: "grid two" },
    block("Requests by decision and status", by("ai_audit_requests_total", (l) => `${l.decision} ${l.status}${l.use_case ? ` · ${l.use_case}` : ""}`)),
    block("Tool gate", by("ai_audit_action_gate_total", (l) => `${l.mode} ${l.result}${l.use_case ? ` · ${l.use_case}` : ""}`)),
    block("Injection signals", by("ai_audit_injection_signals_total", (l) => l.rule ?? "—")),
    block("Provider answers", by("ai_audit_upstream_responses_total", (l) => `${l.provider} ${l.class}`)),
    block("Unknown usage", by("ai_audit_unknown_usage_total", (l) => `${l.provider} ${l.field}`)),
    block("Log failures", by("ai_audit_log_write_failures_total", () => "lost after delivery")));
}

const PAGE_RENDERERS = { overview: overviewPage, decisions: decisionsPage, "use-cases": useCasesPage, flow: flowPage, requests: requestsPage, sessions: sessionsPage, keys: keysPage, integrity: integrityPage, live: livePage };

function login(message) {
  $("nav").replaceChildren();
  const input = h("input", { type: "password", placeholder: "Token", autocomplete: "off" });
  $("page").replaceChildren(h("div", { class: "card login" }, h("header", {}, h("div", {}, h("h2", {}, "Open the console"), h("p", {}, message))), h("div", { class: "body" },
    h("p", { class: "small" }, "The console prints a URL with a token when it starts. Open that URL, or paste the token here. It is kept only in this browser tab."),
    input, h("button", { class: "btn primary", type: "button", onclick: () => { token = input.value.trim(); try { sessionStorage.setItem("ai-audit-console", token); } catch { } go("#/overview"); } }, "Open"))));
}

let waitingSeen = null;
async function watchWaiting() {
  if (!token) return;
  try {
    const o = await api("overview?hours=0");
    const n = o.kpis.waiting;
    document.title = n ? `(${n}) ai-audit console` : "ai-audit console";
    const badge = document.querySelector('#nav a[href="#/decisions"] .badge');
    if (badge) badge.textContent = fmt(n);
    if (waitingSeen !== null && n > waitingSeen && "Notification" in window && Notification.permission === "granted") {
      new Notification("ai-audit: a decision waits for you", { body: `${n} decision${n === 1 ? "" : "s"} wait for a review.`, tag: "ai-audit-waiting" });
    }
    waitingSeen = n;
  } catch { }
}

function notifyButton() {
  const button = $("notify");
  const label = () => { button.textContent = !("Notification" in window) ? "No notifications" : Notification.permission === "granted" ? "Notifications on" : Notification.permission === "denied" ? "Notifications blocked" : "Notify me"; button.disabled = !("Notification" in window) || Notification.permission !== "default"; };
  button.addEventListener("click", async () => { try { await Notification.requestPermission(); } catch { } label(); });
  label();
}

function schedule() {
  clearInterval(timer);
  timer = $("auto").checked ? setInterval(() => {
    const busy = document.activeElement && ["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement.tagName);
    if (!busy && (["overview", "flow", "live"].includes(route.page) || (route.page === "requests" && (!route.id || route.id === "all")))) render();
  }, 10000) : null;
}

function adoptToken() {
  const fromHash = /token=([A-Za-z0-9_-]+)/.exec(location.hash)?.[1];
  if (!fromHash) return false;
  token = fromHash;
  try { sessionStorage.setItem("ai-audit-console", token); } catch { }
  history.replaceState(null, "", `${location.pathname}#/overview`);
  return true;
}

function start() {
  if (!adoptToken()) { try { token = sessionStorage.getItem("ai-audit-console") ?? ""; } catch { token = ""; } }
  try { range = localStorage.getItem("ai-audit-console-range") ?? "24"; } catch { }
  $("range").value = range;
  $("range").addEventListener("change", () => { range = $("range").value; try { localStorage.setItem("ai-audit-console-range", range); } catch { } render(); });
  $("refresh").addEventListener("click", render);
  $("auto").addEventListener("change", schedule);
  addEventListener("hashchange", () => { adoptToken(); render(); });
  notifyButton();
  if (!token) return login("No token yet.");
  render();
  schedule();
  watchWaiting();
  setInterval(watchWaiting, 10000);
}

start();
