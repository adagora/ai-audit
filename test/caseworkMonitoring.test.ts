import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync, unlinkSync } from "node:fs";
import { caseworkFixture } from "./caseworkFixture.js";
import { CaseworkStore } from "../src/casework.js";
import { CaseworkMonitoring, MONITORING_SIGNALS, type MonitoringPlanInput, type MonitoringSignal } from "../src/caseworkMonitoring.js";
import { evidenceDigest } from "../src/qualification.js";
import { CaseworkRegression } from "../src/caseworkRegression.js";

function fixture() {
  const base = caseworkFixture();
  const original = base.qualifications.load(base.request.packageDigest), { format, version, createdAt, digest, ...packageInput } = original;
  const targetRevision = evidenceDigest("monitoring-test-release");
  const originalReport = JSON.parse(base.qualifications.read(original.report).toString("utf8")); originalReport.target.revision = targetRevision;
  const qualified = base.qualifications.create({ ...packageInput, targetRevision, report: base.qualifications.put(JSON.stringify(originalReport)) }, base.now);
  const f = { ...base, current: { ...base.current, targetRevision }, request: { ...base.request, packageDigest: qualified.digest } };
  const scope = { tenant: f.actor.tenant, customer: "customer-a" };
  const monitor = new CaseworkMonitoring(join(f.root, "monitoring"), f.authority), cases = new CaseworkStore(join(f.root, "cases"), f.authority);
  const p = f.qualifications.load(f.request.packageDigest);
  const input = { scope, intent: "refund", qualificationDigest: p.digest, question: "What refund can I get?", answer: "340 EUR, calculation only.", origin: { runId: "run-1", scenarioId: "one", repetition: 0, target: "ai-audit" as const, targetRevision: p.targetRevision, evaluation: "pass" as const, reportDigest: p.report.digest, audit: { available: true, chainVerified: true, records: [] } } };
  const c = cases.ingest(input, f.now);
  const plan: MonitoringPlanInput = { intent: "refund", scope: "synthetic", expiresAt: new Date(f.now.getTime() + 7200000).toISOString(), windowMs: 3600000,
    thresholds: Object.fromEntries(MONITORING_SIGNALS.map((s) => [s, 1])) as Record<MonitoringSignal, number>, owner: "quality-ops", responseMinutes: 60,
    fallback: { destination: "human", owner: "support-ops", capacityPerHour: 10, maxPendingCases: 10, basis: "synthetic", evidence: "Synthetic test capacity declaration" } };
  const g = f.authority.approve(f.actor, { ...f.request, tier: "assist", limits: { ...f.request.limits, actions: ["deliver-answer"] } }, f.current, f.now);
  const sources = () => ({ cases: cases.list(f.actor), operations: [], failures: [] });
  const at = (seconds: number) => new Date(f.now.getTime() + seconds * 1000);
  const activate = () => { monitor.prepareActivation(f.actor, g, sources(), f.now); f.authority.activate(f.actor, g.id, f.current, f.now); monitor.recordActivation(f.actor, g, f.now); };
  return { ...f, p, monitor, cases, input, c, plan, g, sources, at, activate };
}

function freshPackage(f: ReturnType<typeof fixture>, seconds: number) {
  const { format, version, createdAt, digest, ...input } = f.p;
  const report = JSON.parse(f.qualifications.read(f.p.report).toString("utf8"));
  report.createdAt = f.at(seconds).toISOString();
  return f.qualifications.create({ ...input, report: f.qualifications.put(JSON.stringify(report)) }, f.at(seconds));
}

