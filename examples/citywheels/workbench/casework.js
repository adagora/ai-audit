const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
const $ = (id) => document.getElementById(id);
const endpoint = "/api/casework/";
const pretty = (value) => JSON.stringify(value, null, 2);
let session, customerRequests = [], cases = [], qualifications = [], authority, monitoring, insights, inbox = [], operations = [], bookings = [], learning = [], learningIdentities = [], regressions = [], economicsResult = null, filter = "all", busy = false;
let section = new URLSearchParams(location.search).get("view") ?? "cases";
let selected = new URLSearchParams(location.search).get("case");
const labels = { cases: "Cases", intents: "Intents", qualifications: "Qualifications", authority: "Authority", execution: "Execution", monitoring: "Monitoring", exceptions: "Exceptions", outcomes: "Outcomes", learning: "Learning", inbox: "Your inbox", requests: "Your requests" };
const readable = (value) => String(value ?? "unknown").replace(/^audit_(casework|authority|qualification|executor|learning)_/, "").replaceAll("_", " ");
const date = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
const notice = (text = "") => { $("notice").textContent = text; };

function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node[key] = value;
    else if (key === "checked" || key === "disabled" || key === "required") node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
const button = (label, action, className = "secondary", disabled = false) => el("button", { type: "button", class: className, disabled, onclick: action }, label);
const pill = (value, tone = "") => el("span", { class: "pill " + tone }, readable(value));
const panel = (title, ...contents) => el("section", { class: "panel" }, el("h2", {}, title), ...contents);
const empty = (title, copy) => el("div", { class: "empty" }, el("h2", {}, title), el("p", {}, copy));
const details = (title, value) => el("details", {}, el("summary", {}, title), el("pre", {}, typeof value === "string" ? value : pretty(value)));
const field = (label, input) => el("label", {}, label, input);
const input = (name, value = "", attrs = {}) => el("input", { name, value, ...attrs });
const select = (name, options) => el("select", { name }, options.map(([value, label]) => el("option", { value }, label)));
const roles = (name) => session.operator?.roles.includes(name);
const implementation = (digest) => cases.find((c) => c.qualificationDigest === digest)?.origin.target ?? "unknown";
const localTime = (offset) => { const d = new Date(Date.now() + offset); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const money = (minor, currency = "EUR") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
function minorInput(raw) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split("."), result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}

