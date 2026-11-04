import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { caseworkFixture } from "./caseworkFixture.js";
import { CaseworkStore, COST_KINDS } from "../src/casework.js";

function fixture() {
  const f = caseworkFixture(), store = new CaseworkStore(join(f.root, "cases"), f.authority);
  const p = f.qualifications.load(f.request.packageDigest), scope = { tenant: f.actor.tenant, customer: "customer-a" };
  const input = { scope, intent: "refund", qualificationDigest: p.digest, question: "What refund can I get?", answer: "340 EUR, calculation only.", origin: { runId: "run-1", scenarioId: "one", repetition: 0, target: "ai-audit" as const, targetRevision: p.targetRevision, evaluation: "pass" as const, reportDigest: p.report.digest, audit: { available: true, chainVerified: true, records: [] } } };
  const c = store.ingest(input, f.now);
  const grant = (tier: "shadow" | "assist" | "contain" | "transact") => {
    const g = f.authority.approve(f.actor, { ...f.request, tier, limits: { ...f.request.limits, actions: ["deliver-answer"] } }, f.current, f.now);
    f.authority.activate(f.actor, g.id, f.current, f.now); return g;
  };
  return { ...f, store, scope, input, c, grant };
}

test("case import is idempotent, binds the actual observation and survives restart without fabricated Python evidence", () => {
  const f = fixture();
  assert.equal(f.store.ingest(f.input, f.now).id, f.c.id);
  assert.throws(() => f.store.ingest({ ...f.input, answer: "different" }, f.now), /observation_mismatch/);
  const reopened = new CaseworkStore(join(f.root, "cases"), f.authority);
  assert.equal(reopened.get(f.actor, f.c.id).answer, f.input.answer);
  assert.throws(() => f.store.ingest({ ...f.input, origin: { ...f.input.origin, target: "python" } }, f.now), /fabricated_audit_evidence/);
});

test("shadow does not deliver and assist requires an exact-answer review before one idempotent outbox message", () => {
  const f = fixture();
  assert.equal(f.store.deliver(f.actor, f.c.id, f.current, f.now).delivery.state, "held");
  f.grant("shadow");
  assert.equal(f.store.deliver(f.actor, f.c.id, f.current, f.now).delivery.reason, "shadow_observation_only");
  assert.equal(f.store.inbox(f.scope).length, 0);
  f.grant("assist");
  assert.equal(f.store.deliver(f.actor, f.c.id, f.current, f.now).delivery.reason, "answer_review_required");
  f.store.review(f.actor, f.c.id, "approved", f.now);
  assert.equal(f.store.deliver(f.actor, f.c.id, f.current, f.now).delivery.state, "delivered");
  f.store.deliver(f.actor, f.c.id, f.current, f.now);
  assert.equal(f.store.inbox(f.scope).length, 1);
  assert.equal(f.store.inbox(f.scope)[0].answer, f.input.answer);
  assert.throws(() => f.store.review(f.actor, f.c.id, "rejected", f.now), /already_reviewed/);
});

test("rejected, revoked, expired, changed-release and another-tenant cases do not deliver", () => {
  for (const scenario of ["rejected", "revoked", "expired", "changed"] as const) {
    const f = fixture(), g = f.grant("contain");
    if (scenario === "rejected") f.store.review(f.actor, f.c.id, "rejected", f.now);
    if (scenario === "revoked") f.authority.revoke(f.actor, g.id, "regression", f.now);
    const current = scenario === "changed" ? { ...f.current, targetRevision: "r2" } : f.current;
    const now = scenario === "expired" ? new Date(f.request.expiresAt) : f.now;
    assert.equal(f.store.deliver(f.actor, f.c.id, current, now).delivery.state, "held", scenario);
    assert.equal(f.store.inbox(f.scope).length, 0);
  }
  const f = fixture(); f.grant("contain");
  assert.throws(() => f.store.deliver({ ...f.actor, tenant: "other" }, f.c.id, f.current, f.now), /not_found/);
  assert.deepEqual(f.store.list({ ...f.actor, tenant: "other" }), []);
  assert.deepEqual(f.store.inbox({ ...f.scope, tenant: "other" }), []);
  assert.deepEqual(f.store.inbox({ ...f.scope, customer: "other" }), []);
  assert.throws(() => f.store.review({ ...f.actor, roles: ["operator"] }, f.c.id, "approved", f.now), /forbidden/);
});

test("handoff ownership and deadlines persist; accepting and resolving a handoff are separate from case resolution", () => {
  const f = fixture();
  f.store.escalate(f.actor, f.c.id, { owner: "refund-ops", reason: "storm_claim", summary: "Verify the warning before changing eligibility.", dueAt: new Date(f.now.getTime() + 3600000).toISOString() }, f.now);
  assert.throws(() => f.store.handoff(f.actor, f.c.id, "resolve", f.now), /handoff_state/);
  const accepted = f.store.handoff(f.actor, f.c.id, "accept", f.now);
  assert.equal(accepted.escalation?.acceptedBy, f.actor.id);
  assert.throws(() => f.store.handoff({ ...f.actor, id: "other" }, f.c.id, "resolve", f.now), /handoff_state/);
  assert.equal(f.store.handoff(f.actor, f.c.id, "resolve", f.now).escalation?.status, "resolved");
  assert.equal(f.store.get(f.actor, f.c.id).outcome.state, "open");
  f.store.outcome(f.actor, f.c.id, "resolved", "customer_confirmed", f.now);
  const reopened = f.store.outcome(f.actor, f.c.id, "reopened", "repeat_contact", f.now);
  assert.equal(reopened.id, f.c.id);
  assert.equal(reopened.outcome.reopened, 1);
  assert.equal(f.store.insights(f.actor).overall.reopened, 1);
});

test("unknown cost is not zero, estimates remain separate and complete measured components produce a comparable total", () => {
  const f = fixture();
  assert.equal(f.store.insights(f.actor).overall.meanMeasuredCostMinor, null);
  assert.equal(f.store.insights(f.actor).overall.measuredCostCoverage, 0);
  for (const kind of COST_KINDS) f.store.recordCost(f.actor, f.c.id, { kind, amountMinor: kind === "rework" ? 1000 : 1, currency: "EUR", basis: "measured", source: "test_ledger" }, f.now);
  const result = f.store.insights(f.actor);
  assert.equal(result.overall.meanMeasuredCostMinor, 1004);
  assert.equal(result.overall.measuredCostCoverage, 1);
  assert.equal(result.populationEstimate, false);
  const f2 = fixture();
  f2.store.recordCost(f2.actor, f2.c.id, { kind: "harm", amountMinor: 50000, currency: "EUR", basis: "estimate", source: "risk_owner" }, f2.now);
  assert.equal(f2.store.insights(f2.actor).overall.meanMeasuredCostMinor, null);
  assert.equal(f2.store.insights(f2.actor).overall.estimatedComponents, 1);
  assert.deepEqual(f2.store.insights(f2.actor).overall.knownSubtotalByCurrency, {});
});

test("cost aggregates that exceed safe integer bounds remain unknown rather than rounded totals", () => {
  const f = fixture();
  for (const kind of COST_KINDS) f.store.recordCost(f.actor, f.c.id, { kind, amountMinor: Number.MAX_SAFE_INTEGER, currency: "EUR", basis: "measured", source: "overflow_fixture" }, f.now);
  const result = f.store.insights(f.actor).overall;
  assert.equal(result.meanMeasuredCostMinor, null);
  assert.equal(result.knownSubtotalByCurrency.EUR, null);
  assert.equal(result.costAggregationOverflow, true);
});
