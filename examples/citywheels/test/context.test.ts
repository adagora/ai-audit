import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { caseworkFixture } from "../../../test/caseworkFixture.js";
import { readCitywheelsContext, validCitywheelsContext, verifyCitywheelsContext, type CitywheelsReadContext } from "../src/context.js";
import { SyntheticCitywheelsBackend } from "../src/executor.js";
import { CaseworkStore } from "../../../src/casework.js";

function fixture() {
  const f = caseworkFixture(), scope = { tenant: f.actor.tenant, customer: "customer-a" };
  const backend = new SyntheticCitywheelsBackend(join(f.root, "backend"), [{ ...scope, id: "CW-1002", version: 1, status: "confirmed", startsAt: "2026-11-04T12:00:00Z", rentalMinor: 8000, depositMinor: 30000, bookingFeeMinor: 200, currency: "EUR", paymentRef: "private-original-card", display: { bikeType: "e-bike", bikes: 2, endsAt: "2026-11-05T12:00:00Z", addOns: [] } }]);
  const knowledge = { snapshot: f.current.components.sop, validFrom: "2026-01-01T00:00:00Z", validUntil: "2027-01-01T00:00:00Z", owner: "policy-ops" };
  return { ...f, scope, backend, knowledge };
}

test("authenticated context excludes payment credentials, binds live state and refuses inaccessible bookings", () => {
  const f = fixture(), context = readCitywheelsContext(f.backend, f.scope, "CW-1002", f.knowledge, f.now);
  assert.equal(context.booking.rental_price_eur, 80);
  assert.equal(context.bookingVersion, 1);
  assert.equal(context.claims, "unverified-customer-input");
  assert.equal(JSON.stringify(context).includes("private-original-card"), false);
  verifyCitywheelsContext(f.backend, f.scope, context, f.knowledge.snapshot.digest, f.now);
  for (const scope of [{ ...f.scope, tenant: "other" }, { ...f.scope, customer: "other" }]) {
    assert.throws(() => readCitywheelsContext(f.backend, scope, "CW-1002", f.knowledge, f.now), /booking_not_accessible/);
  }
  f.backend.storage.transact((state) => { state.bookings[0].status = "cancelled"; state.bookings[0].version++; });
  assert.throws(() => verifyCitywheelsContext(f.backend, f.scope, context, f.knowledge.snapshot.digest, f.now), /booking_changed/);
  assert.equal(readCitywheelsContext(f.backend, f.scope, "CW-1002", f.knowledge, f.now).booking.status, "cancelled");
});

test("knowledge validity, quote expiry, policy identity and time-band changes invalidate read context", () => {
  const f = fixture();
  assert.throws(() => readCitywheelsContext(f.backend, f.scope, "CW-1002", { ...f.knowledge, validUntil: f.now.toISOString() }, f.now), /knowledge_unavailable/);
  assert.throws(() => readCitywheelsContext(f.backend, f.scope, "CW-1002", { ...f.knowledge, validFrom: "2026-12-01T00:00:00Z" }, f.now), /knowledge_unavailable/);
  const context = readCitywheelsContext(f.backend, f.scope, "CW-1002", f.knowledge, f.now);
  assert.throws(() => verifyCitywheelsContext(f.backend, f.scope, context, "0".repeat(64), f.now), /stale_context/);
  assert.throws(() => verifyCitywheelsContext(f.backend, f.scope, context, f.knowledge.snapshot.digest, new Date(context.expiresAt)), /stale_context/);
  assert.throws(() => verifyCitywheelsContext(f.backend, f.scope, context, f.knowledge.snapshot.digest, new Date(f.now.getTime() + 1), new Date(f.now.getTime() + 1)), /stale_context/);
  f.backend.storage.transact((state) => { delete state.bookings[0].bookingFeeMinor; });
  assert.throws(() => readCitywheelsContext(f.backend, f.scope, "CW-1002", f.knowledge, f.now), /booking_context_incomplete/);
});

test("operational observations retain their own evidence, cannot impersonate evaluation and require context checks at delivery", () => {
  const f = fixture(), context = readCitywheelsContext(f.backend, f.scope, "CW-1002", f.knowledge, f.now);
  const p = f.qualifications.load(f.request.packageDigest), store = new CaseworkStore(join(f.root, "cases"), f.authority, { currency: "EUR", context: { source: "synthetic-citywheels-backend", valid: validCitywheelsContext } });
  const audit = { available: false, chainVerified: null, records: [] };
  const evidence = { scope: f.scope, question: "Can I cancel now?", answer: "Quote only.", intent: "refund", target: "python" as const, targetRevision: p.targetRevision, context, audit };
  const observation = f.qualifications.put(JSON.stringify(evidence));
  const input = { scope: f.scope, intent: "refund", qualificationDigest: p.digest, question: evidence.question, answer: evidence.answer, origin: { runId: "request-1", scenarioId: "question-1", repetition: 0, target: "python" as const, targetRevision: p.targetRevision, evaluation: "not-evaluated" as const, reportDigest: p.report.digest, observation, audit } };
  const c = store.ingest(input, f.now);
  assert.equal(c.origin.evaluation, "not-evaluated");
  assert.equal(c.escalation?.reason, "answer_not_evaluated");
  assert.equal(store.request(f.scope, "request-1")?.id, c.id);
  assert.equal(store.request({ ...f.scope, customer: "other" }, "request-1"), null);
  assert.throws(() => store.ingest({ ...input, answer: "Cancelled." }, f.now), /observation_mismatch/);
  assert.throws(() => store.ingest({ ...input, origin: { ...input.origin, evaluation: "pass" } }, f.now), /observation_mismatch/);
  const g = f.authority.approve(f.actor, { ...f.request, tier: "contain", limits: { ...f.request.limits, actions: ["deliver-answer"] } }, f.current, f.now);
  f.authority.activate(f.actor, g.id, f.current, f.now);
  assert.equal(store.deliver(f.actor, c.id, f.current, f.now).delivery.reason, "context_verification_required");
  const check = () => verifyCitywheelsContext(f.backend, f.scope, c.context as CitywheelsReadContext, f.knowledge.snapshot.digest, f.now);
  assert.equal(store.deliver(f.actor, c.id, f.current, f.now, check).delivery.state, "delivered");
  assert.equal(store.inbox(f.scope).length, 1);
});
