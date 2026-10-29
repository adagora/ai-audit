const element = (id) => document.getElementById(id);
const showcaseText = element("showcase-data").textContent.trim();
const showcase = showcaseText ? JSON.parse(showcaseText) : null;
const groups = [
  { name: "Routing and access", items: [
    ["clean", "Clean request", "Baseline forwarding"], ["virtualKey", "Virtual key", "401 before forwarding"],
    ["alias", "Model alias", "Requested vs routed model"], ["outage", "Upstream 503", "Failure record"], ["noUsage", "Missing usage", "Unknown is not zero"],
    ["useCaseShadow", "Use case: shadow", "Tool outside the row's list"], ["useCaseOff", "Use case: off", "403; refusal record"],
  ] },
  { name: "Inspection policy", items: [
    ["redact", "Redact credential", "Masked before upstream"], ["block", "No-go", "409; no upstream"],
    ["advisory", "Advisory", "Finding without block"], ["injection", "Tool injection", "Signal on tool result"],
    ["attachment", "Remote attachment", "422; uninspectable"],
  ] },
  { name: "Context and formats", items: [
    ["session", "Linked session", "Two context turns"], ["responses", "Responses SSE", "OpenAI stream"],
    ["anthropic", "Anthropic SSE", "Messages stream"], ["contextGrowth", "Growing context", "5 turns, one prefix rewrite"],
  ] },
  { name: "Evidence and QDL", items: [
    ["quineling", "Observe Quineling", "Tool hash and status"], ["qdl", "Run QDL", "Decision and SVG"],
    ["signed", "Signed review", "Detached attestation"], ["telemetry", "Metrics and stats", "Counters and tokens"],
    ["integrity", "Anchor chain", "Verified checkpoint"], ["failClosed", "Fail-closed log", "503; no forwarding"],
  ] },
];
const coverage = [
  ["Virtual and provider keys", "virtualKey", "401 before forwarding; upstream key swap", "HTTP / local"],
  ["Aliases and route control", "alias", "Requested model and upstream model", "HTTP / local"],
  ["Use-case table", "useCaseShadow", "Tier, row digest, row tool list, refusals by row", "HTTP / local"],
  ["Redact / no-go / advisory", "redact", "Decision, rule, path, upstream status", "HTTP / local"],
  ["Injection signals", "injection", "Rule and untrusted-content path", "HTTP / local"],
  ["Attachments and sandbox", "attachment", "422 for uninspectable URL; PDF worker in Linux CI", "Partial on this Mac"],
  ["OpenAI and Anthropic streams", "responses", "SSE events and provider usage", "HTTP / local"],
  ["Sessions and context", "session", "Role bytes, linked turns, context map", "HTTP + offline"],
  ["Unknown usage", "noUsage", "Missing token counts retained as unknown", "HTTP / local"],
  ["Quineling tool observation", "quineling", "Operation, source hash, status", "HTTP / local"],
  ["QDL execution and replay", "qdl", "Decision output, portable SVG and JSON", "Synthetic QDL"],
  ["Signed review", "signed", "Attestation and generated public key", "Synthetic reviewer"],
  ["Hash chain and anchors", "integrity", "Chain check and external checkpoint", "Local evidence"],
  ["Fail-closed logging", "failClosed", "503 when the log has a torn tail", "HTTP / local"],
  ["Stats and metrics", "telemetry", "Model tokens, OpenMetrics counters", "HTTP / local"],
  ["Reports and audit history", "qdl", "Offline workbench, per-request metadata", "Offline export"],
  ["Alerts", null, "Grafana alert rules and scrape health", "Monitoring stack"],
];
const colors = { system: "#9d86ef", tools: "#4ecdb4", user: "#5f9ff1", assistant: "#f1b362", toolResults: "#ed789a", attachments: "#a5b6c0", other: "#607a83" };
const names = { system: "System", tools: "Tool definitions", user: "User", assistant: "Assistant", toolResults: "Tool results", attachments: "Attachments", other: "Other" };
let mode = "synthetic";
let state;
let selected;
let selectedLabel = "";
let forwardedView = false;
let busy = false;

