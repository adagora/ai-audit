const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
const svg = (tag, attrs = {}) => { const node = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; };
const series = (i) => `var(--series-${i})`;
const fmt = (n) => n === null || n === undefined || Number.isNaN(n) ? "—" : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(1)}k`
  : Number.isInteger(n) ? n.toLocaleString() : n.toFixed(Math.abs(n) < 1 ? 2 : 1);
const clock = (t) => new Date(t).toLocaleTimeString([], { hour12: false });

const GROUPS = [
  ["Routing and keys", [["clean", "Clean request"], ["alias", "Model alias"], ["virtualKey", "Wrong virtual key"], ["refusalModel", "Model outside key list"], ["outage", "Upstream 503"], ["noUsage", "Missing usage"]]],
  ["Inspection policy", [["redact", "Redact a secret"], ["block", "No-go block"], ["advisory", "Advisory forward"], ["attachment", "Uninspectable file"]]],
  ["Prompt injection", [["injection", "Signal in a tool result"], ["injectionResent", "Resent result counted once"]]],
  ["Tool-call gate", [["gateObserve", "Observe: untrusted URL"], ["gateEnforce", "Enforce: untrusted email"], ["gatePass", "Address typed by the user"], ["keyTools", "Tool outside the key list"]]],
  ["Budgets", [["budget", "Token budget exhausted"]]],
  ["APIs and sessions", [["responses", "Responses stream"], ["anthropic", "Anthropic stream"], ["session", "Linked session"]]],
  ["Alerting", [["alerting", "Held call fires an alert"]]],
  ["Evidence and integrity", [["integrity", "Chain and anchor"], ["failClosed", "Torn log fails closed"], ["telemetry", "Health and metrics"], ["scrub", "Scrub an export"], ["checkQuotes", "Check quoted values"]]],
  ["Decisions (QDL)", [["quineling", "Observe Quinelings"], ["qdl", "Run QDL and receipt"], ["signed", "Signed review"]]],
];
const API_ROUTE = (route) => route?.startsWith("/v1/") || route === "other";
const OUTCOMES = [
  ["Forwarded original", (d) => d === "forward-original"],
  ["Forwarded redacted", (d) => d === "forward-redacted"],
  ["Blocked or rejected", (d) => ["block", "reject", "budget-reject", "log-unavailable"].includes(d)],
  ["Refused before inspection", (d, s) => d === "none" && Number(s) >= 400],
];
const state = { snapshots: [], data: null, timer: null, built: false, running: new Set(), hover: new Map(), source: "synthetic", seenEvents: null };
const ADR_NOTE = "Not read from the real audit log (ADR 0040)";

function outcomeTotals(counters) {
  const totals = OUTCOMES.map(() => 0);
  let api = 0;
  for (const r of counters.requests) if (API_ROUTE(r.route)) {
    api += r.value;
    OUTCOMES.forEach(([, match], i) => { if (match(r.decision, r.status)) totals[i] += r.value; });
  }
  return { totals, api };
}
const held = (counters) => counters.actionGate.filter((g) => g.result === "hold").reduce((a, g) => a + g.value, 0);
const signals = (counters) => Object.values(counters.injectionSignals).reduce((a, v) => a + v, 0);

function windowed() {
  const range = Number($("range").value) * 1000, end = state.snapshots.at(-1)?.t ?? Date.now();
  return { snaps: state.snapshots.filter((s) => s.t >= end - range), domain: [end - range, end] };
}

function rates(snaps, pick) {
  const points = [];
  for (let i = 1; i < snaps.length; i++) {
    const a = pick(snaps[i - 1].counters), b = pick(snaps[i].counters), dt = (snaps[i].t - snaps[i - 1].t) / 1000;
    points.push([snaps[i].t, b.map((v, k) => dt > 0 && v >= a[k] ? (v - a[k]) / dt : 0)]);
  }
  return points;
}

function buckets(counters) {
  return counters.latency.map((b) => ({ le: b.le === "+Inf" ? Infinity : Number(b.le), value: b.value })).sort((a, b) => a.le - b.le);
}

function quantile(q, list) {
  const total = list.at(-1)?.value ?? 0;
  if (!total) return null;
  const rank = q * total;
  let previousLe = 0, previousCount = 0;
  for (const b of list) {
    if (b.value >= rank) {
      if (b.le === Infinity) return previousLe;
      const span = b.value - previousCount;
      return previousLe + (b.le - previousLe) * (span ? (rank - previousCount) / span : 0);
    }
    previousLe = b.le; previousCount = b.value;
  }
  return previousLe;
}

function latencyPoints(snaps) {
  const points = [];
  for (let i = 1; i < snaps.length; i++) {
    let j = i - 1;
    while (j > 0 && snaps[i].t - snaps[j].t < 15_000) j--;
    const now = buckets(snaps[i].counters), then = buckets(snaps[j].counters);
    const delta = now.map((b, k) => ({ le: b.le, value: Math.max(0, b.value - (then[k]?.value ?? 0)) }));
    points.push([snaps[i].t, [quantile(0.5, delta), quantile(0.95, delta)].map((s) => s === null ? null : s * 1000)]);
  }
  return points;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(v)), n = v / step;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * step;
}

const tooltip = $("tooltip");
function showTip(event, title, rows) {
  tooltip.replaceChildren(el("div", "t", title));
  for (const [label, value, color] of rows) {
    const row = el("div", "r"), name = el("span");
    if (color) { const chip = el("i"); chip.style.background = color; name.append(chip); }
    name.append(document.createTextNode(label));
    row.append(name, el("b", "", value));
    tooltip.append(row);
  }
  tooltip.hidden = false;
  const x = Math.min(event.clientX + 14, innerWidth - tooltip.offsetWidth - 8), y = Math.min(event.clientY + 14, innerHeight - tooltip.offsetHeight - 8);
  tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
}
const hideTip = () => { tooltip.hidden = true; };

function lineChart(host, lines, domain, unit, label) {
  host.replaceChildren();
  const plot = el("div", "plot"), legend = el("div", "legend");
  host.append(plot, legend);
  for (const line of lines) {
    const last = line.points.findLast((p) => p[1] !== null)?.[1];
    const item = el("span"), chip = el("i");
    chip.style.background = line.color;
    item.append(chip, document.createTextNode(line.name), el("b", "", last === undefined ? "—" : `${fmt(last)}${unit}`));
    legend.append(item);
  }
  const values = lines.flatMap((line) => line.points.map((p) => p[1]).filter((v) => v !== null));
  if (!values.length) { plot.append(el("div", "empty", "Collecting samples. Run a check or wait for traffic.")); return; }
  const w = plot.clientWidth || 600, h = plot.clientHeight || 196, m = { l: 46, r: 12, t: 8, b: 20 };
  const max = niceMax(Math.max(...values)), [t0, t1] = domain;
  const x = (t) => m.l + (t - t0) / (t1 - t0 || 1) * (w - m.l - m.r), y = (v) => h - m.b - v / max * (h - m.t - m.b);
  const root = svg("svg", { viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": `${label}. ${lines.map((l) => `${l.name} latest ${fmt(l.points.findLast((p) => p[1] !== null)?.[1])}${unit}`).join(", ")}` });
  const axis = svg("g", { class: "axis" });
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, yy = y(v);
    root.append(svg("line", { class: "gridline", x1: m.l, x2: w - m.r, y1: yy, y2: yy }));
    const text = svg("text", { x: m.l - 6, y: yy + 3, "text-anchor": "end" }); text.textContent = fmt(v); axis.append(text);
  }
  for (let i = 0; i <= 4; i++) {
    const t = t0 + (t1 - t0) * i / 4, text = svg("text", { x: x(t), y: h - 5, "text-anchor": i === 0 ? "start" : i === 4 ? "end" : "middle" });
    text.textContent = clock(t); axis.append(text);
  }
  root.append(axis);
  for (const line of lines) {
    let d = "", pen = false;
    for (const [t, v] of line.points) {
      if (v === null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`; pen = true;
    }
    root.append(svg("path", { class: "line", d, stroke: line.color }));
  }
  const cross = svg("line", { class: "cross", y1: m.t, y2: h - m.b, visibility: "hidden" }), dots = svg("g");
  root.append(cross, dots);
  const times = lines[0].points.map((p) => p[0]);
  const show = (event) => {
    const box = root.getBoundingClientRect(), px = (event.clientX - box.left) * (w / box.width);
    if (px < m.l || px > w - m.r || !times.length) { hide(); return; }
    const t = t0 + (px - m.l) / (w - m.l - m.r) * (t1 - t0);
    let index = 0;
    times.forEach((time, i) => { if (Math.abs(time - t) < Math.abs(times[index] - t)) index = i; });
    const at = times[index];
    cross.setAttribute("x1", x(at)); cross.setAttribute("x2", x(at)); cross.setAttribute("visibility", "visible");
    dots.replaceChildren();
    const rows = [];
    for (const line of lines) {
      const v = line.points[index]?.[1];
      rows.push([line.name, v === null || v === undefined ? "no data" : `${fmt(v)}${unit}`, line.color]);
      if (v !== null && v !== undefined) dots.append(svg("circle", { cx: x(at), cy: y(v), r: 4, fill: line.color, stroke: "var(--surface-1)", "stroke-width": 2 }));
    }
    showTip(event, clock(at), rows);
    state.hover.set(host.id, event);
  };
  const hide = () => { cross.setAttribute("visibility", "hidden"); dots.replaceChildren(); hideTip(); state.hover.delete(host.id); };
  root.addEventListener("pointermove", show);
  root.addEventListener("pointerleave", hide);
  plot.append(root);
  const last = state.hover.get(host.id);
  if (last && plot.matches(":hover")) show(last);
}

