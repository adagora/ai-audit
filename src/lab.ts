import { renderQuinelingBody } from "./quinelingSvg.js";
import { readEvidenceRecords } from "./evidence.js";
import type { Rec } from "./audit.js";
import { AuditLog, canon, decisionConsistency } from "./audit.js";
import { replayQdl, type QdlTraceStep } from "./qdl.js";
import type { Session } from "@quinelings/agent-sdk/v1";

export const SNAPSHOT_VERSION = "session-governor-v2";
export interface TurnSnapshot { callId: string; sessionId: string; turn: number; failures: number; retries: number; branches: number; reported?: number }
export interface Governed {
  snapshot: TurnSnapshot;
  strict: { decisionId: string; output: unknown; sourceHash: string };
  loose: { decisionId: string; output: unknown; sourceHash: string };
}
export interface LabStep { stepId: string; op: string; value: unknown; other?: unknown }
export interface LabView {
  callId: string;
  turn: number;
  inputs: { name: string; value: unknown }[];
  thresholds: { strict?: number; loose?: number };
  steps: LabStep[];
  outputs: { strict: unknown; loose: unknown };
  regions: { regionId: string; stepId: string }[];
  body?: string;
}

const SUCCESS_STOP = new Set(["stop", "tool_calls", "function_call", "completed", "end_turn", "tool_use", "stop_sequence", "pause_turn"]);
type Link = { id?: string; turn?: number; digest?: string; parent?: string | null };
type Usage = { input?: unknown; output?: unknown };

const linkOf = (call: Rec) => call.session as Link | undefined;
const usageOf = (call: Rec) => call.usage as Usage | undefined;

export function callFailed(call: Rec): boolean {
  const status = call.upstreamStatus;
  if (typeof status !== "number" || status < 200 || status >= 400) return true;
  const stop = call.stop;
  if (call.clientAborted === true && typeof stop !== "string") return true;
  return typeof stop === "string" && !SUCCESS_STOP.has(stop);
}

export function reportedTokens(call: Rec): number | undefined {
  const usage = usageOf(call);
  if (!usage || !Number.isSafeInteger(usage.input) || !Number.isSafeInteger(usage.output)) return undefined;
  const input = usage.input as number, output = usage.output as number;
  const total = input + output;
  return input >= 0 && output >= 0 && Number.isSafeInteger(total) ? total : undefined;
}

function relation(call: Rec, earlier: Rec[]): "" | "retry" | "branch" {
  const session = linkOf(call);
  if (!session?.digest) return "";
  if (earlier.some((other) => linkOf(other)?.digest === session.digest)) return "retry";
  if (session.parent !== undefined && session.turn !== undefined && earlier.some((other) => linkOf(other)?.parent === session.parent && linkOf(other)?.turn === session.turn)) return "branch";
  return "";
}

export function governorSnapshots(recs: Rec[]): TurnSnapshot[] {
  const calls = recs.filter((r) => r.kind === "llm-call" && typeof linkOf(r)?.id === "string");
  const groups = new Map<string, Rec[]>();
  for (const call of calls) {
    const id = linkOf(call)!.id as string;
    const list = groups.get(id);
    if (list) list.push(call); else groups.set(id, [call]);
  }
  const out: TurnSnapshot[] = [];
  for (const group of groups.values()) {
    let failures = 0, retries = 0, branches = 0;
    const seen: Rec[] = [];
    for (const call of group) {
      const rel = relation(call, seen);
      seen.push(call);
      if (callFailed(call)) failures += 1;
      if (rel === "retry") retries += 1;
      if (rel === "branch") branches += 1;
      const reported = reportedTokens(call);
      out.push({ callId: call.id, sessionId: linkOf(call)!.id!, turn: linkOf(call)?.turn ?? seen.length, failures, retries, branches, ...(reported !== undefined && { reported }) });
    }
  }
  return out;
}

