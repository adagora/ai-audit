import { AuditLog, sha256, type Entry, type Rec } from "./audit.js";

const canon = (o: unknown) => JSON.stringify(o, (_k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v);
const sdk = () => import("@quinelings/agent-sdk/v1");
const outputs = (r: any) => {
  if (r.result.status !== "completed") throw new Error(`QDL run ${r.result.status}: ${JSON.stringify(r.result.occurrences?.[0]?.diagnostic)}`);
  return r.result.occurrences[0].outputs;
};

export async function recordQdl(log: AuditLog, e: Omit<Entry, "output" | "step">, prog: { intent?: unknown; source?: string }, inputs: Record<string, unknown>): Promise<Rec> {
  const { Session } = await sdk(); const s = new Session();
  const a = prog.source ? s.recover({ source: prog.source }) : s.compile(prog.intent as any);
  const run = s.run({ artifactId: a.id, requestId: "record", inputs: inputs as any }), out = outputs(run);
  const rec = log.record({ ...e, output: out });
  return log.append({ kind: "decision", id: rec.id + ":qdl", ts: rec.ts, refId: rec.id,
    qdl: { sourceHash: a.id, source: a.source, inputs, inputHash: run.result.inputHash, outputsHash: sha256(canon(out)) } } as any);
}

export async function replayQdl(log: AuditLog, recId: string) {
  const r = log.read().find((x) => x.id === recId) as any;
  if (!r?.qdl) throw new Error("no QDL step on record");
  const { Session } = await sdk(); const s = new Session();
  const a = s.recover({ source: r.qdl.source });
  if (a.id !== r.qdl.sourceHash) throw new Error("QDL source does not match logged sourceHash");
  const run = s.run({ artifactId: a.id, requestId: "replay", inputs: r.qdl.inputs });
  const out = outputs(run);
  return { output: out, reproduced: sha256(canon(out)) === r.qdl.outputsHash && run.result.inputHash === r.qdl.inputHash, inputHash: run.result.inputHash as string, sourceHash: a.id };
}