test("activation requires an expiring reviewed plan and declared human fallback capacity", () => {
  const f = fixture();
  assert.throws(() => f.activate(), /plan_required/);
  assert.throws(() => f.monitor.configure({ ...f.actor, roles: ["operator"] }, f.plan, f.now), /forbidden/);
  assert.throws(() => f.monitor.configure(f.actor, { ...f.plan, thresholds: {} as Record<MonitoringSignal, number> }, f.now), /invalid_plan/);
  assert.throws(() => f.monitor.configure(f.actor, { ...f.plan, scope: "production" }, f.now), /invalid_plan/);
  f.monitor.configure(f.actor, { ...f.plan, expiresAt: f.at(30).toISOString() }, f.now);
  assert.throws(() => f.activate(), /plan_expires_before_grant/);
  f.monitor.configure(f.actor, f.plan, f.now);
  f.activate();
  assert.equal(f.authority.authorize({ ...f.operation, action: "deliver-answer", amountMinor: 0 }, f.current, f.now).id, f.g.id);
  assert.throws(() => f.monitor.prepareActivation(f.actor, f.g, f.sources(), f.at(7200)), /plan_expired/);
});

test("signals count distinct cases, preserve event history, open owned alerts and never automatically revoke", () => {
  const f = fixture();
  f.monitor.configure(f.actor, { ...f.plan, thresholds: { ...f.plan.thresholds, "delivery-held": 2 } }, f.now); f.activate();
  f.cases.deliver(f.actor, f.c.id, f.current, f.at(1));
  f.cases.deliver(f.actor, f.c.id, f.current, f.at(2));
  assert.equal(f.monitor.scan(f.actor, f.sources(), () => f.current, f.at(3)).length, 0);
  const second = f.cases.ingest({ ...f.input, origin: { ...f.input.origin, runId: "run-2" } }, f.at(4));
  f.cases.deliver(f.actor, second.id, f.current, f.at(5));
  const incidents = f.monitor.scan(f.actor, f.sources(), () => f.current, f.at(6));
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].owner, "quality-ops");
  assert.equal(incidents[0].fallback.destination, "human");
  assert.equal(new Set(incidents[0].evidence.map((e) => e.caseId)).size, 2);
  assert.equal(f.authority.view(f.actor).revoked.length, 0);
  assert.deepEqual(f.monitor.scan(f.actor, f.sources(), () => f.current, f.at(7)), incidents);
  f.cases.outcome(f.actor, f.c.id, "resolved", "done", f.at(8));
  f.cases.outcome(f.actor, f.c.id, "reopened", "repeat_contact", f.at(9));
  f.cases.outcome(f.actor, f.c.id, "resolved", "done_again", f.at(10));
  assert.ok(f.monitor.scan(f.actor, f.sources(), () => f.current, f.at(11)).some((i) => i.signal === "reopened"));
  assert.equal(f.monitor.view(f.actor).lastScannedAt, f.at(11).toISOString());
  assert.deepEqual(f.monitor.view({ ...f.actor, tenant: "other" }).incidents, []);
});

test("release, expiry and fallback alerts deduplicate across scans and insufficient fallback prevents activation", () => {
  const f = fixture(); f.monitor.configure(f.actor, f.plan, f.now); f.activate();
  f.cases.escalate(f.actor, f.c.id, { owner: "support-ops", reason: "followup", summary: "Review synthetic case", dueAt: f.at(3600).toISOString() }, f.at(1));
  f.monitor.configure(f.actor, { ...f.plan, responseMinutes: 1, fallback: { ...f.plan.fallback, capacityPerHour: 1 } }, f.at(2));
  assert.throws(() => f.monitor.prepareActivation(f.actor, f.g, f.sources(), f.at(3)), /fallback_capacity_exceeded/);
  const first = f.monitor.scan(f.actor, f.sources(), () => ({ ...f.current, targetRevision: "changed" }), f.at(4));
  assert.deepEqual(first.map((i) => i.signal).sort(), ["fallback-overload", "release-changed"]);
  assert.deepEqual(f.monitor.scan(f.actor, f.sources(), () => ({ ...f.current, targetRevision: "changed" }), f.at(5)), first);
  const later = f.monitor.scan(f.actor, f.sources(), () => f.current, f.at(7200));
  assert.ok(later.some((i) => i.signal === "grant-expired"));
  assert.ok(later.some((i) => i.signal === "plan-expired"));
});

