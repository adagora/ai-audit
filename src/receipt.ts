import { renderQuinelingBody } from "./quinelingSvg.js";
import { AuditLog, type Rec } from "./audit.js";
import { policyHistories, withChanges, type PolicyChange } from "./policies.js";
import { verifyDecision, type AnchorStatus, type QdlTraceStep } from "./qdl.js";

export interface ReceiptStep { stepId: string; op: string; value: unknown }
export interface ReceiptRegion { regionId: string; stepId: string }
export interface ReceiptFact { name: string; value: unknown; basis?: string }
export interface DecisionReceipt {
  decisionId: string;
  llm: {
    id?: string;
    linked: boolean;
    findings: { rule: string; path: string }[];
    tools: { where: string; op: string; status?: string; errorCode?: string }[];
    retained: string;
  };
  inputs: { recorded: ReceiptFact[]; assertions: ReceiptFact[]; basisNote: string };
  policy: {
    sourceHash?: string;
    name?: string;
    registry?: string;
    registryDigest?: string;
    version?: number;
    current?: boolean;
    changes: PolicyChange[] | null;
    changeNote: string;
  };
  calculation: { steps: ReceiptStep[]; final: unknown; reasons: string[] };
  review: { state: "pending" | "automated" | "explicit"; reviewer?: string; verdict?: string; note?: string; simulated: string[] };
  verification: {
    ok: boolean;
    replay: { reproduced: boolean; status?: string; reason?: string };
    chain: { ok: boolean; badLine?: number; reason?: string };
    consistency: { ok: boolean; reason?: string };
    anchor: AnchorStatus;
  };
  regions: ReceiptRegion[];
  body?: string;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const sim = (v: unknown) => v && typeof v === "object" && ((v as any).status === "simulated" || (v as any).status === "skipped") ? v as { status: string; action?: string } : undefined;

function mainRecord(recs: Rec[], id: string): Rec | undefined {
  const direct = recs.find((r) => r.kind === "decision" && r.id === id && !r.qdl);
  if (direct) return direct;
  const companion = recs.find((r) => r.id === id && r.qdl);
  return companion?.refId ? recs.find((r) => r.id === companion.refId && !r.qdl) : undefined;
}


async function programView(recs: Rec[], sourceHash?: string) {
  const empty = { payload: undefined as any, body: undefined as string | undefined, nodeIds: [] as string[], registry: undefined as string | undefined, registryDigest: undefined as string | undefined };
  const m = await import("@quinelings/agent-sdk/v1").catch(() => null);
  if (!m) return empty;
  const s = new m.Session();
  const described = s.describe();
  const view = { ...empty, registry: described.registry as string, registryDigest: described.registryDigest as string };
  const source = recs.find((r) => r.kind === "program" && r.id === sourceHash)?.source
    ?? recs.map((r) => r.qdl as any).find((q) => q && q.sourceHash === sourceHash && typeof q.source === "string")?.source;
  if (typeof source !== "string" || !sourceHash) return view;
  try {
    const artifact = s.recover({ source });
    if (artifact.id !== sourceHash) return view;
    view.payload = artifact.payload;
    if (artifact.payload?.registry) view.registry = artifact.payload.registry;
    if (artifact.payload?.registryDigest) view.registryDigest = artifact.payload.registryDigest;
    const frame = s.frame(artifact.id, 0.25);
    view.nodeIds = [...frame.nodeIds];
    view.body = renderQuinelingBody(frame);
  } catch { return view; }
  return view;
}

function changeNote(version: number | undefined, changes: PolicyChange[] | null | undefined): string {
  if (version === 1 || version === undefined && changes == null) return version === 1 ? "First version in this use case." : "No version was derived.";
  if (changes == null) return "Changes from the previous version are unknown because a program record is missing.";
  if (!changes.length) return "No difference in name, thought, outputs, or nodes.";
  return changes.map((c) => `${c.path}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join("; ");
}

export async function decisionReceipt(log: AuditLog, id: string, opts?: { anchorsPath?: string }): Promise<DecisionReceipt> {
  const recs = log.read();
  const main = mainRecord(recs, id);
  const decisionId = main?.id ?? id;
  const companion = recs.find((r) => r.qdl && r.refId === decisionId);
  const q = companion?.qdl as any;
  const check = await verifyDecision(log, decisionId, opts);
  const steps: ReceiptStep[] = (check.replay.trace ?? []).map((t: QdlTraceStep) => ({ stepId: t.nodeId, op: t.op, value: t.value }));
  const price = steps.find((s) => s.stepId === "price")?.value;
  const outputs = main?.output;
  const final = price !== undefined ? price : Array.isArray(outputs) ? outputs[0] : outputs;
  const reasons = steps.flatMap((s) => {
    const action = sim(s.value);
    const out: string[] = [];
    if (s.stepId === "matches" && s.value === false) out.push("price does not equal the proposed amount");
    if (action) out.push(`${action.action ?? s.stepId} is a simulated action and was not sent`);
    return out;
  });
  const view = await programView(recs, typeof q?.sourceHash === "string" ? q.sourceHash : undefined);
  const observations: any[] = view.payload?.thought?.observations ?? [];
  const recorded = q?.inputs && typeof q.inputs === "object" ? Object.entries(q.inputs as Record<string, unknown>).map(([name, value]): ReceiptFact => {
    const obs = observations.find((o) => o.input === name);
    return { name, value, ...(obs?.basis && { basis: String(obs.basis) }) };
  }) : [];
  const assertions = main?.params && typeof main.params === "object" ? Object.entries(main.params).map(([name, value]) => ({ name, value })) : [];
  const basisNote = recorded.some((f) => f.basis) ? "Observation basis is text in the program. It is not a new measurement." : "The program text records no observation basis.";
  let histories = policyHistories(recs);
  try { histories = await withChanges(histories, recs); } catch { histories = policyHistories(recs); }
  const history = histories.find((h) => h.systemId === main?.systemId && h.useCase === main?.useCase);
  const version = history?.versions.find((v) => v.sourceHash === q?.sourceHash);
  const versionChanges: PolicyChange[] | null = version?.version === 1 ? [] : (version && "changes" in version ? (version.changes ?? null) : null);
  const call = main?.llmCallId ? recs.find((r) => r.kind === "llm-call" && r.id === main.llmCallId) : undefined;
  const findings = ((call as any)?.decision?.findings ?? []).filter((f: any) => f && typeof f.rule === "string").map((f: any) => ({ rule: f.rule, path: String(f.path ?? "") }));
  const tools = ((call as any)?.quinelings ?? []).map((e: any) => ({ where: String(e.where), op: String(e.op), ...(e.status && { status: String(e.status) }), ...(e.error?.code && { errorCode: String(e.error.code) }) }));
  const retained = [
    call ? "The request body was not stored. Inspection kept rule ids and paths." : "No llm-call record is linked.",
    main?.redactedInput ? "A redacted decision input was stored." : main?.inputHash ? "The raw decision input was not stored. Its hash was kept." : "No decision input hash was stored.",
    call?.content === "redacted" ? "A redacted response copy was stored." : "Response content was not stored.",
  ].join(" ");
  const reviewRec = [...recs].reverse().find((r) => r.kind === "review" && r.refId === decisionId);
  const review = reviewRec?.review;
  const simulated = steps.flatMap((s) => { const action = sim(s.value); return action ? [`${action.action ?? s.stepId} (${action.status})`] : []; });
  const state: DecisionReceipt["review"]["state"] = review ? "explicit" : simulated.length || steps.some((s) => s.op === "compare" || s.op === "compareValues") ? "automated" : "pending";
  const stepIds = new Set(steps.map((s) => s.stepId));
  const regionIds = view.nodeIds.filter((nodeId) => stepIds.has(nodeId));
  const regions = (regionIds.length ? regionIds : [...stepIds]).map((regionId) => ({ regionId, stepId: regionId }));
  return {
    decisionId,
    llm: { ...(call && { id: call.id }), linked: Boolean(call), findings, tools, retained },
    inputs: { recorded, assertions, basisNote },
    policy: {
      ...(q?.sourceHash && { sourceHash: q.sourceHash }), ...(version?.name || view.payload?.name ? { name: version?.name ?? view.payload?.name } : {}),
      ...(view.registry && { registry: view.registry }), ...(view.registryDigest && { registryDigest: view.registryDigest }),
      ...(version && { version: version.version, current: version.current }),
      changes: version?.version === 1 ? [] : versionChanges, changeNote: changeNote(version?.version, version?.version === 1 ? [] : versionChanges),
    },
    calculation: { steps, final, reasons },
    review: { state, ...(review && { reviewer: review.reviewer, verdict: review.decision, ...(review.note && { note: review.note }) }), simulated },
    verification: {
      ok: check.ok,
      replay: { reproduced: check.replay.reproduced, ...(check.replay.status && { status: check.replay.status }), ...(check.replay.reason && { reason: check.replay.reason }) },
      chain: check.chain, consistency: check.consistency, anchor: check.anchor,
    },
    regions, ...(view.body && { body: view.body }),
  };
}

export function stepForRegion(receipt: DecisionReceipt, regionId: string): ReceiptStep | undefined {
  const region = receipt.regions.find((r) => r.regionId === regionId);
  return region ? receipt.calculation.steps.find((s) => s.stepId === region.stepId) : undefined;
}

const stateText = { pending: "pending", automated: "automated check", explicit: "explicit human decision" };

export function renderReceipt(receipt: DecisionReceipt, sharing?: { json: string; svg: string } | { reason: string }): string {
  const row = (cells: unknown[]) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
  const steps = receipt.calculation.steps.map((s) => {
    const label = `${s.stepId} = ${typeof s.value === "string" ? s.value : JSON.stringify(s.value)}`;
    return `<tr data-step-row="${esc(s.stepId)}" data-step-label="${esc(label)}"><td>${esc(s.stepId)}</td><td>${esc(s.op)}</td><td>${esc(typeof s.value === "string" ? s.value : JSON.stringify(s.value))}</td></tr>`;
  }).join("");
  const facts = receipt.inputs.recorded.map((f) => row([f.name, typeof f.value === "string" ? f.value : JSON.stringify(f.value), f.basis ?? ""])).join("");
  const assertions = receipt.inputs.assertions.map((f) => row([f.name, typeof f.value === "string" ? f.value : JSON.stringify(f.value)])).join("");
  const findings = receipt.llm.findings.map((f) => row([f.rule, f.path])).join("");
  const tools = receipt.llm.tools.map((t) => row([t.where, t.op, t.status ?? "", t.errorCode ?? ""])).join("");
  const regions = receipt.regions.map((r) => `<button type="button" data-step="${esc(r.regionId)}">${esc(r.stepId)}</button>`).join("");
  const reviewNote = receipt.review.state === "explicit" ? " The reviewer name is not an identity check." : "";
  const simulated = receipt.review.simulated.length ? `<p>${esc(receipt.review.simulated.join(", "))}. A simulated action was not sent.</p>` : "";
  const downloads = sharing && "json" in sharing
    ? `<section class="share"><h2>Share this calculation</h2><p>The downloads include exact policy source, inputs and outputs. Review these values before sharing. They omit prompts, responses, reviewer names and notes. This full HTML report may contain review details and caller assertions.</p><p><a download="decision.svg" href="data:image/svg+xml;base64,${Buffer.from(sharing.svg).toString("base64")}">Download SVG with replay data</a> <a download="decision.json" href="data:application/json;charset=utf-8,${encodeURIComponent(sharing.json)}">Download replay JSON</a></p><p>Recipient check: <code>ai-audit verify-receipt --input decision.svg</code>. This checks the calculation and SVG presentation, not the author's identity or human approval.</p></section>`
    : sharing ? `<section class="share"><h2>Share this calculation</h2><p>Replay export unavailable: ${esc(sharing.reason)}. This diagnostic report can still be saved.</p></section>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Decision receipt ${esc(receipt.decisionId)}</title>
<style>
  body { margin: 0; font: 16px/1.45 ui-sans-serif, system-ui, sans-serif; background: #f4f1ea; color: #1c1915; }
  main { max-width: 960px; margin: 0 auto; padding: 28px 20px 64px; }
  h1 { font-size: 1.7rem; margin: 0 0 8px; }
  h2 { font-size: 1.15rem; margin: 28px 0 8px; }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  th, td { border: 1px solid #ddd6c8; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #efeae0; }
  p.note, #selected-step { background: #fff; border: 1px solid #ddd6c8; padding: 12px 14px; }
  #selected-step { font-size: 1.35rem; min-height: 1.4em; }
  figure { margin: 12px 0; background: #10141c; }
  svg { width: 100%; height: auto; display: block; }
  .regions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px; }
  button, path[data-step] { cursor: pointer; }
  button { background: #fff; border: 1px solid #ddd6c8; padding: 6px 10px; font: inherit; }
  [data-selected="true"] { outline: 2px solid #1c1915; }
  code { font-family: ui-monospace, monospace; font-size: 0.86rem; word-break: break-all; }
  td, th { overflow-wrap: anywhere; }
  .share { border: 1px solid #cbbfa9; padding: 0 16px 12px; margin-top: 24px; background: #fff; }
  a { color: #174c81; }
  .share a { display: inline-block; padding: 10px 12px; border: 1px solid #174c81; margin: 4px 8px 4px 0; }
  button:focus-visible, a:focus-visible { outline: 3px solid #174c81; outline-offset: 3px; }
  g[data-step][data-selected="true"] { fill-opacity: 1; stroke: #fff; stroke-width: 0.7px; }
  @media print { body { background: white; } main { max-width: none; padding: 0; } .regions, .share a { display: none; } table, figure { break-inside: avoid; } }
</style>
</head>
<body>
<main>
  <h1>Decision receipt</h1>
  <p class="note">Decision <code>${esc(receipt.decisionId)}</code>. This page is a view of the log. Choosing a region selects the calculation step. The page does not run the program.</p>
  ${downloads}
  <h2>LLM call</h2>
  <p>${receipt.llm.linked ? `Linked call <code>${esc(receipt.llm.id)}</code>.` : "No linked call."} llmCallId links the call. It does not prove those inputs were extracted from the call.</p>
  <table><tr><th>Rule</th><th>Path</th></tr>${findings || row(["none", ""])}</table>
  <h3>Tool-name observations</h3>
  <table><tr><th>Where</th><th>Op</th><th>Status</th><th>Error code</th></tr>${tools || row(["none", "", "", ""])}</table>
  <p>${esc(receipt.llm.retained)}</p>
  <h2>Input snapshot</h2>
  <p>${esc(receipt.inputs.basisNote)} Recorded inputs are the values stored on the QDL step. Caller assertions are params supplied beside the decision. Tool-name observations stay on the LLM call.</p>
  <h3>Recorded inputs</h3>
  <table><tr><th>Name</th><th>Value</th><th>Basis</th></tr>${facts || row(["none", "", ""])}</table>
  <h3>Caller assertions</h3>
  <table><tr><th>Name</th><th>Value</th></tr>${assertions || row(["none", ""])}</table>
  <h2>Policy</h2>
  <p>Source hash is the program identity. A similar body is a different program.</p>
  <table>
    <tr><th>Source hash</th><td><code>${esc(receipt.policy.sourceHash ?? "none")}</code></td></tr>
    <tr><th>Name</th><td>${esc(receipt.policy.name ?? "")}</td></tr>
    <tr><th>Runtime pin</th><td>${esc(receipt.policy.registry ?? "unavailable")} ${esc(receipt.policy.registryDigest ?? "")}</td></tr>
    <tr><th>Version</th><td>${esc(receipt.policy.version ?? "")}${receipt.policy.current ? " current in the full log" : ""}</td></tr>
    <tr><th>Changes from the previous version</th><td>${esc(receipt.policy.changeNote)}</td></tr>
  </table>
  <h2>Calculation</h2>
  <p id="selected-step" aria-live="polite"></p>
  <table><tr><th>Step</th><th>Op</th><th>Value</th></tr>${steps || row(["none", "", ""])}</table>
  <p>Result: ${esc(typeof receipt.calculation.final === "string" ? receipt.calculation.final : JSON.stringify(receipt.calculation.final))}</p>
  <p>Reasons for review: ${esc(receipt.calculation.reasons.join("; ") || "none")}</p>
  ${receipt.body ? `<figure>${receipt.body}</figure>` : ""}
  <div class="regions">${regions}</div>
  <h2>Review</h2>
  <p>State: ${esc(stateText[receipt.review.state])}.${esc(reviewNote)}</p>
  <table>
    <tr><th>Reviewer</th><td>${esc(receipt.review.reviewer ?? "")}</td></tr>
    <tr><th>Verdict</th><td>${esc(receipt.review.verdict ?? "")}</td></tr>
    <tr><th>Note</th><td>${esc(receipt.review.note ?? "")}</td></tr>
  </table>
  ${simulated}
  <h2>Verification</h2>
  <p>Overall success requires the chain, the link to the QDL record, and output consistency together. Replay and anchor status stay separate. Anchor status is ${esc(receipt.verification.anchor)}.</p>
  <table>
    <tr><th>Replay</th><td>${esc(receipt.verification.replay.reproduced)}${receipt.verification.replay.status ? ` ${esc(receipt.verification.replay.status)}` : ""}${receipt.verification.replay.reason ? ` ${esc(receipt.verification.replay.reason)}` : ""}</td></tr>
    <tr><th>Chain</th><td>${receipt.verification.chain.ok ? "ok" : esc(receipt.verification.chain.reason ?? "not ok")}</td></tr>
    <tr><th>Record consistency</th><td>${receipt.verification.consistency.ok ? "ok" : esc(receipt.verification.consistency.reason ?? "not ok")}</td></tr>
    <tr><th>Anchor status</th><td>${esc(receipt.verification.anchor)}</td></tr>
    <tr><th>Overall</th><td>${receipt.verification.ok ? "success" : "not success"}</td></tr>
  </table>
</main>
<script>
(function () {
  function label(id) {
    var row = Array.from(document.querySelectorAll('[data-step-row]')).find(function (item) { return item.getAttribute('data-step-row') === id; });
    return row ? row.getAttribute("data-step-label") : id;
  }
  function select(id) {
    var shown = document.getElementById("selected-step");
    if (shown) shown.textContent = label(id);
    var nodes = document.querySelectorAll("[data-step]");
    for (var i = 0; i < nodes.length; i++) nodes[i].setAttribute("data-selected", nodes[i].getAttribute("data-step") === id ? "true" : "false");
  }
  var nodes = document.querySelectorAll("[data-step]");
  for (var i = 0; i < nodes.length; i++) nodes[i].addEventListener("click", function (event) { select(event.currentTarget.getAttribute("data-step")); });
  if (window.document && nodes.length) select(nodes[0].getAttribute("data-step"));
})();
</script>
</body>
</html>`;
}