const text = (id, value) => { element(id).textContent = String(value ?? "—"); };
const child = (tag, className, value) => { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = String(value); return node; };
const setStatus = (value, warning = false) => { text("status-text", value); element("status-light").classList.toggle("off", warning); };
const number = (value) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : value === null || value === undefined ? "unknown" : String(value);
const routeName = (value) => value?.split("/").pop() ?? "—";
const findResponseText = (value) => {
  if (value.qdl) return `QDL ${value.qdl.status}\nOutputs: ${JSON.stringify(value.qdl.output)}\nPortable replay: ${value.portableVerification?.reproduced ? "reproduced" : "unknown"}`;
  if (value.verification?.origin) return `Signature: ${value.verification.origin}\nReview: ${value.verification.verdict}\nKey trust: ${value.verification.identity}`;
  if (value.metrics) return `${value.metrics.length} OpenMetrics samples; ${Array.isArray(value.stats) ? value.stats.length : Object.keys(value.stats ?? {}).length} stats groups`;
  if (value.checkpoint) return `Anchor: ${value.anchor?.ok ? "verified" : "failed"}\nChain: ${value.chain?.ok ? "intact" : "broken"}`;
  const response = value.response;
  if (response?.text) return String(response.text);
  if (response?.output_text) return String(response.output_text);
  if (Array.isArray(response?.output)) return response.output.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n") || JSON.stringify(response);
  if (response?.choices?.[0]?.message?.content) return String(response.choices[0].message.content);
  if (typeof response === "string") {
    if (response.includes("data:")) {
      const parts = [...response.matchAll(/^data:\s*(\{[^\n]*\})/gm)].map((match) => { try { return JSON.parse(match[1]); } catch { return null; } }).filter(Boolean);
      const content = parts.map((part) => part.delta ?? part.choices?.[0]?.delta?.content ?? part.content_block?.text ?? "").join("");
      return content || `${parts.length} streamed events`;
    }
    try { return findResponseText({ response: JSON.parse(response) }); } catch { return response; }
  }
  if (response) return JSON.stringify(response, null, 2);
  if (value.forwarded === false) return "Request did not reach the upstream provider.";
  return "No provider response in this check.";
};

function renderScenarios(filter = "") {
  const container = element("scenarios"); container.replaceChildren();
  for (const group of groups) {
    const shown = group.items.filter(([id, title, detail]) => `${id} ${title} ${detail}`.toLowerCase().includes(filter.toLowerCase()));
    if (!shown.length) continue;
    const section = child("div", "scenario-group"); section.append(child("div", "group-title", group.name));
    const buttons = child("div", "scenario-buttons");
    for (const [id, title, detail] of shown) {
      const button = child("button", "scenario-button"); button.type = "button"; button.dataset.scenario = id;
      button.append(child("strong", "", title), child("span", "", detail));
      button.disabled = busy; button.addEventListener("click", () => runScenario(id, title)); buttons.append(button);
    }
    section.append(buttons); container.append(section);
  }
  if (!container.childElementCount) container.append(child("div", "empty", "No matching scenario."));
}

function renderCoverage() {
  const rows = element("coverage-rows"); rows.replaceChildren();
  for (const [feature, scenario, evidence, scope] of coverage) {
    const row = child("tr"); const first = child("td", "", feature); const action = child("td");
    if (scenario && mode !== "real") { const button = child("button", "", groups.flatMap((group) => group.items).find((item) => item[0] === scenario)?.[1] ?? scenario); button.type = "button"; button.addEventListener("click", () => { runScenario(scenario, button.textContent); document.getElementById("requests").scrollIntoView({ behavior: "smooth" }); }); action.append(button); }
    else action.textContent = scenario ? "Synthetic page / CLI" : "Grafana dashboard";
    row.append(first, action, child("td", "", evidence), child("td", "", scope)); rows.append(row);
  }
}

