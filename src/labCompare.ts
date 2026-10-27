import { readEvidenceRecords } from "./evidence.js";
import { AuditLog, canon } from "./audit.js";
import { governorIntent, governorSnapshots, SNAPSHOT_VERSION, type TurnSnapshot } from "./lab.js";
import type { Session } from "@quinelings/agent-sdk/v1";

interface ComparedPolicy { limit: number; sourceHash: string; source: string }
interface Recommendation { action: "continue" | "pause"; reason: string; hypothetical: boolean; output: unknown }
export interface ComparisonRow {
  observation: number;
  recordHash: string;
  snapshot: TurnSnapshot;
  inputs: { failures: number };
  baseline: Recommendation;
  candidate: Recommendation;
  disagrees: boolean;
}
export interface SessionComparison {
  format: "ai-audit-policy-comparison";
  version: 1;
  snapshotVersion: string;
  sessionId: string;
  evidence: { logDigest: string; records: number; head: string; chain: "verified"; replay: "reproduced"; anchors: "not-checked" };
  runtime: { registry: string; registryDigest: string };
  policies: { baseline: ComparedPolicy; candidate: ComparedPolicy };
  summary: { calls: number; disagreements: number; unknownUsage: number; firstDisagreement?: string };
  rows: ComparisonRow[];
}

function evaluate(session: Session, policy: ComparedPolicy, inputs: { failures: number }, requestId: string): unknown[] {
  const run = session.run({ artifactId: policy.sourceHash, requestId, inputs });
  const output = run.result.occurrences?.[0]?.outputs;
  if (run.result.status !== "completed" || !Array.isArray(output) || typeof output[0] !== "boolean") throw new Error("audit_lab_evaluation_failed");
  return output;
}

export async function compareSession(log: AuditLog, opts: { sessionId?: string; baselineLimit: number; candidateLimit: number }): Promise<SessionComparison> {
  const baselineIntent = governorIntent(opts.baselineLimit), candidateIntent = governorIntent(opts.candidateLimit);
  const { records, digest } = readEvidenceRecords(log);
  const snapshots = governorSnapshots(records);
  const sessions = new Set(snapshots.map((s) => s.sessionId));
  if (!opts.sessionId && sessions.size > 1) throw new Error("audit_lab_session_required");
  const sessionId = opts.sessionId ?? sessions.values().next().value;
  const selected = snapshots.filter((s) => s.sessionId === sessionId);
  if (!sessionId || !selected.length) throw new Error("audit_lab_session_not_found");
  const calls = records.filter((r) => r.kind === "llm-call");
  const byId = new Map(calls.map((r) => [r.id, r]));
  if (byId.size !== calls.length) throw new Error("audit_lab_duplicate_call");
  const m = await import("@quinelings/agent-sdk/v1").catch(() => { throw new Error("audit_qdl_unavailable"); });
  const session = new m.Session(), recovered = new m.Session();
  const compile = (intent: ReturnType<typeof governorIntent>, limit: number): ComparedPolicy => {
    const artifact = session.compile(intent);
    if (recovered.recover({ source: artifact.source }).id !== artifact.id) throw new Error("audit_lab_replay_failed");
    return { limit, sourceHash: artifact.id, source: artifact.source };
  };
  const policies = { baseline: compile(baselineIntent, opts.baselineLimit), candidate: compile(candidateIntent, opts.candidateLimit) };
  const stopped = { baseline: false, candidate: false };
  const rows = selected.map((snapshot, i): ComparisonRow => {
    const inputs = { failures: snapshot.failures };
    const run = (name: "baseline" | "candidate"): Recommendation => {
      const policy = policies[name], requestId = `${name}-${i}`;
      const output = evaluate(session, policy, inputs, requestId);
      if (canon(output) !== canon(evaluate(recovered, policy, inputs, requestId))) throw new Error("audit_lab_replay_failed");
      const action = output[0] ? "pause" : "continue";
      const hypothetical = stopped[name];
      if (action === "pause") stopped[name] = true;
      return { action, reason: `${snapshot.failures} cumulative failed calls; limit ${policy.limit}`, hypothetical, output };
    };
    const baseline = run("baseline"), candidate = run("candidate");
    return { observation: i + 1, recordHash: byId.get(snapshot.callId)!.hash, snapshot, inputs, baseline, candidate, disagrees: baseline.action !== candidate.action };
  });
  const described = session.describe();
  const first = rows.find((r) => r.disagrees);
  return {
    format: "ai-audit-policy-comparison", version: 1, snapshotVersion: SNAPSHOT_VERSION, sessionId,
    evidence: { logDigest: digest, records: records.length, head: records.at(-1)!.hash, chain: "verified", replay: "reproduced", anchors: "not-checked" },
    runtime: { registry: described.registry, registryDigest: described.registryDigest }, policies,
    summary: { calls: rows.length, disagreements: rows.filter((r) => r.disagrees).length, unknownUsage: rows.filter((r) => r.snapshot.reported === undefined).length, ...(first && { firstDisagreement: first.snapshot.callId }) },
    rows,
  };
}