async function api(path, body) {
  const response = await fetch(endpoint + path, { signal: AbortSignal.timeout(30000), method: body === undefined ? "GET" : "POST", headers: { "x-workbench-token": token, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json();
  if (!response.ok) throw new Error(readable(value.error ?? `HTTP ${response.status}`));
  return value;
}
async function mutate(path, body) {
  if (busy) return;
  busy = true; notice(); document.querySelectorAll("main button").forEach((node) => { node.disabled = true; });
  try { const value = await api(path, body); await load(); notice(value.delivery?.state === "held" ? `Delivery held: ${readable(value.delivery.reason)}.` : value.status === "done" ? "Read-back confirms the synthetic cancellation and refund. No real payment was made." : value.status === "unknown" ? "The operation needs staff reconciliation. No settlement is assumed." : "Saved to the local case history."); }
  catch (error) { await load(); notice(error.message); }
  finally { busy = false; }
}
function navigate(view, id = null) {
  section = view; selected = id;
  const url = new URL(location.href); url.searchParams.set("view", view);
  if (id) url.searchParams.set("case", id); else url.searchParams.delete("case");
  history.pushState(null, "", url); notice(); render();
}
function heading(title, copy) { return el("div", { class: "section-top" }, el("div", {}, el("h1", {}, title), el("p", { class: "lede" }, copy)), pill("synthetic workspace")); }
function metadata(entries) { return el("dl", { class: "meta" }, entries.flatMap(([key, value]) => [el("dt", {}, key), el("dd", {}, value)])); }
function caseBadge(c) { return c.escalation && c.escalation.status !== "resolved" ? pill("needs attention", "warn") : c.delivery.state === "held" ? pill("delivery held", "warn") : pill(c.outcome.state); }
function caseRows(rows) {
  if (!rows.length) return empty("No cases here yet", "Run a help-desk experiment to retain an actual application answer and its evidence. New cases arrive here without delivery permission.");
  return el("div", { class: "rows" }, el("div", { class: "list-caption" }, ["CUSTOMER WORK", "STATE", "IMPLEMENTATION"].map((label) => el("span", {}, label))), rows.map((c) => el("div", { class: "row" },
    el("div", {}, button(c.question || "Application returned no question", () => navigate("cases", c.id), "row-title"), el("p", {}, `${c.intent} · ${date(c.createdAt)} · ${c.id.slice(0, 8)}`)),
    el("div", {}, caseBadge(c)), el("div", {}, el("small", {}, c.origin.target === "ai-audit" ? "ai-audit + QDL" : c.origin.target === "python-audit" ? "Python + proxy + QDL" : c.origin.target), el("p", {}, `${c.delivery.state} · ${c.origin.evaluation}`)) )));
}
function stats(entries) { return el("div", { class: "stats" }, entries.map(([value, label]) => el("div", { class: "stat" }, el("strong", {}, value), el("span", {}, label)))); }

function casesView() {
  if (selected) { const c = cases.find((row) => row.id === selected); return c ? detailView(c) : [heading("Case unavailable", "This case is not available to your current operator session."), button("Back to cases", () => navigate("cases"))]; }
  const needs = (c) => (c.escalation && c.escalation.status !== "resolved") || c.delivery.state === "held" || operations.some((op) => op.proposal.caseId === c.id && ["unknown", "dispatching"].includes(op.status));
  const filtered = cases.filter((c) => filter === "all" || (filter === "attention" && needs(c)) || (filter === "delivered" && c.delivery.state === "delivered") || (filter === "resolved" && c.outcome.state === "resolved"));
  return [heading("Customer work, with evidence.", "Follow each question from the application's answer to its qualification, authority and observed outcome."),
    stats([[cases.length, "Retained cases"], [cases.filter(needs).length, "Need attention"], [cases.filter((c) => c.delivery.state === "delivered").length, "Delivered to local inbox"], [cases.filter((c) => c.outcome.state === "resolved").length, "Recorded as resolved"]]),
    el("div", { class: "toolbar", "aria-label": "Filter cases" }, [["all", "All cases"], ["attention", "Needs attention"], ["delivered", "Delivered"], ["resolved", "Resolved"]].map(([value, label]) => button(label, () => { filter = value; render(); }, value === filter ? "active" : ""))), caseRows(filtered)];
}

function detailView(c) {
  const reviewActions = el("div", { class: "actions" }, button("Approve answer", () => mutate(`cases/${c.id}/review`, { verdict: "approved" }), "secondary", !roles("reviewer") || !!c.review || c.delivery.state === "delivered"), button("Reject answer", () => mutate(`cases/${c.id}/review`, { verdict: "rejected" }), "danger", !roles("reviewer") || !!c.review || c.delivery.state === "delivered"), button("Deliver to local inbox", () => mutate(`cases/${c.id}/deliver`, {}), "", c.delivery.state === "delivered"));
  const conversation = panel("Question and observed answer", el("p", { class: "question" }, c.question), el("div", { class: "divider" }), el("p", { class: "tagline" }, c.origin.target === "python" ? "ORIGINAL PYTHON APPLICATION" : "AI-AUDIT APPLICATION"), el("div", { class: "answer" }, c.answer || "No answer returned."), reviewActions,
    el("p", { class: "small muted" }, c.delivery.state === "delivered" ? "Confirmed in the synthetic customer outbox. No external message was sent." : `Delivery: ${readable(c.delivery.reason)}. Evaluation and review do not send a message.`));
  const evidence = panel("Evidence and authority", metadata([["Intent", c.intent], ["Business check", pill(c.origin.evaluation, c.origin.evaluation === "pass" ? "" : "warn")], ["Proxy evidence", c.origin.audit.available ? `${c.origin.audit.records.length} records · ${c.origin.audit.chainVerified ? "chain verified" : "verification unavailable"}` : "No proxy evidence for this application"], ["Answer review", c.review ? `${c.review.verdict} · ${c.review.actor}` : "No verdict recorded"], ["Delivery", c.delivery.state], ["Qualification", el("span", { class: "mono" }, c.qualificationDigest)], ["Active action grant", c.delivery.grantId ? el("span", { class: "mono" }, c.delivery.grantId) : "No grant used"]]), el("div", { class: "actions" }, button("Inspect qualification", () => navigate("qualifications")), button("Manage authority", () => navigate("authority"))), details("Source observation and qualification references", c.origin), c.context ? details("Verified booking snapshot and policy validity", c.context) : null);
  const original = el("div");
  evidence.append(button("Inspect original tool observations", async () => {
    try { original.replaceChildren(details("Original application evidence", await api(`cases/${c.id}/evidence`))); original.querySelector("details").open = true; }
    catch (error) { notice(error.message); }
  }), original);
  const timelineItems = c.events.map((event) => el("li", {}, el("time", { datetime: event.at }, date(event.at)), el("div", {}, el("strong", {}, readable(event.type.replaceAll("-", " "))), el("p", {}, `${readable(event.code)} · ${event.actor}`))));
  const timeline = panel("Case history", el("ol", { class: "timeline" }, timelineItems));
  const outcome = panel("Observed outcome", pill(c.outcome.state), el("p", { class: "small muted" }, `Reopened ${c.outcome.reopened} time(s). These are operator observations, not independent correctness labels.`), el("div", { class: "actions" }, c.outcome.state !== "resolved" ? button("Mark resolved", () => mutate(`cases/${c.id}/outcome`, { state: "resolved", code: "operator_confirmed" })) : button("Reopen case", () => mutate(`cases/${c.id}/outcome`, { state: "reopened", code: "repeat_contact" })), button("Record dispute", () => mutate(`cases/${c.id}/outcome`, { state: "disputed", code: "customer_disputed" }), "secondary", c.outcome.state === "disputed")));
  return [button("← All cases", () => navigate("cases")), heading(`Case ${c.id.slice(0, 8)}`, `${c.intent} · ${c.origin.scenarioId} · ${date(c.createdAt)}`), el("div", { class: "grid" }, el("div", {}, conversation, cancellationPanel(c), timeline), el("div", {}, evidence, outcome, escalationPanel(c), costPanel(c)))];
}

function escalationPanel(c) {
  const e = c.escalation;
  if (e && e.status !== "resolved") return panel("Owned handoff", pill(e.status, "warn"), el("p", { class: "small" }, e.summary), metadata([["Owner", e.owner], ["Reason", readable(e.reason)], ["Deadline", date(e.dueAt)], ["Accepted by", e.acceptedBy ?? "Awaiting acceptance"]]), el("div", { class: "actions" }, e.status === "open" ? button("Accept handoff", () => mutate(`cases/${c.id}/handoff`, { action: "accept" })) : button("Resolve handoff", () => mutate(`cases/${c.id}/handoff`, { action: "resolve" }), "secondary", e.acceptedBy !== session.operator.id)));
  const form = el("form", { onsubmit: (event) => { event.preventDefault(); const data = new FormData(form); mutate(`cases/${c.id}/escalate`, { owner: data.get("owner"), reason: data.get("reason"), summary: data.get("summary"), dueAt: new Date(String(data.get("dueAt"))).toISOString() }); } },
    field("Team or owner", input("owner", "support-ops", { required: true, pattern: "[A-Za-z0-9][A-Za-z0-9._:-]{0,127}" })), field("Reason", select("reason", [["customer_followup", "Customer follow-up"], ["policy_unclear", "Policy needs clarification"], ["claim_requires_verification", "Verify a customer claim"], ["execution_exception", "Execution needs reconciliation"]])), field("Handoff summary", el("textarea", { name: "summary", rows: "3", required: true, maxlength: "2000" })), field("Due by", input("dueAt", localTime(24 * 3600000), { type: "datetime-local", required: true })), el("button", { type: "submit", class: "secondary" }, "Create owned handoff"));
  return panel("Handoff", el("p", { class: "small muted" }, e ? `Previous handoff resolved by ${e.resolvedBy}.` : "Give the next step an owner and a deadline."), form);
}

function operationCard(op) {
  const p = op.proposal, path = `cases/${p.caseId}/operations/${p.id}/`, expired = Date.parse(p.expiresAt) <= Date.now();
  const pending = ["proposed", "ready"].includes(op.status), state = pending && expired ? "expired quote" : op.status;
  const card = panel(`Booking ${p.bookingId} · ${money(p.amountMinor, p.currency)}`, pill(state, ["unknown", "dispatching", "expired quote"].includes(state) ? "warn" : ""),
    metadata([["Refund method", p.paymentKind === "voucher" ? "Voucher credit, never cash" : "Original payment card"], ["Booking version", p.bookingVersion], ["Shop calculation time", date(p.businessAt)], ["Quote expires", date(p.expiresAt)], ["Customer consent", op.consentAt ? date(op.consentAt) : "Not recorded"], ["Operation review", op.review?.verdict ?? "Not recorded"]]),
    el("p", { class: "small muted" }, "This is a synthetic booking and ledger. No real cancellation or payment is made."));
  if (session.customer) {
    if (pending && !expired && !op.consentAt) {
      const form = el("form", { onsubmit: (event) => { event.preventDefault(); mutate(path + "consent", {}); } },
        el("label", { class: "check-label" }, input("consent", "on", { type: "checkbox", required: true }), `I consent to this synthetic cancellation and ${money(p.amountMinor, p.currency)} refund by the stated method.`), el("button", { type: "submit" }, "Confirm this proposal"));
      card.append(form);
    }
    if (expired && ["proposed", "ready", "rejected"].includes(op.status)) card.append(button("Request a fresh proposal", () => mutate(path + "renew", {})));
    if (op.needsStaff) card.append(el("p", { class: "small muted" }, "Staff are reconciling the operation. A refund is not assumed until read-back confirms it."));
  } else {
    const actions = el("div", { class: "actions" });
    if (pending && !expired) {
      actions.append(button("Approve operation", () => mutate(path + "review", { verdict: "approved" }), "secondary", !!op.review || !roles("reviewer")), button("Reject operation", () => mutate(path + "review", { verdict: "rejected" }), "danger", !!op.review || !roles("reviewer")),
        button("Execute synthetic operation", () => mutate(path + "execute", {}), "", !op.consentAt || (p.amountMinor > session.executor.automaticApprovalMinor && op.review?.verdict !== "approved")));
    }
    if (expired && ["proposed", "ready", "rejected"].includes(op.status)) actions.append(button("Renew expired proposal", () => mutate(path + "renew", {})));
    if (["dispatching", "unknown"].includes(op.status)) actions.append(button("Read back backend state", () => mutate(path + "reconcile", {})));
    if (op.status === "unknown" && ["cancelled_refund_unsettled", "refund_backend_failed"].includes(op.exception?.code) && roles("operator") && roles("reviewer")) actions.append(button("Authorize remaining synthetic refund", () => mutate(path + "resolve", {})));
    card.append(actions);
    if (op.exception) card.append(el("p", { class: "small" }, `Exception owner: ${op.exception.owner} · ${readable(op.exception.code)}.`));
    if (op.status === "done") card.append(el("p", { class: "small" }, "Backend read-back confirms cancellation and the exact synthetic refund. Retrying does not issue another refund."));
    if (pending && !expired) {
      const selector = select("fault", [["before-dispatch", "Interrupt before backend dispatch"], ["after-cancel", "Interrupt after cancellation"], ["after-refund", "Interrupt after refund commit"], ["refund-failure", "Return a refund backend failure"]]);
      const lab = el("details", {}, el("summary", {}, "Synthetic failure laboratory"), field("Failure point", selector), el("p", { class: "small muted" }, "The same consent, review and grant checks apply. After an interruption, read back state before deciding what to do."), button("Execute with selected fault", () => mutate(path + "execute", { fault: selector.value }), "secondary", !op.consentAt || (p.amountMinor > session.executor.automaticApprovalMinor && op.review?.verdict !== "approved")));
      card.append(lab);
    }
    card.append(details("Immutable proposal and execution events", { proposal: p, grantId: op.grantId, resolution: op.resolution ?? null, events: op.events }));
    card.append(button("Open source case", () => navigate("cases", p.caseId)));
  }
  return card;
}

function cancellationPanel(c) {
  const existing = operations.filter((op) => op.proposal.caseId === c.id);
  const available = bookings.filter((b) => b.tenant === c.tenant && b.customer === c.customer && b.status === "confirmed");
  const content = existing.map(operationCard);
  if (c.intent !== "refund") return el("div", {}, content);
  const choices = select("bookingId", [["", "Select the booking the customer wants"], ...available.map((b) => [b.id, `${b.id} · ${b.paymentKind ?? "card"} · record v${b.version}`])]);
  choices.required = true;
  const mentioned = available.find((b) => c.question.includes(b.id));
  if (mentioned) choices.value = mentioned.id;
  const form = el("form", { onsubmit: (event) => { event.preventDefault(); const data = new FormData(form); mutate(`cases/${c.id}/operations`, { bookingId: data.get("bookingId"), stormClaim: data.get("stormClaim") === "on" }); } },
    field("Owned synthetic booking", choices), el("label", { class: "check-label" }, input("stormClaim", "on", { type: "checkbox" }), "Customer reports a storm warning; staff must verify eligibility."),
    el("button", { type: "submit", class: "secondary" }, "Prepare cancellation proposal"));
  return el("div", {}, panel("Separate business execution", el("p", { class: "small muted" }, `The help-desk answer is a quote. The executor reads its own live booking records and recomputes the amount. Shop clock: ${date(session.executor.businessAt)}. Customer consent is collected in the separate customer URL.`), available.length ? form : el("p", { class: "small muted" }, "No confirmed bookings are available to this customer's scope.")), content);
}

function executionView() {
  const uncertain = operations.filter((op) => ["dispatching", "unknown"].includes(op.status));
  return [heading("Actions against current business facts.", "The help desk proposes; the executor checks ownership, consent, exact review and active authority. A simulated refund is complete only after backend read-back."),
    stats([[operations.length, "Retained proposals"], [operations.filter((op) => op.status === "proposed").length, "Awaiting customer consent"], [uncertain.length, "Need reconciliation"], [operations.filter((op) => op.status === "done").length, "Confirmed in fake ledger"]]),
    operations.length ? operations.map(operationCard) : empty("No business operations", "Open a refund case to prepare a proposal from the customer's owned synthetic bookings. A transaction grant and customer consent are separate steps.")];
}

function requestsView() {
  const form = el("form", { onsubmit: async (event) => {
    event.preventDefault(); if (busy) return;
    const data = new FormData(form), body = { requestId: form.dataset.requestId, bookingId: data.get("bookingId"), question: data.get("question") };
    busy = true; form.setAttribute("aria-busy", "true");
    const submit = form.querySelector('button[type="submit"]'); submit.disabled = true; submit.textContent = "Preparing your answer…";
    const status = form.querySelector('[role="status"]'); status.textContent = "Reading your booking and preparing an answer for the help desk.";
    try { await api("questions", body); busy = false; await load(); notice("Your question is with the help desk. A reply will appear in your inbox after delivery is approved."); }
    catch (error) { status.textContent = `Unable to prepare the answer: ${error.message}. Your question is still here; you can retry.`; }
    finally { busy = false; form.setAttribute("aria-busy", "false"); submit.disabled = false; submit.textContent = "Ask about this booking"; }
  } }, field("Your booking", select("bookingId", bookings.map((b) => [b.id, `${b.id} · ${readable(b.status)}`]))), field("Your question", el("textarea", { name: "question", rows: "3", maxlength: "8000", required: true })), el("p", { role: "status", class: "small muted" }), el("button", { type: "submit", disabled: !bookings.length }, "Ask about this booking"));
  form.dataset.requestId = crypto.randomUUID();
  form.addEventListener("input", () => { if (!busy) form.dataset.requestId = crypto.randomUUID(); });
  return [panel("Ask about your booking", el("p", { class: "small muted" }, "The help desk can quote a refund using your current booking. Asking a question does not cancel it."), form),
    ...customerRequests.map((request) => panel(`Question about ${request.bookingId}`, el("p", {}, request.question), pill(request.delivered ? "Reply in your inbox" : "Awaiting help-desk delivery", request.delivered ? "" : "warn"), el("p", { class: "small muted" }, date(request.at)))),
    heading("Review your exact proposal.", "Confirm only the synthetic cancellation and amount you want. Expired proposals need fresh consent and review. No real payment service is connected."),
    operations.length ? operations.map(operationCard) : empty("No proposals to review", "An operator can prepare a cancellation proposal for your owned synthetic booking. It will appear here before execution.")];
}

function costPanel(c) {
  const known = c.costs.map((cost) => el("p", { class: "small" }, `${readable(cost.kind)}: ${new Intl.NumberFormat(undefined, { style: "currency", currency: cost.currency }).format(cost.amountMinor / 100)} · ${cost.basis} · ${cost.source}`));
  const remaining = ["model", "review", "execution", "rework", "harm"].filter((kind) => !c.costs.some((cost) => cost.kind === kind));
  const form = el("form", { onsubmit: (event) => {
    event.preventDefault(); const data = new FormData(form), raw = String(data.get("amount"));
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return notice("Enter a non-negative amount with up to two decimal places.");
    const [whole, fraction = ""] = raw.split("."), amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(amountMinor)) return notice("The amount is too large.");
    mutate(`cases/${c.id}/cost`, { kind: data.get("kind"), amountMinor, currency: "EUR", basis: data.get("basis"), source: data.get("source") });
  } }, field("Cost component", select("kind", remaining.map((kind) => [kind, readable(kind)]))), field("Amount (EUR)", input("amount", "", { inputmode: "decimal", required: true })), field("Evidence basis", select("basis", [["measured", "Measured"], ["estimate", "Owner estimate"]])), field("Evidence source reference", input("source", "", { required: true, pattern: "[A-Za-z0-9][A-Za-z0-9._:-]{0,127}" })), el("button", { type: "submit", class: "secondary" }, "Record cost"));
  return panel("Cost evidence", el("p", { class: "small muted" }, "Unrecorded costs stay unknown. Estimates do not become measured totals."), known, remaining.length ? el("details", {}, el("summary", {}, "Add a measured cost or estimate"), form) : null);
}

function qualificationsView() {
  return [heading("Why this release may qualify.", "Each package binds the application, policy, knowledge, model identity and evaluation evidence. Passing evidence is separate from approval and activation."),
    qualifications.length ? qualifications.map(({ package: p, assessment: a, currentReleaseUnavailable }) => panel(`${p.intent} · ${implementation(p.digest)} · ${p.model.name}`, el("div", { class: "actions" }, pill(a.evidencePassed ? "measurement passed" : "measurement incomplete", a.evidencePassed ? "" : "warn"), pill(p.provenance.kind, "warn"), pill(a.approval)),
      metadata([["Created", date(p.createdAt)], ["Declared ceiling", p.coverage.maximumTier], ["Actions", p.coverage.actions.join(", ")], ["Current release", currentReleaseUnavailable ? "Unavailable; not verified" : a.applicable ? "Matches the evaluated release" : "Changed or not verified"], ["Model revision", p.model.immutableRevision ?? "Unknown / mutable"], ["Package identity", el("span", { class: "mono" }, p.digest)]]),
      el("ul", { class: "plain" }, a.issues.map((issue) => el("li", {}, readable(issue)))), el("ul", { class: "plain" }, a.limitations.map((limit) => el("li", {}, limit))), button("Review a synthetic grant", () => navigate("authority"), "secondary", !roles("reviewer")), details("Bound artifact and evaluation identities", p))) : empty("No qualification packages", "Run an experiment to capture a package. Missing components remain visible.")];
}

function authorityView() {
  const options = qualifications.map(({ package: p }) => [p.digest, `${p.intent} · ${implementation(p.digest)} · ${p.digest.slice(0, 10)}`]);
  const form = el("form", { onsubmit: (event) => {
    event.preventDefault(); const data = new FormData(form);
    const maximum = minorInput(String(data.get("maximum")));
    if (maximum === null) return notice("Enter a non-negative limit with up to two decimal places.");
    mutate("grants/approve", { packageDigest: data.get("packageDigest"), tier: data.get("tier"), limits: { actions: String(data.get("actions")).split(/[,\s]+/).filter(Boolean), maxAmountMinor: maximum, currency: "EUR" }, expiresAt: new Date(String(data.get("expiresAt"))).toISOString(), acceptsMutableModel: data.get("acceptsMutableModel") === "on" });
  } }, field("Qualified application package", select("packageDigest", options)), el("div", { class: "field-grid" }, field("Permitted autonomy", select("tier", [["shadow", "Shadow · observe only"], ["assist", "Assist · reviewed answer"], ["contain", "Contain · answer delivery"], ["transact", "Transact · synthetic testing"]])), field("Expires at", input("expiresAt", localTime(24 * 3600000), { type: "datetime-local", required: true }))), field("Allowed action names", input("actions", "deliver-answer", { required: true })), field("Maximum per operation (EUR)", input("maximum", "0.00", { inputmode: "decimal", required: true })), el("label", { class: "check-label" }, input("acceptsMutableModel", "on", { type: "checkbox" }), "I accept that the provider model revision may be unknown or mutable."), el("p", { class: "small muted" }, "Only synthetic channels, bookings and ledger entries are affected. Use cancel-refund for the executor. A quote qualification cannot grant production transactions. Saving approval does not activate it."), el("button", { type: "submit" }, "Record explicit approval"));
  const grants = authority.grants.map((g) => {
    const revoked = authority.revoked.includes(g.id), expired = Date.parse(g.expiresAt) <= Date.now();
    const assessment = qualifications.find((q) => q.package.digest === g.packageDigest)?.assessment;
    const releaseValid = assessment?.integrity && assessment?.applicable && assessment?.evidencePassed;
    const active = Object.values(authority.active).includes(g.id) && !revoked && !expired && releaseValid;
    return panel(`${g.intent} · ${implementation(g.packageDigest)} · ${g.tier}`, pill(revoked ? "revoked" : expired ? "expired" : !releaseValid ? "release needs requalification" : active ? "active" : "approved, not active", revoked || expired || !releaseValid ? "warn" : ""), metadata([["Reviewer", g.reviewer], ["Expires", date(g.expiresAt)], ["Actions", g.limits.actions.join(", ")], ["Per-operation limit", money(g.limits.maxAmountMinor, g.limits.currency)], ["Fallback", "Human operator"], ["Scope", g.scope], ["Grant identity", el("span", { class: "mono" }, g.id)]]), el("div", { class: "actions" }, button("Activate grant", () => mutate("grants/activate", { grantId: g.id }), "secondary", active || revoked || expired || !releaseValid || !roles("deployer")), button("Revoke grant", () => mutate("grants/revoke", { grantId: g.id, reason: "operator_restricted" }), "danger", revoked || !roles("reviewer"))));
  });
  return [heading("Permission is an explicit decision.", "Review the evidence, grant a narrow capability, then activate it separately. Expiry, revocation and release changes stop new covered actions."), el("div", { class: "grid" }, el("div", {}, button("Review monitoring and fallback", () => navigate("monitoring")), el("p", { class: "small muted" }, "Activation requires a current monitoring plan and declared fallback capacity."), grants.length ? grants : empty("No authority granted", "Passing experiments have not created any permissions.")), panel("Review a synthetic grant", options.length && roles("reviewer") ? form : el("p", { class: "small muted" }, options.length ? "Your session cannot approve grants." : "An application experiment must produce a qualification package first.")))];
}

function intentsView() {
  return [heading("Authority by kind of work.", "The application declares its intent. A request header cannot grant customer delivery or transaction permission."), ...[...new Set(cases.map((c) => c.intent))].sort().map((intent) => {
    const rows = cases.filter((c) => c.intent === intent), active = authority.grants.filter((g) => g.intent === intent && Object.values(authority.active).includes(g.id) && !authority.revoked.includes(g.id) && Date.parse(g.expiresAt) > Date.now() && qualifications.some((q) => q.package.digest === g.packageDigest && q.assessment.integrity && q.assessment.applicable && q.assessment.evidencePassed));
    return panel(intent, metadata([["Cases", rows.length], ["Implementations", [...new Set(rows.map((c) => c.origin.target))].join(", ")], ["Active authority", active.length ? active.map((g) => g.tier).join(", ") : "No active grant"], ["Human fallback", "Owned handoff in Exceptions"]]), button("Inspect evidence", () => navigate("qualifications")), button("Review monitoring and fallback", () => navigate("monitoring")));
  }), !cases.length ? empty("No intents observed", "Retained application cases establish the intent list.") : null];
}
function monitoringIncidentCard(incident) {
  const form = el("form", { onsubmit: (event) => { event.preventDefault(); mutate(`monitoring/incidents/${incident.id}/restrict`, { rationale: new FormData(form).get("rationale") }); } },
    field("Reason for this routing restriction", el("textarea", { name: "rationale", rows: "2", required: true, maxlength: "2000", ...(incident.restriction ? { readonly: "true" } : {}) }, incident.restriction?.rationale ?? "")), el("button", { type: "submit", class: "danger" }, incident.restriction ? "Retry reviewed restriction" : "Review and restrict this grant"));
  const candidates = qualifications.filter((q) => q.package.intent === incident.intent && q.package.digest !== incident.packageDigest && q.assessment.integrity && q.assessment.applicable && q.assessment.evidencePassed);
  const recovery = el("form", { onsubmit: (event) => { event.preventDefault(); const data = new FormData(recovery); mutate(`monitoring/incidents/${incident.id}/recover`, { packageDigest: data.get("packageDigest"), rationale: data.get("rationale") }); } },
    field("Fresh evaluated release", select("packageDigest", candidates.map((q) => [q.package.digest, `${implementation(q.package.digest)} · ${q.package.digest.slice(0, 12)} · ${date(q.package.createdAt)}`]))),
    field("Recovery review", el("textarea", { name: "rationale", rows: "2", required: true, maxlength: "2000" })), el("p", { class: "small muted" }, "The report must have run after the latest signal. Quality incidents also need a successful independently reviewed regression rerun. Recovery does not activate a grant."), el("button", { type: "submit", disabled: !candidates.length }, "Record reviewed recovery"));
  return panel(`${readable(incident.signal.replaceAll("-", " "))} · ${incident.intent}`, pill(incident.status, incident.status === "recovered" ? "" : "warn"),
    metadata([["Owner", incident.owner], ["Respond by", date(incident.dueAt)], ["Latest signal", date(incident.latestSignalAt)], ["Distinct cases", new Set(incident.evidence.map((e) => e.caseId).filter(Boolean)).size], ["Affected grant", incident.grantId], ["Safe destination", `${incident.fallback.destination} · ${incident.fallback.owner}`]]),
    el("div", { class: "actions" }, [...new Set(incident.evidence.map((e) => e.caseId).filter(Boolean))].map((id) => button(`Case ${id.slice(0, 8)}`, () => navigate("cases", id)))),
    details("Signal, source and release evidence", incident),
    roles("reviewer") && ["open", "restriction-pending"].includes(incident.status) ? form : null,
    roles("reviewer") && incident.status === "restricted" ? candidates.length ? recovery : el("p", { class: "small muted" }, "Run and retain fresh evaluation evidence before reviewing recovery.") : null,
    incident.status === "recovered" ? button("Review separate activation", () => navigate("authority")) : null);
}

function monitoringView() {
  const safetySignals = ["grant-expired", "release-changed", "plan-expired", "fallback-overload"];
  const form = el("form", { onsubmit: (event) => {
    event.preventDefault(); const data = new FormData(form);
    mutate("monitoring/plans", { intent: data.get("intent"), expiresAt: new Date(String(data.get("expiresAt"))).toISOString(), windowMs: Number(data.get("windowHours")) * 3600000,
      owner: data.get("owner"), responseMinutes: Number(data.get("responseMinutes")), thresholds: Object.fromEntries(monitoring.signals.map((signal) => [signal, safetySignals.includes(signal) ? 1 : Number(data.get(signal))])),
      fallback: { destination: "human", owner: data.get("fallbackOwner"), capacityPerHour: Number(data.get("capacityPerHour")), maxPendingCases: Number(data.get("maxPendingCases")), basis: "synthetic", evidence: data.get("evidence") } });
  } }, field("Intent", input("intent", "refund", { required: true, pattern: "[A-Za-z0-9][A-Za-z0-9._:-]{0,127}" })),
    el("div", { class: "field-grid" }, field("Plan expires", input("expiresAt", localTime(48 * 3600000), { type: "datetime-local", required: true })), field("Observation window (hours)", input("windowHours", "24", { type: "number", min: "1", max: "720", required: true }))),
    el("div", { class: "field-grid" }, field("Incident owner", input("owner", "quality-ops", { required: true })), field("Response deadline (minutes)", input("responseMinutes", "60", { type: "number", min: "1", required: true }))),
    el("div", { class: "field-grid" }, monitoring.signals.filter((signal) => !safetySignals.includes(signal)).map((signal) => field(`${readable(signal.replaceAll("-", " "))} · distinct cases`, input(signal, ["human-regression", "evaluation-failure", "execution-exception"].includes(signal) ? "1" : "5", { type: "number", min: "1", required: true })))),
    el("p", { class: "small muted" }, "Expired grants, changed releases, expired plans and overloaded fallback each alert on their first observation. Thresholds create alerts, not automatic restrictions."),
    field("Human fallback owner", input("fallbackOwner", "support-ops", { required: true })),
    el("div", { class: "field-grid" }, field("Declared capacity (cases/hour)", input("capacityPerHour", "10", { type: "number", min: "1", required: true })), field("Maximum pending cases", input("maxPendingCases", "10", { type: "number", min: "1", required: true }))),
    field("Capacity evidence or drill reference", el("textarea", { name: "evidence", rows: "2", required: true, maxlength: "2000" })),
    el("p", { class: "small muted" }, "This local workspace records synthetic capacity declarations. It does not measure real staffing. Plan expiry must cover the grants you activate."), el("button", { type: "submit" }, "Record reviewed monitoring plan"));
  const activePlans = monitoring.plans.filter((plan) => Object.values(monitoring.active).includes(plan.id));
  const plans = activePlans.map((plan) => panel(`${plan.intent} · ${plan.scope}`, pill(Date.parse(plan.expiresAt) <= Date.now() ? "expired" : "current", Date.parse(plan.expiresAt) <= Date.now() ? "warn" : ""),
    metadata([["Reviewer", plan.reviewer], ["Expires", date(plan.expiresAt)], ["Owner", plan.owner], ["Human fallback", plan.fallback.owner], ["Declared capacity", `${plan.fallback.capacityPerHour} cases/hour`], ["Maximum pending", plan.fallback.maxPendingCases]]), details("Thresholds and fallback evidence", plan)));
  return [heading("Signals become owned decisions.", `Last scan: ${date(monitoring.lastScannedAt)}. Counts describe this retained sample, not population quality. Restrictions and recovery require separate review.`),
    ...plans, !plans.length ? empty("Monitoring plan required", "Record a plan, fallback owner and capacity evidence before activating an intent.") : null,
    ...monitoring.incidents.map(monitoringIncidentCard), roles("reviewer") ? panel("Review an expiring monitoring plan", el("details", {}, el("summary", {}, "Set signal thresholds and fallback capacity"), form)) : null];
}

function exceptionsView() {
  const rows = cases.filter((c) => (c.escalation && c.escalation.status !== "resolved") || c.delivery.state === "held" || c.outcome.state === "disputed");
  const uncertain = operations.filter((op) => ["dispatching", "unknown"].includes(op.status));
  return [heading("A clear next step, and an owner.", "Review held delivery, failed evaluations, customer disputes and unresolved handoffs. Partial business actions require read-back and explicit resolution."), caseRows(rows), ...monitoring.incidents.filter((i) => i.status !== "recovered").map(monitoringIncidentCard), ...uncertain.map(operationCard)];
}
function economicsPanel() {
  const form = el("form", { onsubmit: async (event) => {
    event.preventDefault(); if (busy) return;
    let dataset; try { dataset = JSON.parse(new FormData(event.currentTarget).get("dataset")); } catch { notice("The paired dataset must be valid JSON."); return; }
    busy = true;
    try { economicsResult = await api("economics/analyze", { dataset }); render(); notice("Analysis complete. Source and sampling claims remain operator attestations; no authority changed."); }
    catch (error) { notice(error.message); } finally { busy = false; }
  } }, field("Paired human and candidate dataset (JSON)", el("textarea", { name: "dataset", rows: "7", required: true, placeholder: "Paste a version 1 paired dataset with intent traffic weights, independent source families and all measured cost components." })),
  el("p", { class: "small muted" }, "The dataset is analyzed locally and is not retained by this endpoint. Use sanitized source references. See docs/casework-economics.md for the schema and synthetic sample."), el("button", { type: "submit" }, "Analyze paired economics"));
  const loadSample = button("Load synthetic example", async () => {
    try { const response = await fetch("/economics.sample.json", { signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error("Synthetic example unavailable"); form.querySelector('[name="dataset"]').value = pretty(await response.json()); notice("Synthetic development estimates loaded. These cannot support a production ranking."); }
    catch (error) { notice(error.message); }
  });
  const result = economicsResult;
  return panel("Human baseline and total handling cost", el("p", {}, "Compare model, review, execution, rework, classification loss and downstream harm. Risk-selected incidents and development repeats cannot estimate production prevalence."), loadSample, form,
    result ? metadata([["Comparison", result.comparisonSupported ? "Complete attested comparison" : "Unavailable or provisional"], ["Human mean", result.weighted.humanMeanMinor === null ? "Unknown" : money(result.weighted.humanMeanMinor, result.currency)], ["Candidate mean", result.weighted.candidateMeanMinor === null ? "Unknown" : money(result.weighted.candidateMeanMinor, result.currency)], ["Lower observed cost", result.weighted.lowerObservedCost ?? "No supported ranking"], ["Representative pairs", result.provenance.representativeRandomPairs], ["Diagnostic pairs", result.provenance.diagnosticPairs]]) : null,
    result ? details("Coverage, severe-outcome limits and uncertainty", { reasons: result.reasons, weighted: result.weighted, slices: result.slices, note: result.note }) : null,
    result ? details("Development and risk-selected diagnostics", result.diagnostics) : null);
}
function outcomesView() {
  const o = insights.overall;
  const groups = Object.entries(insights.byImplementation);
  return [heading("Resolution beyond the model response.", "Track observed resolution, repeat contacts and the cost of review, execution, rework and harm. Development fixtures do not estimate customer population rates."), stats([[o.resolved, "Recorded as resolved"], [o.reopened, "Cases reopened"], [o.escalations, "Open handoffs"], [o.measuredCostCoverage === null ? "Unknown" : `${Math.round(o.measuredCostCoverage * 100)}%`, "Complete measured cost coverage"]]),
    panel("Observed application outcomes", el("div", { class: "scroll" }, el("table", {}, el("thead", {}, el("tr", {}, ["Implementation", "Cases", "Resolved", "Reopened", "Measured cost per complete case"].map((s) => el("th", { scope: "col" }, s)))), el("tbody", {}, groups.map(([name, value]) => el("tr", {}, el("td", {}, name === "human" ? "Human baseline" : name), el("td", {}, value.cases), el("td", {}, value.resolved), el("td", {}, value.reopened), el("td", {}, value.meanMeasuredCostMinor === null ? "Unknown" : new Intl.NumberFormat(undefined, { style: "currency", currency: value.meanCostCurrency }).format(value.meanMeasuredCostMinor / 100))))))), el("p", { class: "small muted" }, insights.note)),
    economicsPanel(),
    panel("Measurement limits", el("ul", { class: "plain" }, el("li", {}, "Synthetic development cases; no production reliability or causal advantage is claimed."), el("li", {}, "Missing model or human-work costs stay unknown. Owner estimates are not measured cost."), el("li", {}, "A recorded resolution is not a gold label. Independent review remains separate.")), details("Per-intent measurements and coverage", insights.byIntent))];
}
function learningView() {
  const labelers = learningIdentities.filter((p) => p.roles.includes("labeler")).map((p) => [p.id, p.id]);
  const adjudicators = learningIdentities.filter((p) => p.roles.includes("adjudicator")).map((p) => [p.id, p.id]);
  const form = el("form", { class: "form-grid", onsubmit: async (event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    let context; try { context = JSON.parse(data.get("facts")); } catch { notice("Source facts must be valid JSON."); return; }
    await mutate(`cases/${data.get("caseId")}/learning`, { rubric: { id: data.get("rubricId"), revision: data.get("revision"), text: data.get("rubricText") }, assigned: [data.get("first"), data.get("second")], adjudicator: data.get("third"), context });
  } },
  field("Retained answer", select("caseId", cases.map((c) => [c.id, `${c.intent} · ${c.question.slice(0, 100)} · ${c.id.slice(0, 8)}`]))),
  field("Rubric ID", input("rubricId", "answer-correct", { required: true })), field("Rubric revision", input("revision", "v1", { required: true })),
  field("Independent rubric", el("textarea", { name: "rubricText", required: true, rows: "3", placeholder: "Describe correctness using source facts. Do not copy the model score or expected test result." })),
  field("Source facts (JSON, attested by you)", el("textarea", { name: "facts", required: true, rows: "4" }, "{}")),
  field("First labeler", select("first", labelers)), field("Second labeler", select("second", labelers)), field("Third-person adjudicator", select("third", adjudicators)),
  el("button", { type: "submit", disabled: !cases.length || labelers.length < 2 || !adjudicators.length }, "Assign blind review"));
  const secondSelect = form.querySelector('[name="second"]'); if (secondSelect.options.length > 1) secondSelect.selectedIndex = 1;
  const tasks = learning.map((task) => {
    const judge = el("form", { class: "form-grid", onsubmit: async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      await mutate(`learning/${task.id}/judge`, { name: data.get("judge"), revision: data.get("revision"), value: data.get("value") === "true", source: data.get("source") });
    } }, field("Judge identity", input("judge", "", { required: true })), field("Immutable judge revision", input("revision", "", { required: true })), field("Frozen verdict", select("value", [["true", "Meets rubric"], ["false", "Fails rubric"]])), field("Evidence reference", input("source", "", { required: true })), el("button", { type: "submit" }, "Freeze judge result"));
    const regressionForm = task.published && task.caseId ? el("form", { class: "form-grid", onsubmit: async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      let assertions; try { assertions = JSON.parse(data.get("assertions")); } catch { notice("Expectations must be a JSON assertion array."); return; }
      await mutate(`learning/${task.id}/regression`, { assertions, reviewer: data.get("reviewer") });
    } }, field("Independent regression assertions (JSON)", el("textarea", { name: "assertions", rows: "5", required: true, placeholder: '[{"id":"expected-fact","type":"contains","value":"verified fact","severity":"critical"}]' })), field("Expectation reviewer", select("reviewer", labelers)), el("button", { type: "submit" }, "Propose reviewed regression")) : null;
    return panel(`${task.intent} · ${task.state}`, metadata([["Task", task.id], ["Rubric", `${task.rubric.id} / ${task.rubric.revision}`], ["Source", `${task.source.kind} · ${task.source.split}`], ["Human labels", `${task.submitted}/2 locked`], ["Reviewers", task.assigned.join(", ")], ["Adjudicator", task.adjudicator]]),
      details("Review provenance", { snapshotDigest: task.snapshotDigest, source: task.source, rubric: task.rubric }),
      task.judgeRecorded ? el("p", {}, "Judge result frozen; verdict hidden from reviewers.") : task.published ? el("p", {}, "Gold published; no new judge may be fitted.") : judge,
      button(task.published ? "Inspect published gold" : "Publish resolved gold", async () => {
        try { const result = await api(`learning/${task.id}/publish`, {}); await load(); notice(`Human gold: ${result.gold ? "meets rubric" : "fails rubric"}. Evidence digest: ${result.digest}. No authority was granted.`); } catch (error) { notice(error.message); }
      }, "secondary", task.state !== "resolved"), regressionForm);
  });
  return [heading("Independent labels before confidence.", "Operational approval is separate from correctness. Assign two blind reviews and a third adjudicator. Retained experiments stay development evidence."),
    panel("Assign an observed answer", el("p", {}, "The task binds the actual answer and retained SOP documents. Supply the booking facts and business clock needed for independent review. Evaluator scores, target identity and expected assertions are excluded."), form),
    ...regressions.map((regression) => panel("Reviewed regression", metadata([["ID", regression.id], ["Original case", regression.source.caseId], ["Expectation review", regression.review ? regression.review.approved ? "Approved" : "Rejected" : "Pending"], ["Runs", regression.runs.length]]), details("Immutable fixture and expectations", regression.suite),
      button("Rerun JavaScript · fake provider", () => runRegression(regression.id, "ai-audit"), "secondary", !regression.review?.approved),
      button("Rerun audited Python · fake provider", () => runRegression(regression.id, "python-audit"), "secondary", !regression.review?.approved),
      button("Rerun Python · fake provider", () => runRegression(regression.id, "python"), "secondary", !regression.review?.approved),
      ...regression.runs.map((run) => el("div", { class: "row" }, pill(run.passed ? "passed" : "failed", run.passed ? "" : "warn"), el("p", {}, `${run.target} · ${date(run.at)}`), button("Inspect new case", () => navigate("cases", run.caseIds[0])))))),
    tasks.length ? tasks : empty("No review tasks yet", "Reviewers receive only their assigned evidence through the separate URLs printed by the server."),
    panel("Calibration boundary", el("p", {}, "These development tasks cannot qualify a production judge. Independent held-out sample imports and exact-rubric calibration export are available through the operator API. Source ownership and sampling remain explicit operator attestations."))];
}
function inboxView() {
  return [heading("Your CityWheels inbox.", "Only answers explicitly delivered to your synthetic customer account appear here."), inbox.length ? inbox.map((message) => panel("Help-desk response", el("p", { class: "answer" }, message.answer), el("p", { class: "small muted" }, `${date(message.at)} · Case ${message.caseId.slice(0, 8)}`))) : empty("No delivered messages", "An application answer is not sent automatically. The operator must satisfy the active delivery policy first.")];
}

function render() {
  if (!session) return;
  if (session.customer) { if (!["inbox", "requests"].includes(section)) section = "inbox"; document.body.classList.add("customer"); }
  if (!Object.hasOwn(labels, section)) section = "cases";
  $("identity").textContent = session.customer ? `${session.customer.tenant} · Customer ${session.customer.customer}` : `${session.operator.tenant} · ${session.operator.id} · ${session.operator.roles.join(", ")}`;
  $("section-label").textContent = labels[section].toUpperCase();
  const nav = $("navigation"); nav.replaceChildren();
  for (const name of session.customer ? ["inbox", "requests"] : ["cases", "intents", "qualifications", "authority", "execution", "monitoring", "exceptions", "outcomes", "learning"]) {
    const node = button(labels[name], () => navigate(name), "");
    if (name === section) node.setAttribute("aria-current", "page");
    nav.append(node);
  }
  const link = "/#token=" + encodeURIComponent(token);
  $("home-link").href = session.experiments ? link : "/casework#token=" + encodeURIComponent(token);
  $("experiment-link").href = link; $("experiment-link").hidden = !session.experiments;
  const views = { cases: casesView, intents: intentsView, qualifications: qualificationsView, authority: authorityView, execution: executionView, exceptions: exceptionsView, monitoring: monitoringView, outcomes: outcomesView, learning: learningView, inbox: inboxView, requests: requestsView };
  $("view").replaceChildren(...views[section]().flat(Infinity).filter(Boolean));
  $("view").setAttribute("aria-busy", "false");
}
async function runRegression(id, target) {
  if (busy) return;
  busy = true; notice("Executing the actual application with a fake provider…");
  try {
    const response = await fetch("/api/run", { method: "POST", signal: AbortSignal.timeout(210000), headers: { "x-workbench-token": token, "content-type": "application/json" }, body: JSON.stringify({ regressionId: id, target, mode: "fake" }) });
    const text = await response.text();
    if (!response.ok) throw new Error(readable(JSON.parse(text).error));
    const events = text.trim().split("\n").map(JSON.parse), complete = events.find((e) => e.type === "complete");
    if (!complete) throw new Error(events.find((e) => e.type === "error")?.error ?? "No completed application execution was retained.");
    await load(); notice(`Application rerun ${complete.manifest.status}. The original case and its authority remain unchanged.`);
  } catch (error) { notice(error.message); }
  finally { busy = false; }
}
async function load() {
  $("refresh").disabled = true;
  try {
    session ??= await api("session");
    if (session.customer) [inbox, operations, bookings, customerRequests] = await Promise.all([api("inbox"), api("operations"), api("bookings"), api("requests")]);
    else [cases, qualifications, authority, insights, operations, bookings, learning, learningIdentities, regressions, monitoring] = await Promise.all([api("cases"), api("qualifications"), api("authority"), api("insights"), api("operations"), api("bookings"), api("learning"), api("learning/identities"), api("regressions"), api("monitoring/scan", {})]);
    render();
  } catch (error) { notice(error.message); $("view").replaceChildren(empty("Workspace unavailable", "Open the complete local URL printed by the server, including its token fragment. Your session determines the available cases and actions.")); $("view").setAttribute("aria-busy", "false"); }
  finally { $("refresh").disabled = false; }
}
$("refresh").onclick = () => { notice(); load(); };
document.querySelector(".skip").onclick = (event) => { event.preventDefault(); $("view").focus(); };
window.onpopstate = () => { const query = new URLSearchParams(location.search); section = query.get("view") ?? "cases"; selected = query.get("case"); render(); };
load();