function renderArtifacts(artifacts, value) {
  const box = element("artifact-box"); box.replaceChildren(); box.classList.toggle("hidden", !artifacts);
  if (!artifacts) return;
  const links = child("div", "artifact-links");
  for (const [name, url] of Object.entries(artifacts)) {
    const link = child("a", "", name === "publicKey" ? "Public key" : name === "attestation" ? "Attestation" : name.toUpperCase());
    link.href = url; link.download = name === "publicKey" ? "reviewer.pub.pem" : `decision.${name === "attestation" ? "attestation.json" : name}`; links.append(link);
  }
  if (artifacts.svg) { const open = child("a", "", "Open SVG"); open.href = artifacts.svg; open.target = "_blank"; open.rel = "noopener"; links.append(open); }
  box.append(links);
  if (artifacts.svg) { const image = child("img"); image.src = artifacts.svg; image.alt = "Quineling decision SVG with calculated steps"; box.append(image); }
  box.append(child("p", "", value.trust ?? "Portable replay checks calculation and presentation. Origin and human approval need a separately trusted signature."));
}

function renderResult(value, label) {
  selected = value; selectedLabel = label;
  text("result-label", label); text("result-code", value.status ?? "—");
  element("result-code").classList.toggle("bad", typeof value.status === "number" && value.status >= 400);
  text("last-status", value.status ?? "—"); text("last-status-note", routeName(value.endpoint));
  text("context-size", value.record?.context?.totalBytes ?? value.contextView?.composition?.totalBytes ?? "—");
  text("chain-state", value.chain?.ok === true ? "Intact" : value.chain?.ok === false ? "Broken" : mode === "real" ? "CLI" : "—");
  text("chain-note", value.chain ? "Hash chain verified from synthetic log" : mode === "real" ? "Verify the real log offline" : "No chain result in this check");
  const facts = element("result-facts"); facts.replaceChildren();
  const addFact = (name, content) => { const cell = child("div"); cell.append(child("span", "", name), child("strong", "", content)); facts.append(cell); };
  addFact("Request ID", value.requestId ?? value.decisionId ?? "—");
  addFact("Decision", value.record?.decision?.action ?? value.qdl?.status ?? value.verification?.verdict ?? (value.status === 401 ? "unauthorized" : "—"));
  addFact("Upstream", value.forwarded === false ? "not forwarded" : value.record?.upstreamStatus ?? (mode === "real" ? value.status : "—"));
  const usage = value.record?.usage ?? value.response?.usage;
  addFact("Usage", usage ? `${number(usage.input ?? usage.input_tokens)} in / ${number(usage.output ?? usage.output_tokens)} out` : "unknown");
  text("answer", findResponseText(value)); text("raw-result", JSON.stringify(value, null, 2)); renderArtifacts(value.artifacts, value);
  renderContext(value.contextView, value.record?.context);
  const session = value.record?.session?.id;
  const link = element("session-link"); link.classList.toggle("hidden", !(session && mode === "synthetic"));
  if (session && mode === "synthetic") link.href = `/api/context/${session}`;
}

function renderContext(preview, logged) {
  const composition = logged ?? preview?.composition;
  const bar = element("composition-bar"), legend = element("composition-legend"); bar.replaceChildren(); legend.replaceChildren();
  if (!composition) {
    text("context-basis", "This result has no request context. Authentication failures do not create an audit record.");
    text("context-total", "No context"); text("message-count", "—"); text("token-basis", "No token attribution.");
    element("context-items").replaceChildren(child("div", "empty", "No context for this check.")); return;
  }
  text("context-basis", mode === "real" ? "Exact client-held messages; after-policy text is derived with the same scanner. The audit log does not retain these values." : mode === "showcase" ? "Recorded synthetic request and observed forwarded content." : "Synthetic client request and content observed at the mock upstream.");
  const bytes = composition.bytes ?? {}, total = Object.values(bytes).reduce((sum, value) => sum + (Number(value) || 0), 0);
  text("context-total", `${number(composition.totalBytes ?? total)} bytes`);
  for (const [key, label] of Object.entries(names)) {
    const amount = Number(bytes[key]) || 0;
    if (amount <= 0) continue;
    const segment = child("span"); segment.style.width = `${amount / total * 100}%`; segment.style.background = colors[key]; segment.title = `${label}: ${amount} bytes`; bar.append(segment);
    const row = child("div", "legend-row"); const caption = child("span"); const chip = child("i"); chip.style.background = colors[key]; caption.append(chip, document.createTextNode(label)); row.append(caption, child("b", "", `${amount} B`)); legend.append(row);
  }
  const tokenBasis = composition.tokenBasis === "provider-scaled" ? "Role token counts are scaled to provider-reported input usage." : "Role bytes are measured; per-role tokens are unknown.";
  text("token-basis", tokenBasis);
  text("message-count", `${preview?.original?.length ?? 0} items`);
  renderContextItems(preview);
}