function sparkline(points, color) {
  const values = points.map((p) => p[1]);
  if (values.length < 2) return null;
  const max = Math.max(...values, 0) || 1, w = 200, h = 34;
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i / (points.length - 1) * w).toFixed(1)},${(h - 3 - p[1] / max * (h - 8)).toFixed(1)}`).join("");
  const root = svg("svg", { class: "spark", viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "none", "aria-hidden": "true" });
  root.append(svg("path", { d, fill: "none", stroke: color, "stroke-width": 1.5, "vector-effect": "non-scaling-stroke" }));
  return root;
}

function stat(host, { label, value, sub, status, spark }) {
  const box = el("div", "stat");
  box.append(el("div", "label", label));
  if (status) {
    const s = el("div", `status ${status.tone}`), icon = el("span", "icon", status.tone === "good" ? "✓" : status.tone === "warning" ? "!" : "✕");
    s.append(icon, document.createTextNode(status.text));
    box.append(s);
  } else box.append(el("div", "value", fmt(value)));
  box.append(el("div", "sub", sub));
  if (spark) { const line = sparkline(spark, series(1)); if (line) box.append(line); }
  host.append(box);
}

function bars(host, entries) {
  host.replaceChildren();
  const list = Object.entries(entries).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!list.length) { host.append(el("div", "empty", "None recorded in this run")); return; }
  const max = list[0][1];
  for (const [name, value] of list.slice(0, 8)) {
    const row = el("div", "bar-row"), track = el("div", "track"), fill = el("div", "fill");
    fill.style.width = `${Math.max(2, value / max * 100)}%`;
    track.append(fill);
    row.append(el("span", "name", name), track, el("span", "num", fmt(value)));
    row.addEventListener("pointermove", (event) => showTip(event, name, [["Count", fmt(value), series(1)]]));
    row.addEventListener("pointerleave", hideTip);
    host.append(row);
  }
  if (list.length > 8) host.append(el("div", "hint", `${list.length - 8} more not shown`));
}

function renderStats(data) {
  const { snaps } = windowed(), c = data.counters, o = outcomeTotals(c), logs = data.logs ?? { real: true };
  const spark = (pick) => rates(snaps, (counters) => [pick(counters)]).map(([t, [v]]) => [t, v]);
  const chains = Object.entries(logs.chains ?? {}), broken = chains.filter(([, ok]) => !ok).map(([mode]) => mode);
  const host = $("stats"); host.replaceChildren();
  stat(host, { label: "API requests", value: o.api, sub: "Since the proxies started", spark: spark((k) => outcomeTotals(k).api) });
  stat(host, { label: "Forwarded", value: o.totals[0] + o.totals[1], sub: `${fmt(o.totals[1])} after redaction`, spark: spark((k) => { const t = outcomeTotals(k).totals; return t[0] + t[1]; }) });
  stat(host, { label: "Blocked or rejected", value: o.totals[2], sub: "409, 422, 429 and 503 decisions", spark: spark((k) => outcomeTotals(k).totals[2]) });
  stat(host, { label: "Refused before inspection", value: o.totals[3], sub: `${fmt(c.refusalsSuppressed)} over the per-minute record limit`, spark: spark((k) => outcomeTotals(k).totals[3]) });
  stat(host, { label: "Tool calls held", value: held(c), sub: "Observe and enforce", spark: spark(held) });
  stat(host, { label: "Responses rewritten", value: logs.real ? null : logs.rewritten, sub: logs.real ? ADR_NOTE : "Enforce mode, from the log" });
  stat(host, { label: "Injection signals", value: signals(c), sub: "Advisory, first sightings", spark: spark(signals) });
  if (logs.real) stat(host, { label: "Audit chain", value: null, sub: "Run ai-audit verify on the real log" });
  else stat(host, { label: "Audit chain", sub: chains.map(([mode, ok]) => `${mode} ${ok ? "ok" : "broken"}`).join(" · "),
    status: broken.length ? { tone: "critical", text: `Broken: ${broken.join(", ")}` } : { tone: "good", text: "Intact" } });
  const usage = $("stats-usage"); usage.replaceChildren();
  stat(usage, { label: "Input tokens", value: logs.real ? null : logs.tokens.input, sub: logs.real ? ADR_NOTE : "Provider-reported" });
  stat(usage, { label: "Output tokens", value: logs.real ? null : logs.tokens.output, sub: logs.real ? ADR_NOTE : "Provider-reported" });
  stat(usage, { label: "Unknown usage", value: c.unknownUsage, sub: "Calls without usage, never counted as zero" });
  stat(usage, { label: "Linked sessions", value: logs.real ? null : logs.sessions, sub: logs.real ? ADR_NOTE : "Keyed prefix digests" });
  stat(usage, { label: "Upstream 5xx", value: c.upstream["5xx"] ?? 0, sub: `${fmt(c.upstream["2xx"] ?? 0)} 2xx · ${fmt(c.upstreamErrors)} unreachable or timed out` });
  stat(usage, { label: "QDL decisions", value: logs.real ? null : logs.decisions, sub: logs.real ? ADR_NOTE : `${fmt(logs.reviews)} reviews recorded` });
  stat(usage, { label: "Log write failures", sub: `${fmt(c.logUnavailable)} refused because the log was unavailable`,
    status: c.logWriteFailures ? { tone: "warning", text: `${fmt(c.logWriteFailures)} lost` } : { tone: "good", text: "None" } });
  stat(usage, { label: "Attachments inspected", value: c.attachments, sub: `${fmt(c.quinelings)} Quinelings events seen` });
}

function renderCharts() {
  const { snaps, domain } = windowed();
  const outcome = rates(snaps, (counters) => outcomeTotals(counters).totals);
  lineChart($("chart-requests"), OUTCOMES.map(([name], i) => ({ name, color: series(i + 1), points: outcome.map(([t, v]) => [t, v[i]]) })), domain, "/s", "API requests per second by outcome");
  const latency = latencyPoints(snaps);
  lineChart($("chart-latency"), ["p50", "p95"].map((name, i) => ({ name, color: series(i + 1), points: latency.map(([t, v]) => [t, v[i]]) })), domain, " ms", "Request latency");
  $("rate-note").textContent = snaps.length < 2 ? "Collecting samples" : `${snaps.length} samples in range`;
}

function unavailable(host, text) { host.replaceChildren(el("div", "na", text)); }

function renderBars(data) {
  bars($("bars-signals"), data.counters.injectionSignals);
  if (data.logs) {
    bars($("bars-findings"), data.logs.findings); bars($("bars-gate"), data.logs.gate); bars($("bars-refusals"), data.logs.refusals);
    return;
  }
  unavailable($("bars-findings"), `Scan findings are in the audit log only. ${ADR_NOTE}.`);
  bars($("bars-gate"), Object.fromEntries(data.counters.actionGate.map((g) => [`${g.mode} ${g.result}`, g.value])));
  const refused = {};
  for (const r of data.counters.requests) if (r.decision === "none" && Number(r.status) >= 400 && API_ROUTE(r.route)) refused[`HTTP ${r.status}`] = (refused[`HTTP ${r.status}`] ?? 0) + r.value;
  if (data.counters.refusalsSuppressed) refused["over record limit"] = data.counters.refusalsSuppressed;
  bars($("bars-refusals"), refused);
}

const ago = (iso) => { if (!iso) return "—"; const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`; };
const windowText = (seconds) => seconds ? (seconds % 60 ? `${seconds}s` : `${seconds / 60} min`) : "now";