export function governorIntent(limit: number): Parameters<Session["compile"]>[0] {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("audit_invalid_failure_limit");
  return {
    format: "qdl-intent", version: 1, name: "Session governor",
    thought: {
      observations: [], evidence: [], goals: [], decisions: [], plans: [],
      tasks: [{ id: "govern", text: "halt when cumulative failed calls reach the limit", nodes: ["failures", "limit", "reached", "halt", "pause"], outputs: ["halt", "pause"] }],
    },
    inputs: [
      { id: "failures", name: "failures", type: { kind: "number", unit: "one", min: 0 } },
      { id: "limit", value: limit, type: { kind: "number", unit: "one", min: 0 } },
    ],
    steps: [
      { id: "reached", op: "compareValues", inputs: ["failures", "limit"], params: { operator: "gte" } },
      { id: "halt", op: "compare", inputs: ["reached"], params: { operator: "eq", value: true } },
      { id: "pause", op: "action", inputs: ["halt", "failures"], params: { allowed: true, action: "pause-session" } },
    ],
    outputs: ["halt", "pause"],
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function firstDisagreement(rows: Governed[]): { agreed?: Governed; split: Governed } | undefined {
  const splitAt = rows.findIndex((row) => !same(row.strict.output, row.loose.output));
  if (splitAt < 0) return undefined;
  const agreed = rows.slice(0, splitAt).find((row) => same(row.strict.output, row.loose.output));
  return { agreed, split: rows[splitAt] };
}


const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const show = (v: unknown) => typeof v === "string" ? v : JSON.stringify(v);


async function creature(source: string, sourceHash: string): Promise<{ body?: string; nodeIds: string[] }> {
  const m = await import("@quinelings/agent-sdk/v1").catch(() => null);
  if (!m) return { nodeIds: [] };
  try {
    const s = new m.Session();
    const artifact = s.recover({ source });
    if (artifact.id !== sourceHash) return { nodeIds: [] };
    const frame = s.frame(artifact.id, 0.25);
    const body = renderQuinelingBody(frame);
    return { nodeIds: [...frame.nodeIds], ...(body && { body }) };
  } catch { return { nodeIds: [] }; }
}

function companion(recs: Rec[], id: string) {
  return recs.find((r) => r.qdl && r.refId === id);
}

export function stepForRegion(view: LabView, regionId: string): LabStep | undefined {
  const region = view.regions.find((r) => r.regionId === regionId);
  return region ? view.steps.find((s) => s.stepId === region.stepId) : undefined;
}

export async function labView(log: AuditLog, strictId: string, looseId: string): Promise<LabView> {
  const { records: recs } = readEvidenceRecords(log);
  const strictMain = recs.find((r) => r.id === strictId && r.kind === "decision" && !r.qdl);
  const looseMain = recs.find((r) => r.id === looseId && r.kind === "decision" && !r.qdl);
  const strictQ = companion(recs, strictId)?.qdl as { inputs?: Record<string, unknown>; sourceHash?: string } | undefined;
  const looseQ = companion(recs, looseId)?.qdl as { inputs?: Record<string, unknown>; sourceHash?: string } | undefined;
  if (!strictMain?.llmCallId || strictMain.llmCallId !== looseMain?.llmCallId
    || !recs.some((r) => r.kind === "llm-call" && r.id === strictMain.llmCallId)
    || !strictQ?.inputs || !looseQ?.inputs || canon(strictQ.inputs) !== canon(looseQ.inputs)) throw new Error("audit_lab_incomparable_decisions");
  if (!decisionConsistency(recs, strictId).ok || !decisionConsistency(recs, looseId).ok) throw new Error("audit_lab_inconsistent_decision");
  const strictReplay = await replayQdl(log, strictId, recs);
  const looseReplay = await replayQdl(log, looseId, recs);
  if (!strictReplay.reproduced || !looseReplay.reproduced || strictReplay.status !== "completed" || looseReplay.status !== "completed") throw new Error("audit_lab_replay_failed");
  const looseById = new Map((looseReplay.trace ?? []).map((step) => [step.nodeId, step.value]));
  const steps: LabStep[] = (strictReplay.trace ?? []).map((step: QdlTraceStep) => ({ stepId: step.nodeId, op: step.op, value: step.value, ...(looseById.has(step.nodeId) && { other: looseById.get(step.nodeId) }) }));
  const limit = (pick: "value" | "other") => { const found = steps.find((s) => s.stepId === "limit"); const value = found?.[pick]; return typeof value === "number" ? value : undefined; };
  const inputs = strictQ?.inputs && typeof strictQ.inputs === "object" ? Object.entries(strictQ.inputs).map(([name, value]) => ({ name, value })) : [];
  const drawn = typeof strictQ?.sourceHash === "string" ? await creature(String(recs.find((r) => r.kind === "program" && r.id === strictQ.sourceHash)?.source ?? ""), strictQ.sourceHash) : { nodeIds: [] as string[] };
  const stepIds = new Set(steps.map((s) => s.stepId));
  const regionIds = drawn.nodeIds.filter((id) => stepIds.has(id));
  const regions = (regionIds.length ? regionIds : [...stepIds]).map((regionId) => ({ regionId, stepId: regionId }));
  const callId = strictMain?.llmCallId ?? looseMain?.llmCallId ?? "";
  const turn = governorSnapshots(recs).find((s) => s.callId === callId)?.turn ?? 0;
  return {
    callId, turn, inputs, thresholds: { strict: limit("value"), loose: limit("other") }, steps,
    outputs: { strict: strictReplay.output, loose: looseReplay.output }, regions, ...(drawn.body && { body: drawn.body }),
  };
}

export function renderLab(view: LabView): string {
  const row = (cells: unknown[]) => `<tr>${cells.map((c) => `<td>${esc(show(c))}</td>`).join("")}</tr>`;
  const inputs = view.inputs.map((f) => row([f.name, f.value])).join("");
  const steps = view.steps.map((s) => {
    const label = `${s.stepId} = ${show(s.value)}`;
    return `<tr data-step-row="${esc(s.stepId)}" data-step-label="${esc(label)}"><td>${esc(s.stepId)}</td><td>${esc(s.op)}</td><td>${esc(show(s.value))}</td><td>${esc(show(s.other))}</td></tr>`;
  }).join("");
  const regions = view.regions.map((r) => `<button type="button" data-step="${esc(r.regionId)}">${esc(r.stepId)}</button>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Policy lab ${esc(view.callId)}</title>
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
</style>
</head>
<body>
<main>
  <h1>Policy lab</h1>
  <p class="note">Turn ${esc(view.turn)}, call <code>${esc(view.callId)}</code>. This page is a view of two recorded decisions. Choosing a region selects that calculation step. The page does not run the program.</p>
  <p>Chain and decision consistency checked. Both calculations reproduced from the same recorded inputs. External anchors were not checked.</p>
  <h2>Recorded inputs</h2>
  <table><tr><th>Name</th><th>Value</th></tr>${inputs || row(["none", ""])}</table>
  <h2>Threshold</h2>
  <table>
    <tr><th>Policy</th><th>Threshold</th></tr>
    <tr><td>Strict</td><td>${esc(view.thresholds.strict)}</td></tr>
    <tr><td>Loose</td><td>${esc(view.thresholds.loose)}</td></tr>
  </table>
  <h2>Calculation</h2>
  <p id="selected-step"></p>
  <table><tr><th>Step</th><th>Op</th><th>Strict</th><th>Loose</th></tr>${steps || row(["none", "", "", ""])}</table>
  <h2>Outputs</h2>
  <table>
    <tr><th>Policy</th><th>Output</th></tr>
    <tr><td>Strict</td><td>${esc(show(view.outputs.strict))}</td></tr>
    <tr><td>Loose</td><td>${esc(show(view.outputs.loose))}</td></tr>
  </table>
  <p>A simulated action was not sent.</p>
  <div class="regions">${regions}</div>
  ${view.body ? `<figure>${view.body}</figure>` : ""}
</main>
<script>
(function () {
  function label(id) {
    var row = document.querySelector('[data-step-row="' + id + '"]');
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