function renderContextItems(preview) {
  const container = element("context-items"); container.replaceChildren();
  element("view-original").classList.toggle("selected", !forwardedView); element("view-forwarded").classList.toggle("selected", forwardedView);
  if (!preview) { container.append(child("div", "empty", "No message list available for this check.")); text("forwarded-basis", ""); return; }
  const items = forwardedView ? preview.forwarded : preview.original;
  if (items === null) container.append(child("div", "empty", "Proxy did not forward this request."));
  else if (!items?.length) container.append(child("div", "empty", "No text items in this request."));
  else for (const [index, item] of items.entries()) {
    const card = child("div", "context-item"), head = child("div", "context-item-head");
    head.append(child("span", "", `${index + 1}. ${item.role}${item.detail ? ` · ${item.detail}` : ""}`), child("span", "", `${number(item.bytes)} B`));
    card.append(head, child("pre", "", item.content || "[empty]")); container.append(card);
  }
  const basis = preview.forwardedBasis === "observed-upstream" ? "After policy: exact request body observed by the synthetic upstream." : preview.forwardedBasis === "scanner-derived" ? "After policy: scanner-derived preview. The real proxy is the forwarding authority." : "No forwarded context for this request.";
  text("forwarded-basis", forwardedView ? basis : "Client input is held by this page for the current conversation; the persistent audit log does not retain it.");
}

function renderHistory(data) {
  const body = element("history-rows"); body.replaceChildren();
  const records = data?.records ?? [];
  if (!records.length) { const row = child("tr"), cell = child("td", "", "No requests yet."); cell.colSpan = 5; row.append(cell); body.append(row); }
  for (const record of records.slice(0, 50)) {
    const row = child("tr"), when = record.ts ? new Date(record.ts).toLocaleTimeString() : record.turn ? `Turn ${record.turn}` : "—";
    const route = record.endpoint ? routeName(record.endpoint) : record.provider ? `${record.provider}/${record.model ?? "—"}` : record.kind ?? "—";
    const status = record.action ?? record.qdlStatus ?? record.review ?? (record.status ?? "—");
    const signals = (record.signals?.length ?? 0) + (record.quinelings?.length ?? 0) + (Number(record.signalCount) || 0);
    const usage = record.usage ? `${number(record.usage.input)} / ${number(record.usage.output)}` : "unknown";
    row.append(child("td", "", when), child("td", "", route), child("td", "", status), child("td", "", signals || record.findings?.length || record.findingCount || "—"), child("td", "", usage)); body.append(row);
  }
  text("history-basis", mode === "showcase" ? "Recorded synthetic hash-chained metadata; prompt values omitted from the audit log." : data?.basis ?? (mode === "synthetic" ? "Synthetic hash-chained records from all three policy modes; values omitted." : "Request summaries held by this page; real audit log stays offline."));
  if (mode === "synthetic") text("request-count", records.filter((record) => record.kind === "llm-call").length);
  if (mode === "showcase") text("request-count", records.filter((record) => record.kind === "llm-call").length);
}

function renderTelemetry(data) {
  const metrics = data?.metrics ?? [], cards = element("telemetry-summary"); cards.replaceChildren();
  const status = data?.health ?? "—";
  const facts = [
    ["Proxy health", status], ["Readiness", data?.ready ?? "local"],
    ["Metric samples", metrics.length], ["Stats groups", Array.isArray(data?.stats) ? data.stats.length : Object.keys(data?.stats ?? {}).length],
  ];
  for (const [label, value] of facts) { const box = child("div", "telemetry-card"); box.append(child("span", "", label), child("strong", "", value)); cards.append(box); }
  text("telemetry-raw", JSON.stringify(data, null, 2));
  text("telemetry-basis", data?.basis ?? "OpenMetrics counters omit prompts, session IDs and detected values.");
}

