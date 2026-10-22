import { AuditLog, sha256, type Entry, type Rec } from "./audit.js";

export type QdlStatus = "completed" | "refused" | "failed";
export interface QdlFault { code: string; path: string; nodeId?: string }
export interface QdlStep {
  status?: QdlStatus; inputs: Record<string, unknown>;
  sourceHash?: string; source?: string; intent?: unknown; intentHash?: string;
  inputHash?: string; outputsHash?: string; error?: QdlFault;
}
export type QdlRec = Rec & { qdl: QdlStep };
export interface Program { intent?: unknown; source?: string }
interface Outcome { status: QdlStatus; outputs?: unknown[]; inputHash?: string; error?: QdlFault }

const canon = (o: unknown) => JSON.stringify(o, (_k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v);
const fault = (e: any): QdlFault => ({ code: String(e?.code ?? "failed"), path: String(e?.path ?? "$"), ...(e?.nodeId != null && { nodeId: String(e.nodeId) }) });
const sameFault = (a?: QdlFault, b?: QdlFault) => a?.code === b?.code && a?.path === b?.path;

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

export async function recordQdl(log: AuditLog, e: Omit<Entry, "output" | "step">, prog: Program, inputs: Record<string, unknown>): Promise<{ decision: Rec; step: QdlRec }> {
  const { s, refusal } = await session();
  let artifact: any, outcome: Outcome | undefined;
  try { artifact = prog.source !== undefined ? s.recover({ source: prog.source }) : s.compile(prog.intent as any); }
  catch (err) { if (!refusal(err)) throw err; outcome = { status: "refused", error: fault(err) }; }
  outcome ??= evaluate(s, refusal, artifact, inputs, "record");
  const program = artifact ? { sourceHash: artifact.id, source: artifact.source }
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
  const { s, refusal } = await session();
  let artifact: any, outcome: Outcome | undefined;
  if (q.sourceHash !== undefined) {
    try { artifact = s.recover({ source: q.source ?? "" }); } catch (e) { throw Object.assign(new Error("audit_qdl_source_invalid"), { code: (e as any)?.code }); }
    if (artifact.id !== q.sourceHash) throw new Error("audit_qdl_source_mismatch");
  } else {
    if (q.intent !== undefined && q.intentHash !== sha256(canon(q.intent))) throw new Error("audit_qdl_intent_mismatch");
    try { artifact = q.source !== undefined ? s.recover({ source: q.source }) : s.compile(q.intent as any); }
    catch (e) { if (!refusal(e)) throw e; outcome = { status: "refused", error: fault(e) }; }
  }
  outcome ??= evaluate(s, refusal, artifact, q.inputs, "replay");
  const reproduced = outcome.status === logged && (logged === "completed"
    ? sha256(canon(outcome.outputs)) === q.outputsHash && outcome.inputHash === q.inputHash
    : logged === "failed" ? outcome.inputHash === q.inputHash && sameFault(outcome.error, q.error) : sameFault(outcome.error, q.error));
  return { decision: r.refId!, status: outcome.status, reproduced, output: outcome.outputs, error: outcome.error, inputHash: outcome.inputHash, sourceHash: artifact?.id as string | undefined };
}
