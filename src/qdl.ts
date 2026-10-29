import { existsSync, statSync } from "node:fs";
import { AuditLog, canon, decisionConsistency, sha256, verifyAnchors, type Entry, type Rec } from "./audit.js";
import { inspect, type Allowlist } from "./scan.js";

export type QdlStatus = "completed" | "refused" | "failed";
export interface QdlFault { code: string; path: string; nodeId?: string; occurrence?: number }
export interface QdlTraceStep { nodeId: string; op: string; value: unknown }
export interface QdlStep {
  status?: QdlStatus; inputs?: Record<string, unknown>;
  sourceHash?: string; source?: string; intent?: unknown; intentHash?: string;
  inputHash?: string; outputsHash?: string; error?: QdlFault; findings?: { rule: string; path: string }[];
}
export type QdlRec = Rec & { qdl: QdlStep };
export interface Program { intent?: unknown; source?: string }
interface Outcome { status: QdlStatus; outputs?: unknown[]; inputHash?: string; error?: QdlFault; trace?: QdlTraceStep[] }

const fault = (e: any): QdlFault => ({
  code: String(e?.code ?? "failed"), path: String(e?.path ?? "$"),
  ...(e?.nodeId != null && { nodeId: String(e.nodeId) }),
  ...(Number.isInteger(e?.occurrence) && { occurrence: e.occurrence }),
});
const sameFault = (logged?: QdlFault, fresh?: QdlFault) => logged?.code === fresh?.code && logged?.path === fresh?.path
  && (logged?.nodeId === undefined || logged.nodeId === fresh?.nodeId)
  && (logged?.occurrence === undefined || logged.occurrence === fresh?.occurrence);
const traceOf = (occurrence: any): QdlTraceStep[] => (Array.isArray(occurrence?.trace) ? occurrence.trace : [])
  .filter((t: any) => t && typeof t.nodeId === "string")
  .map((t: any) => ({ nodeId: t.nodeId, op: String(t.op ?? ""), value: t.value }));

const storedPrograms = new WeakMap<AuditLog, { file: string; ids: Set<string> }>();
const currentFile = (log: AuditLog) => { try { const s = statSync(log.path); return `${s.dev}:${s.ino}:${s.birthtimeMs}`; } catch { return ""; } };
function storeProgram(log: AuditLog, artifact: { id: string; source: string; payload?: { name?: unknown } }) {
  let known = storedPrograms.get(log);
  if (!known || known.file !== currentFile(log)) {
    known = { file: currentFile(log), ids: new Set(log.readCurrent().filter((r) => r.kind === "program").map((r) => r.id)) };
    storedPrograms.set(log, known);
  }
  if (known.ids.has(artifact.id)) return;
  const name = artifact.payload?.name;
  log.append({ kind: "program", id: artifact.id, ts: new Date().toISOString(), ...(typeof name === "string" && { name }), source: artifact.source });
  if (known.file !== currentFile(log)) storedPrograms.delete(log);
  else known.ids.add(artifact.id);
}

async function session() {
  const m = await import("@quinelings/agent-sdk/v1").catch(() => { throw new Error("audit_qdl_unavailable"); });
  return { s: new m.Session(), refusal: (e: unknown) => e instanceof m.QdlError };
}

function evaluate(s: any, refusal: (e: unknown) => boolean, artifact: any, inputs: Record<string, unknown>, requestId: string): Outcome {
  let r: any;
  try { r = s.run({ artifactId: artifact.id, requestId, inputs }); }
  catch (e) { if (!refusal(e)) throw e; return { status: "refused", error: fault(e) }; }
  const occurrences: any[] = r.result.occurrences ?? [];
  if (r.result.status === "completed") {
    const occurrence = occurrences[0];
    return { status: "completed", outputs: occurrence?.outputs, inputHash: r.result.inputHash, trace: traceOf(occurrence) };
  }
  const failed = occurrences.find((o) => o?.status === "failed") ?? occurrences[0];
  return { status: "failed", inputHash: r.result.inputHash, error: fault(failed?.diagnostic), trace: traceOf(failed) };
}

function retainedEntry(e: Omit<Entry, "output" | "step">, carnet?: Allowlist): Omit<Entry, "output" | "step"> {
  if (!e.storeRedactedInput || inspect(e.input, carnet).findings.length === 0) return e;
  return { ...e, storeRedactedInput: false };
}