function renderVerification(verification) {
  const box = element("verification-results"); box.replaceChildren();
  if (!verification) { box.append(child("div", "empty", "No HTTP suite run in this page session.")); return; }
  if (verification.state === "running") { box.append(child("div", "empty", "HTTP suite running…")); return; }
  const results = verification.report?.results ?? [];
  if (!results.length) { box.append(child("div", "empty", verification.error ?? verification.stderr ?? "No results file produced.")); return; }
  for (const result of results) { const row = child("div", "verify-row"); row.append(child("span", "", result.name + (result.error ? ` · ${result.error}` : "")), child("strong", result.status, result.status.toUpperCase())); box.append(row); }
}

async function loadState() {
  state = showcase ? showcase.state : await fetch("/api/state", { cache: "no-store" }).then((response) => response.json());
  mode = state.mode;
  text("mode-badge", mode === "real" ? "Real OpenAI" : mode === "showcase" ? "Recorded demo" : "Synthetic lab");
  text("connection", mode === "showcase" ? "Static evidence" : "Local proxy ready");
  text("mode-description", mode === "real" ? "Live OpenAI requests through the local proxy. Current client context appears below; real log inspection stays offline." : mode === "showcase" ? "Recorded synthetic runs. Controls replay captured results; this public page does not contact a provider or proxy." : "Local synthetic runs through the actual proxy handler. Each scenario records its observed result.");
  text("request-count-note", mode === "showcase" ? "Recorded proxy calls" : mode === "real" ? "This conversation" : "This server run");
  text("evidence-description", mode === "showcase" ? "Recorded synthetic log metadata, telemetry and portable artifacts." : mode === "real" ? "Current page history and proxy telemetry. Inspect the real audit log offline." : "Live synthetic log metadata, telemetry and offline artifacts.");
  text("request-scope", mode === "real" ? "Choose a model and send a real OpenAI request." : mode === "showcase" ? "Select a recorded scenario to inspect its captured evidence." : "Run a fixed HTTP check or send a custom request to the mock provider.");
  element("scenario-area").classList.toggle("hidden", mode === "real");
  document.querySelectorAll(".topbar-link").forEach((link) => link.classList.toggle("hidden", mode === "showcase"));
  element("verification-panel").classList.toggle("hidden", mode !== "synthetic");
  element("verification-panel").parentElement.classList.toggle("single", mode !== "synthetic");
  element("custom-form").classList.toggle("hidden", mode === "showcase");
  element("mode-field").classList.toggle("hidden", mode === "real");
  element("model-field").classList.toggle("hidden", mode !== "real");
  element("stream-field").classList.toggle("hidden", mode !== "real");
  element("reset-conversation").classList.toggle("hidden", mode !== "real");
  element("refresh-models").classList.toggle("hidden", mode !== "real");
  element("anthropic-option").disabled = mode === "real";
  if (mode === "real") {
    element("api").value = "responses";
    if (state.model) element("model").value = state.model;
    text("request-count", state.sent ?? 0);
    text("offline-command", `node dist/src/cli.js verify --log ${state.logPath}\nnode dist/src/cli.js context --log ${state.logPath}\nnode dist/src/cli.js workbench --log ${state.logPath} --output /private/tmp/ai-audit-workbench.html`);
    text("offline-note", "The real log stores rule codes, paths, usage and context sizes. It does not retain prompt values. Export the workbench locally and review a receipt before sharing.");
    element("workbench-link").classList.add("hidden"); element("run-verification").classList.add("hidden");
  } else if (mode === "showcase") {
    element("run-verification").classList.add("hidden");
    element("workbench-link").href = showcase.workbench;
    for (const [index, label] of ["Grafana dashboard JSON", "Grafana alert rules"].entries()) {
      const link = child("a", "button secondary", label); link.href = showcase.monitoring[index]; link.download = showcase.monitoring[index].split("/").pop(); element("offline-actions").append(link);
    }
    text("offline-command", "Recorded synthetic evidence only. Run npm run example:workflow locally to execute new scenarios.");
    text("offline-note", "No visitor prompt is sent to OpenAI. Portable QDL receipts include source and synthetic inputs; verify them independently before sharing.");
  } else {
    text("offline-command", "node dist/src/cli.js verify --log SYNTHETIC_LOG\nnode dist/src/cli.js workbench --log SYNTHETIC_LOG --output workbench.html");
  }
  text("footer-scope", mode === "showcase" ? "Static files contain recorded synthetic evidence only." : mode === "real" ? "Provider key stays in the proxy process; this page holds the current conversation in memory." : "All provider and client keys are generated fakes.");
  if (state.verification) renderVerification(state.verification);
  renderCoverage(); renderScenarios(element("scenario-filter").value);
  return state;
}

