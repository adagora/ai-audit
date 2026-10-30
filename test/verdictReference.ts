import type { Rec } from "../src/audit.js";
import { proposedActions } from "../src/verdict.js";

function latestReviewReference(records: readonly Rec[], decisionId: string, before = records.length): Rec | undefined {
  for (let i = Math.min(before, records.length) - 1; i >= 0; i--) if (records[i].kind === "review" && records[i].refId === decisionId && records[i].review) return records[i];
  return undefined;
}

export function effectAuthorizedReference(records: readonly Rec[], effectId: string): boolean {
  const at = records.findIndex((r) => r.kind === "effect" && r.id === effectId);
  const effect = records[at]?.effect;
  if (!effect || effect.status !== "done") return true;
  const decision = records.find((r) => r.kind === "decision" && r.id === records[at].refId && !r.qdl);
  const latest = latestReviewReference(records, records[at].refId!, at);
  if (latest) return latest.review!.decision === "approved";
  return proposedActions(decision?.output).some((p) => p.action === effect.action && p.status === "simulated");
}