export async function recordQdl(log: AuditLog, e: Omit<Entry, "output" | "step">, prog: Program, inputs: Record<string, unknown>, carnet?: Allowlist): Promise<{ decision: Rec; step: QdlRec }> {
  const entry = retainedEntry(e, carnet);
  const { s, refusal } = await session();
  const findings = inspect({ inputs, program: prog.source ?? prog.intent, params: entry.params, sources: entry.sources, model: entry.model, prompt: entry.prompt?.templateId }, carnet).findings;
  if (findings.length) {
    const decision = log.record({ systemId: entry.systemId, useCase: entry.useCase, llmCallId: entry.llmCallId, input: entry.input, output: undefined, qdlDecision: true });
    const step = log.append({ kind: "decision", id: decision.id + ":qdl", ts: decision.ts, refId: decision.id,
      qdl: { status: "refused", error: { code: "audit-sensitive-input", path: findings[0].path }, findings: findings.map((f) => ({ rule: f.rule, path: f.path })) } }) as QdlRec;
    return { decision, step };
  }
  let artifact: any, outcome: Outcome | undefined;
  try { artifact = prog.source !== undefined ? s.recover({ source: prog.source }) : s.compile(prog.intent as any); }
  catch (err) { if (!refusal(err)) throw err; outcome = { status: "refused", error: fault(err) }; }
  outcome ??= evaluate(s, refusal, artifact, inputs, "record");
  if (artifact) storeProgram(log, artifact);
  const program = artifact ? { sourceHash: artifact.id }
    : prog.source !== undefined ? { source: prog.source } : { intent: prog.intent, intentHash: sha256(canon(prog.intent)) };
  const decision = log.record({ ...entry, output: outcome.outputs, qdlDecision: true });
  const step = log.append({ kind: "decision", id: decision.id + ":qdl", ts: decision.ts, refId: decision.id,
    qdl: { status: outcome.status, ...program, inputs, inputHash: outcome.inputHash,
      outputsHash: outcome.outputs && sha256(canon(outcome.outputs)), error: outcome.error } }) as QdlRec;
  return { decision, step };
}

export async function replayQdl(log: AuditLog, id: string, recs: Rec[] = log.read()) {
  const r = (recs.find((x) => x.id === id && x.qdl) ?? recs.find((x) => x.refId === id && x.qdl)) as QdlRec | undefined;
  if (!r) throw new Error("audit_no_qdl_step");
  const q = r.qdl, logged = q.status ?? "completed";
  if (q.inputs === undefined) throw new Error("audit_qdl_not_replayable");
  const { s, refusal } = await session();
  let artifact: any, outcome: Outcome | undefined;
  if (q.sourceHash !== undefined) {
    const source = q.source ?? recs.find((x) => x.kind === "program" && x.id === q.sourceHash)?.source;
    if (typeof source !== "string") throw new Error("audit_qdl_source_missing");
    try { artifact = s.recover({ source }); } catch (e) { throw Object.assign(new Error("audit_qdl_source_invalid"), { code: (e as any)?.code }); }
    if (artifact.id !== q.sourceHash) throw new Error("audit_qdl_source_mismatch");
  } else {
    if (q.intent !== undefined && q.intentHash !== sha256(canon(q.intent))) throw new Error("audit_qdl_intent_mismatch");
    try { artifact = q.source !== undefined ? s.recover({ source: q.source }) : s.compile(q.intent as any); }
    catch (e) { if (!refusal(e)) throw e; outcome = { status: "refused", error: fault(e) }; }
  }
  outcome ??= evaluate(s, refusal, artifact, q.inputs!, "replay");
  const reproduced = outcome.status === logged && (logged === "completed"
    ? sha256(canon(outcome.outputs)) === q.outputsHash && outcome.inputHash === q.inputHash
    : logged === "failed" ? outcome.inputHash === q.inputHash && sameFault(q.error, outcome.error) : sameFault(q.error, outcome.error));
  return { decision: r.refId!, status: outcome.status, reproduced, output: outcome.outputs, error: outcome.error, inputHash: outcome.inputHash, sourceHash: artifact?.id as string | undefined, trace: outcome.trace };
}

export type AnchorStatus = "verified" | "failed" | "not-anchored";
export interface DecisionCheck {
  ok: boolean;
  replay: { reproduced: boolean; status?: QdlStatus; output?: unknown; error?: QdlFault; reason?: string; trace?: QdlTraceStep[] };
  chain: { ok: boolean; badLine?: number; reason?: string };
  consistency: { ok: boolean; reason?: string };
  anchor: AnchorStatus;
}

export async function verifyDecision(log: AuditLog, id: string, opts?: { anchorsPath?: string }): Promise<DecisionCheck> {
  const recs = log.read();
  const chain = log.verifyChain();
  const consistency = decisionConsistency(recs, id);
  let anchor: AnchorStatus = "not-anchored";
  if (opts?.anchorsPath && existsSync(opts.anchorsPath)) {
    const v = verifyAnchors(log, opts.anchorsPath);
    anchor = v.ok && v.anchors > 0 ? "verified" : v.ok ? "not-anchored" : "failed";
  }
  let replay: DecisionCheck["replay"];
  try {
    const r = await replayQdl(log, id, recs);
    replay = { reproduced: r.reproduced, status: r.status, output: r.output, ...(r.error && { error: r.error }), trace: r.trace };
  } catch (e) {
    replay = { reproduced: false, reason: e instanceof Error ? e.message : "audit_command_failed" };
  }
  return { ok: chain.ok && consistency.ok, replay, chain, consistency, anchor };
}