test("reviewed restriction survives an authority lock failure, retries idempotently and blocks new activation until fresh reviewed recovery", () => {
  const f = fixture(); f.monitor.configure(f.actor, f.plan, f.now); f.activate();
  f.cases.outcome(f.actor, f.c.id, "disputed", "complaint", f.at(1));
  const [i] = f.monitor.scan(f.actor, f.sources(), () => f.current, f.at(2));
  assert.throws(() => f.monitor.restrict({ ...f.actor, roles: ["operator"] }, i.id, "Restrict while investigating", f.at(3)), /forbidden/);
  writeFileSync(join(f.directory, "state.lock"), "busy");
  assert.throws(() => f.monitor.restrict(f.actor, i.id, "Restrict while investigating", f.at(3)), /EEXIST/);
  assert.equal(f.monitor.view(f.actor).incidents[0].status, "restriction-pending");
  unlinkSync(join(f.directory, "state.lock"));
  f.monitor.restrict(f.actor, i.id, "Restrict while investigating", f.at(4));
  f.monitor.restrict(f.actor, i.id, "Restrict while investigating", f.at(5));
  assert.equal(f.authority.view(f.actor).events.filter((e) => e.kind === "revoked").length, 1);
  assert.throws(() => f.authority.authorize({ ...f.operation, action: "deliver-answer", amountMinor: 0 }, f.current, f.at(5)), /revoked/);
  assert.throws(() => f.monitor.prepareActivation(f.actor, f.g, f.sources(), f.at(6)), /incident_review_required/);
  assert.throws(() => f.monitor.recover(f.actor, i.id, f.p.digest, "Reviewed old evidence", f.current, f.sources(), [], f.at(6)), /fresh_evidence_required/);
  const candidate = freshPackage(f, 7);
  const recovered = f.monitor.recover(f.actor, i.id, candidate.digest, "Fresh passing release and staffed fallback reviewed", f.current, f.sources(), [], f.at(8));
  assert.equal(recovered.status, "recovered");
  assert.equal(f.authority.view(f.actor).revoked.includes(f.g.id), true);
  const grant = f.authority.approve(f.actor, { ...f.request, packageDigest: candidate.digest }, f.current, f.at(9));
  f.monitor.prepareActivation(f.actor, grant, f.sources(), f.at(9));
  f.authority.activate(f.actor, grant.id, f.current, f.at(9));
  f.monitor.recordActivation(f.actor, grant, f.at(9));
  assert.equal(f.monitor.view(f.actor).incidents[0].recovery?.activatedBy, grant.id);
});