function renderAlerts(alerts) {
  const rows = $("alert-rows"); rows.replaceChildren();
  const firing = alerts.rules.filter((rule) => rule.firing), critical = firing.some((rule) => rule.severity === "critical");
  for (const rule of [...alerts.rules].sort((a, b) => Number(b.firing) - Number(a.firing))) {
    const row = el("tr"), stateCell = el("td"), ruleCell = el("td", "rule");
    stateCell.append(el("span", `state ${rule.firing ? rule.severity : "ok"}`, rule.firing ? "Firing" : "OK"));
    ruleCell.append(el("strong", "", rule.title), el("small", "", rule.help));
    row.append(stateCell, ruleCell, el("td", "sev", rule.severity), el("td", "", rule.value === null ? "—" : fmt(rule.value)),
      el("td", "", rule.window ? `> ${rule.threshold} in ${windowText(rule.window)}` : `> ${rule.threshold}`), el("td", "", rule.since ? ago(rule.since) : "—"));
    rows.append(row);
  }
  const badge = $("alert-badge");
  badge.className = `alert-badge ${critical ? "critical" : firing.length ? "warning" : "ok"}`;
  badge.textContent = firing.length ? `${firing.length} firing` : "No alerts";
  $("alert-note").textContent = `Evaluated by the server every 5 s${alerts.webhook ? " · webhook on" : ""}${alerts.notifyFailures ? ` · ${alerts.notifyFailures} webhook failures` : ""}`;
  const list = $("alert-events"); list.replaceChildren();
  if (!alerts.history.length) list.append(el("li", "empty", "No alert events yet."));
  for (const event of alerts.history) {
    const item = el("li");
    item.append(el("time", "", clock(event.at)), el("span", `state ${event.state === "firing" ? event.severity : "ok"}`, event.state === "firing" ? "Firing" : "Resolved"), el("span", "", `${event.title} (${fmt(event.value)})`));
    list.append(item);
  }
  const ids = alerts.history.map((event) => `${event.at}|${event.rule}|${event.state}`);
  if (state.seenEvents && "Notification" in window && Notification.permission === "granted")
    for (const [i, id] of ids.entries()) if (!state.seenEvents.has(id) && alerts.history[i].state === "firing")
      new Notification(`ai-audit: ${alerts.history[i].title}`, { body: `${alerts.history[i].severity} · value ${alerts.history[i].value}`, tag: alerts.history[i].rule });
  state.seenEvents = new Set(ids);
}