export function renderComparison(report: SessionComparison): string {
  const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const outcome = (r: Recommendation) => `${esc(r.action)}${r.hypothetical ? " (hypothetical)" : ""}<br><small>${esc(r.reason)}</small>`;
  const first = report.rows.find((r) => r.disagrees);
  const rows = report.rows.map((r) => `<tr${r.disagrees ? ' class="changed"' : ""}><td>${r.observation}</td><td>${esc(r.snapshot.turn)}<br><code>${esc(r.snapshot.callId)}</code></td><td>${r.snapshot.failures}</td><td>${r.snapshot.retries} / ${r.snapshot.branches}</td><td>${r.snapshot.reported === undefined ? "unknown" : esc(r.snapshot.reported)}</td><td>${outcome(r.baseline)}</td><td>${outcome(r.candidate)}</td><td>${r.disagrees ? "Changed" : "Same"}</td></tr>`).join("");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Session policy comparison</title>
<style>body{margin:0;background:#f4f1ea;color:#1c1915;font:16px/1.5 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:24px}h1{font-size:1.8rem}table{width:100%;border-collapse:collapse;background:white}th,td{border:1px solid #d6cdbd;padding:10px;text-align:left;vertical-align:top}.scroll{overflow-x:auto}.changed{background:#fff0cd}code{overflow-wrap:anywhere}small{font-size:.85rem}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#174c81}</style></head>
<body><main><h1>Session policy comparison</h1>
<p>Session <code>${esc(report.sessionId)}</code>. Baseline pauses at ${report.policies.baseline.limit} failed calls; candidate pauses at ${report.policies.candidate.limit}.</p>
<p>${report.summary.calls} calls evaluated, ${report.summary.disagreements} changed recommendations, ${report.summary.unknownUsage} calls with unknown token usage.</p>
<p>${first ? `First disagreement: observation ${first.observation}, turn ${esc(first.snapshot.turn)}. Baseline: ${first.baseline.action}; candidate: ${first.candidate.action}.` : "Both policies recommend the same action on every recorded observation."}</p>
<p>Calls appear in audit append order. Failures are cumulative within the recorded session; retries and branches are observations, not extra failures. Token usage is per call and does not control this rule.</p>
<p>Every row evaluates recorded observations. Rows after a policy first recommends pausing are hypothetical under that policy. This report does not stop an agent or establish savings or task quality.</p>
<div class="scroll" role="region" aria-label="Policy comparison" tabindex="0"><table><thead><tr><th>Observation</th><th>Turn / call</th><th>Failed calls</th><th>Retries / branches</th><th>Reported tokens</th><th>Baseline</th><th>Candidate</th><th>Comparison</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Evidence</h2><p>Chain verified. Both programs reproduced their outputs after source recovery in a fresh SDK session. External anchors were not checked. Reproduction does not establish that the observations are true or that the policy is appropriate.</p>
<p>Snapshot rules: <code>${esc(report.snapshotVersion)}</code>. Log digest: <code>${esc(report.evidence.logDigest)}</code>. Log records: ${report.evidence.records}. Head: <code>${esc(report.evidence.head)}</code>.</p>
<p>Registry: <code>${esc(report.runtime.registry)}</code>; digest <code>${esc(report.runtime.registryDigest)}</code>.</p>
<details><summary>Programs, inputs and record references (JSON)</summary><pre>${esc(JSON.stringify(report, null, 2))}</pre></details>
</main></body></html>`;
}