test("quality recovery requires actual independently reviewed regression reruns for the candidate release", () => {
  const f = fixture(); f.monitor.configure(f.actor, f.plan, f.now); f.activate();
  f.cases.review(f.actor, f.c.id, "rejected", f.at(1));
  const [i] = f.monitor.scan(f.actor, f.sources(), () => f.current, f.at(2));
  f.monitor.restrict(f.actor, i.id, "Review rejected answer", f.at(3));
  const candidate = freshPackage(f, 4);
  assert.throws(() => f.monitor.recover(f.actor, i.id, candidate.digest, "Fresh report alone", f.current, f.sources(), [], f.at(5)), /regression_rerun_required/);
  const regressions = new CaseworkRegression(join(f.root, "regressions"));
  const reviewer = { ...f.actor, id: "independent-reviewer", roles: ["labeler" as const] };
  const regression = regressions.create(f.actor, { source: { caseId: f.c.id, taskId: "review-1", publicationDigest: evidenceDigest("published-failure"), observationDigest: f.p.report.digest, gold: false },
    evidence: { rubric: "Check the amount" }, intent: "refund", input: { question: f.input.question }, assertions: [{ id: "amount", type: "contains", value: "340 EUR", severity: "critical" }], reviewer: reviewer.id }, f.at(5));
  regressions.review(reviewer, regression.id, true, "Independent expected refund verified", f.at(6));
  const report = JSON.parse(f.qualifications.read(candidate.report).toString("utf8"));
  report.createdAt = f.at(7).toISOString(); report.suite.hash = evidenceDigest(regression.suite); report.results[0].caseId = regression.suite.cases[0].id; report.results[0].split = "test";
  const { format, version, createdAt, digest, ...packageInput } = candidate;
  const rerunPackage = f.qualifications.create({ ...packageInput, suite: f.qualifications.put(JSON.stringify(regression.suite)), report: f.qualifications.put(JSON.stringify(report)) }, f.at(7));
  const c = f.cases.ingest({ ...f.input, qualificationDigest: rerunPackage.digest, origin: { ...f.input.origin, runId: "rerun-1", scenarioId: regression.suite.cases[0].id, reportDigest: rerunPackage.report.digest } }, f.at(8));
  regressions.recordRun(f.actor, regression.id, { runId: "rerun-1", reportDigest: rerunPackage.report.digest, targetRevision: rerunPackage.targetRevision, target: "ai-audit", passed: true, at: f.at(8).toISOString(), caseIds: [c.id] }, evidenceDigest(regression.suite), f.at(8));
  assert.equal(f.monitor.recover(f.actor, i.id, candidate.digest, "Reviewed actual regression rerun", f.current, f.sources(), regressions.list(f.actor), f.at(9)).status, "recovered");
  const reopened = new CaseworkMonitoring(join(f.root, "monitoring"), f.authority);
  assert.equal(reopened.view(f.actor).incidents[0].recovery?.regressionRuns[0], "rerun-1");
});

test("newly observed evidence invalidates an unconsumed recovery review while preserving its history", () => {
  const f = fixture(); f.monitor.configure(f.actor, f.plan, f.now); f.activate();
  f.cases.outcome(f.actor, f.c.id, "disputed", "first_complaint", f.at(1));
  const [incident] = f.monitor.scan(f.actor, f.sources(), () => f.current, f.at(2));
  f.monitor.restrict(f.actor, incident.id, "Investigate complaint", f.at(3));
  const candidate = freshPackage(f, 4);
  f.monitor.recover(f.actor, incident.id, candidate.digest, "Fresh evidence reviewed", f.current, f.sources(), [], f.at(5));
  f.cases.outcome(f.actor, f.c.id, "resolved", "first_resolved", f.at(6));
  f.cases.outcome(f.actor, f.c.id, "disputed", "second_complaint", f.at(7));
  const [updated] = f.monitor.scan(f.actor, f.sources(), () => f.current, f.at(8));
  assert.equal(updated.status, "restricted");
  assert.equal(updated.recovery, null);
  assert.equal(updated.recoveryHistory?.[0].packageDigest, candidate.digest);
  assert.equal(updated.latestSignalAt, f.at(7).toISOString());
  assert.throws(() => f.monitor.prepareActivation(f.actor, f.g, f.sources(), f.at(9)), /incident_review_required/);
});

test("legacy current outcomes remain visible as state observations without inventing historical event times", () => {
  const f = fixture(); f.monitor.configure(f.actor, f.plan, f.now); f.activate();
  f.cases.outcome(f.actor, f.c.id, "resolved", "resolved", f.at(1));
  f.cases.outcome(f.actor, f.c.id, "reopened", "repeat", f.at(2));
  f.cases.outcome(f.actor, f.c.id, "disputed", "complaint", f.at(3));
  f.cases.storage.transact((state) => { for (const event of state.cases[0].events) delete event.outcomeState; });
  const incidents = f.monitor.scan(f.actor, f.sources(), () => f.current, f.at(4));
  assert.deepEqual(incidents.map((i) => i.signal).sort(), ["complaint", "reopened"]);
  for (const incident of incidents) {
    assert.equal(incident.evidence[0].basis, "current-state");
    assert.equal(incident.evidence[0].at, f.at(4).toISOString());
  }
  assert.deepEqual(f.monitor.scan(f.actor, f.sources(), () => f.current, f.at(5)), incidents);
});