function openDrawer(title, value) {
  $("drawer-title").textContent = title;
  $("drawer-body").textContent = JSON.stringify(value, null, 2);
  $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false");
  $("drawer-close").focus();
}
const closeDrawer = () => { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true"); };

function buildBench(data) {
  const host = $("bench"); host.replaceChildren();
  const known = new Set(GROUPS.flatMap(([, checks]) => checks.map(([name]) => name)));
  const extra = data.scenarios.filter((name) => !known.has(name)).map((name) => [name, name]);
  for (const [title, checks] of extra.length ? [...GROUPS, ["Other", extra]] : GROUPS) {
    const group = el("div", "group"), heading = el("h4");
    heading.append(document.createTextNode(title), el("span", "", ""));
    heading.lastChild.id = `group-${title}`;
    group.append(heading);
    for (const [name, label] of checks) {
      if (!data.scenarios.includes(name)) continue;
      const row = el("div", "check"), what = el("div", "what"), badge = el("span", "badge", "not run"), run = el("button", "btn", "Run");
      what.append(el("strong", "", label), el("span", "", data.checks[name] ?? ""));
      what.title = data.checks[name] ?? "";
      badge.id = `badge-${name}`; run.id = `run-${name}`; run.type = "button";
      what.addEventListener("click", () => { const last = state.lastRun?.[name]; if (last) openDrawer(label, last); });
      run.addEventListener("click", () => runOne(name, label));
      row.append(what, badge, run);
      group.append(row);
    }
    host.append(group);
  }
  state.built = true;
}

function renderBench(data) {
  if (!state.built) buildBench(data);
  let pass = 0, fail = 0;
  for (const name of data.scenarios) {
    const badge = $(`badge-${name}`);
    if (!badge) continue;
    const result = data.results[name], running = state.running.has(name) || data.suite?.current === name;
    badge.className = `badge ${running ? "running" : result ? (result.pass ? "pass" : "fail") : ""}`;
    badge.textContent = running ? "running" : result ? `${result.pass ? "pass" : "fail"} · ${result.status ?? "—"}` : "not run";
    badge.title = result ? `${result.ms} ms at ${clock(Date.parse(result.at))}. Expected: ${result.expected}` : "";
    if (result) result.pass ? pass++ : fail++;
  }
  for (const [title, checks] of GROUPS) {
    const counter = $(`group-${title}`);
    if (!counter) continue;
    const done = checks.filter(([name]) => data.results[name]), ok = done.filter(([name]) => data.results[name].pass).length;
    counter.textContent = done.length ? `${ok}/${checks.length} pass` : "";
  }
  const suite = data.suite ?? {}, running = suite.state === "running";
  $("run-all").disabled = running;
  $("progress").classList.toggle("hidden", !running);
  if (running) {
    const pct = Math.round(suite.done / suite.total * 100);
    $("progress-fill").style.width = `${pct}%`; $("progress").setAttribute("aria-valuenow", pct);
    $("progress-text").textContent = `Running ${suite.current ?? ""} · ${suite.done} of ${suite.total}`;
  }
  $("bench-summary").textContent = pass + fail ? `${pass} passed, ${fail} failed, ${data.scenarios.length - pass - fail} not run` : "Each check runs real requests through the proxy against a mock provider.";
}

function renderLog(data) {
  const body = $("log-rows");
  if (!data.recent.length) return;
  body.replaceChildren();
  for (const r of data.recent) {
    const row = el("tr"), outcome = String(r.outcome ?? "—");
    const tone = /block|reject|unauthorized|not_allowed|exceeded|unavailable|failed|too_large|malformed|unsupported/.test(outcome) ? "bad" : /redacted|held|suppressed/.test(outcome) ? "warn" : "ok";
    const cells = [clock(r.ts), r.mode, r.kind, r.route ?? "—", r.key ?? "—", null, r.status ?? "—", r.findings || "—", r.signals || "—", null, r.latencyMs === null ? "—" : `${r.latencyMs} ms`];
    cells.forEach((value, i) => {
      const cell = el("td");
      if (i === 5) cell.append(el("span", `pill ${tone}`, outcome));
      else if (i === 9) cell.append(r.gate ? el("span", `pill ${/held|rewritten/.test(r.gate) ? "warn" : "ok"}`, r.gate) : document.createTextNode("—"));
      else cell.textContent = String(value);
      row.append(cell);
    });
    row.tabIndex = 0;
    const open = () => openDrawer(`${r.kind} ${r.id}`, r.detail);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => { if (event.key === "Enter") open(); });
    body.append(row);
  }
}

