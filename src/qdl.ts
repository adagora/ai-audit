import { AuditLog, canon, sha256, type Entry, type Rec } from "./audit.js";
import { inspect, type Allowlist } from "./scan.js";

export type QdlStatus = "completed" | "refused" | "failed";
export interface QdlFault { code: string; path: string; nodeId?: string }
export interface QdlStep {
  status?: QdlStatus; inputs?: Record<string, unknown>;
  sourceHash?: string; source?: string; intent?: unknown; intentHash?: string;
  inputHash?: string; outputsHash?: string; error?: QdlFault; findings?: { rule: string; path: string }[];
}
export type QdlRec = Rec & { qdl: QdlStep };
export interface Program { intent?: unknown; source?: string }
interface Outcome { status: QdlStatus; outputs?: unknown[]; inputHash?: string; error?: QdlFault }

const fault = (e: any): QdlFault => ({ code: String(e?.code ?? "failed"), path: String(e?.path ?? "$"), ...(e?.nodeId != null && { nodeId: String(e.nodeId) }) });
const sameFault = (a?: QdlFault, b?: QdlFault) => a?.code === b?.code && a?.path === b?.path;

const storedPrograms = new WeakMap<AuditLog, Set<string>>();
function storeProgram(log: AuditLog, artifact: { id: string; source: string }) {
  let known = storedPrograms.get(log);
  if (!known) { known = new Set(log.read().filter((r) => r.kind === "program").map((r) => r.id)); storedPrograms.set(log, known); }
  if (known.has(artifact.id)) return;
  log.append({ kind: "program", id: artifact.id, ts: new Date().toISOString(), source: artifact.source });
  known.add(artifact.id);
}

async function session() {
  const m = await import("@quinelings/agent-sdk/v1").catch(() => { throw new Error("audit_qdl_unavailable"); });
  return { s: new m.Session(), refusal: (e: unknown) => e instanceof m.QdlError };
}

function evaluate(s: any, refusal: (e: unknown) => boolean, artifact: any, inputs: Record<string, unknown>, requestId: string): Outcome {
  let r: any;
  try { r = s.run({ artifactId: artifact.id, requestId, inputs }); }
  catch (e) { if (!refusal(e)) throw e; return { status: "refused", error: fault(e) }; }
  const occurrence = r.result.occurrences[0];
  return r.result.status === "completed" ? { status: "completed", outputs: occurrence.outputs, inputHash: r.result.inputHash }
    : { status: "failed", inputHash: r.result.inputHash, error: fault(occurrence?.diagnostic) };
}

export async function recordQdl(log: AuditLog, e: Omit<Entry, "output" | "step">, prog: Program, inputs: Record<string, unknown>, carnet?: Allowlist): Promise<{ decision: Rec; step: QdlRec }> {
  const { s, refusal } = await session();
  const findings = inspect({ inputs, program: prog.source ?? prog.intent, params: e.params, sources: e.sources, model: e.model, prompt: e.prompt?.templateId }, carnet).findings;
  if (findings.length) {
    const decision = log.record({ systemId: e.systemId, useCase: e.useCase, llmCallId: e.llmCallId, input: e.input, output: undefined });
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
  const decision = log.record({ ...e, output: outcome.outputs });
  const step = log.append({ kind: "decision", id: decision.id + ":qdl", ts: decision.ts, refId: decision.id,
    qdl: { status: outcome.status, ...program, inputs, inputHash: outcome.inputHash,
      outputsHash: outcome.outputs && sha256(canon(outcome.outputs)), error: outcome.error } }) as QdlRec;
  return { decision, step };
}

export async function replayQdl(log: AuditLog, id: string) {
  const recs = log.read();
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
    : logged === "failed" ? outcome.inputHash === q.inputHash && sameFault(outcome.error, q.error) : sameFault(outcome.error, q.error));
  return { decision: r.refId!, status: outcome.status, reproduced, output: outcome.outputs, error: outcome.error, inputHash: outcome.inputHash, sourceHash: artifact?.id as string | undefined };
}
