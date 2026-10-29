import type { AuditLog, Rec, Review } from "./audit.js";

export type Verdict = { state: Review["decision"]; review: string; reviewer: string; at: string; note?: string } | { state: "timeout" };
export interface ProposedAction { action: string; status: string }
export interface AwaitOptions { timeoutMs?: number; pollMs?: number; signal?: AbortSignal }

export const proposedActions = (output: unknown): ProposedAction[] => (Array.isArray(output) ? output : output && typeof output === "object" ? Object.values(output) : [])
  .filter((v): v is ProposedAction => !!v && typeof v === "object" && typeof (v as any).action === "string" && typeof (v as any).status === "string")
  .map((v) => ({ action: v.action, status: v.status }));

export function latestReview(records: readonly Rec[], decisionId: string, before = records.length): Rec | undefined {
  for (let i = Math.min(before, records.length) - 1; i >= 0; i--) if (records[i].kind === "review" && records[i].refId === decisionId && records[i].review) return records[i];
  return undefined;
}

const verdictOf = (r: Rec): Verdict => ({ state: r.review!.decision, review: r.id, reviewer: r.review!.reviewer, at: r.review!.at, ...(r.review!.note && { note: r.review!.note }) });

export async function awaitVerdict(log: AuditLog, decisionId: string, o: AwaitOptions = {}): Promise<Verdict> {
  if (!log.read().some((r) => r.kind === "decision" && r.id === decisionId && !r.qdl)) throw new Error("audit_unknown_decision");
  const deadline = Date.now() + (o.timeoutMs ?? 600_000), pollMs = o.pollMs ?? 1000;
  for (;;) {
    const found = latestReview(log.readRecent(), decisionId);
    if (found) return verdictOf(found);
    if (o.signal?.aborted || Date.now() >= deadline) return { state: "timeout" };
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.min(pollMs, deadline - Date.now()))));
  }
}

export function effectAuthorized(records: readonly Rec[], effectId: string): boolean {
  const at = records.findIndex((r) => r.kind === "effect" && r.id === effectId);
  const effect = records[at]?.effect;
  if (!effect || effect.status !== "done") return true;
  const decision = records.find((r) => r.kind === "decision" && r.id === records[at].refId && !r.qdl);
  const latest = latestReview(records, records[at].refId!, at);
  if (latest) return latest.review!.decision === "approved";
  return proposedActions(decision?.output).some((p) => p.action === effect.action && p.status === "simulated");
}