async function loadHistory() {
  try { renderHistory(showcase ? showcase.history : await fetch("/api/history", { cache: "no-store" }).then((response) => response.json())); }
  catch (error) { text("history-basis", `Could not load history: ${error.message}`); }
}

async function loadTelemetry() {
  try { renderTelemetry(showcase ? showcase.telemetry : await fetch("/api/telemetry", { cache: "no-store" }).then((response) => response.json())); }
  catch (error) { text("telemetry-basis", `Could not load telemetry: ${error.message}`); }
}

async function post(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok && response.status !== 202) throw new Error(value.error ?? `HTTP ${response.status}`);
  return value;
}

async function execute(payload, label) {
  if (busy) return;
  busy = true; renderScenarios(element("scenario-filter").value); element("send").disabled = true; setStatus(`Running ${label}…`);
  try {
    const value = mode === "showcase" ? showcase.scenarios[payload.scenario] : await post("/api/run", payload);
    if (!value) throw new Error("This scenario is not in the recorded export.");
    renderResult(value, label); setStatus(`${mode === "showcase" ? "Recorded" : "Completed"}: ${label}`, value.status >= 400);
    if (mode !== "showcase") { await loadState(); await loadHistory(); await loadTelemetry(); }
  } catch (error) { setStatus(`Failed: ${error.message}`, true); text("answer", error.message); }
  finally { busy = false; renderScenarios(element("scenario-filter").value); element("send").disabled = false; }
}

const runScenario = (id, label) => execute({ scenario: id }, label);
element("scenario-filter").addEventListener("input", () => renderScenarios(element("scenario-filter").value));
element("custom-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const payload = { scenario: "custom", api: element("api").value, mode: element("policy").value, text: element("prompt").value.trim() };
  if (mode === "real") { payload.model = element("model").value.trim(); payload.stream = element("stream").checked; }
  execute(payload, "Custom request");
});
element("view-original").addEventListener("click", () => { forwardedView = false; renderContextItems(selected?.contextView); });
element("view-forwarded").addEventListener("click", () => { forwardedView = true; renderContextItems(selected?.contextView); });
element("refresh-history").addEventListener("click", loadHistory);
element("refresh-telemetry").addEventListener("click", loadTelemetry);
element("refresh-models").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/models"); const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? `HTTP ${response.status}`);
    element("models").replaceChildren(...(data.models ?? []).map((model) => { const option = child("option"); option.value = model; return option; }));
    setStatus(`${data.models?.length ?? 0} models loaded`);
  } catch (error) { setStatus(`Model list: ${error.message}`, true); }
});
element("reset-conversation").addEventListener("click", async () => {
  try { await post("/api/reset", {}); setStatus("Conversation reset. Next request starts a new context."); await loadState(); }
  catch (error) { setStatus(`Reset failed: ${error.message}`, true); }
});
element("run-verification").addEventListener("click", async () => {
  try {
    await post("/api/verify", {}); renderVerification({ state: "running" });
    const timer = setInterval(async () => {
      try { const latest = await loadState(); if (latest.verification?.state !== "running") { clearInterval(timer); renderVerification(latest.verification); } }
      catch { clearInterval(timer); }
    }, 1200);
  } catch (error) { setStatus(`Verification failed: ${error.message}`, true); }
});

await loadState().then(() => Promise.all([loadHistory(), loadTelemetry()])).then(() => setStatus("Ready")).catch((error) => { text("connection", "Unavailable"); element("connection-dot").classList.add("off"); setStatus(error.message, true); });