function render() {
  const data = state.data;
  if (!data) return;
  const real = data.source === "real";
  document.querySelectorAll(".lab-only").forEach((node) => node.classList.toggle("hidden", real));
  $("source-control").classList.toggle("hidden", data.sources.length < 2);
  $("source-note").classList.toggle("hidden", !real);
  if (real) $("source-note").textContent = `Watching ${data.watch}. Counters only: the dashboard does not read the real audit log (ADR 0040). Use ai-audit verify, report and workbench on the log itself.`;
  renderAlerts(data.alerts);
  if (!data.counters) { $("live-text").textContent = `Real proxy unreachable: ${data.error}`; $("live").className = "live off"; return; }
  renderStats(data); renderCharts(); renderBars(data);
  if (!real) { renderBench(data); renderLog(data); }
}

function setLive(ok) {
  $("live").className = `live ${ok ? "on" : "off"}`;
  $("live-text").textContent = ok ? `Updated ${clock(Date.now())}` : "Server unreachable";
}

async function poll() {
  try {
    const data = await fetch(`/api/dashboard?source=${state.source}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
    const t = Date.parse(data.at);
    if (data.counters) state.snapshots.push({ t, counters: data.counters });
    while (state.snapshots.length && state.snapshots[0].t < t - 1_800_000) state.snapshots.shift();
    state.data = data;
    setLive(true);
    render();
  } catch { setLive(false); }
}

async function runOne(name, label) {
  state.running.add(name); render();
  try {
    const response = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario: name }) });
    const result = await response.json();
    state.lastRun = { ...state.lastRun, [name]: result };
    if (response.status === 409) $("bench-summary").textContent = "Another check is running. Try again when it finishes.";
    else openDrawer(`${label}: ${result.verdict?.pass ? "pass" : "fail"}`, result);
  } finally { state.running.delete(name); await poll(); }
}

async function runAll() {
  const response = await fetch("/api/run-all", { method: "POST" });
  if (response.status === 409) $("bench-summary").textContent = "A check is already running.";
  await poll();
}

function schedule() {
  clearInterval(state.timer);
  const every = Number($("refresh").value);
  if (every) state.timer = setInterval(poll, every);
}

$("refresh").addEventListener("change", schedule);
$("source").addEventListener("change", () => { state.source = $("source").value; state.snapshots = []; state.seenEvents = null; poll(); });
$("notify").addEventListener("click", async () => {
  if (!("Notification" in window)) { $("notify").textContent = "Not supported"; return; }
  const permission = await Notification.requestPermission();
  $("notify").textContent = permission === "granted" ? "Notifications on" : "Notifications blocked";
});
$("range").addEventListener("change", render);
$("refresh-now").addEventListener("click", poll);
$("run-all").addEventListener("click", runAll);
$("drawer-close").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDrawer(); });
let resizeTimer;
addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderCharts, 150); });
await poll();
schedule();
