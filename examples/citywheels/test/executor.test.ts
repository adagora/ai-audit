import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SyntheticCancellationExecutor, SyntheticCitywheelsBackend, type SyntheticBooking, type ExecutorFault } from "../src/citywheelsExecutor.js";
import { caseworkFixture } from "./caseworkFixture.js";
import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";

function setup() {
  const f = caseworkFixture();
  const booking: SyntheticBooking = { id: "CW-1002", tenant: "shop-a", customer: "customer-a", version: 1, status: "confirmed", startsAt: "2026-11-05T00:00:00Z", rentalMinor: 8000, depositMinor: 30000, currency: "EUR", paymentRef: "original-card" };
  const backend = new SyntheticCitywheelsBackend(join(f.root, "backend"), [booking]);
  const scope = { tenant: "shop-a", customer: "customer-a" };
  const options = { intent: "refund", autoApproveMinor: 10000, exceptionOwner: "refund-ops" };
  const executor = new SyntheticCancellationExecutor(join(f.root, "executor"), backend, f.authority, () => f.current, options);
  const grant = f.authority.approve(f.actor, f.request, f.current, f.now);
  f.authority.activate(f.actor, grant.id, f.current, f.now);
  return { ...f, backend, executor, scope, booking, options, grant };
}

function prepare(f: ReturnType<typeof setup>) {
  const op = f.executor.propose(f.scope, "case-1", "CW-1002", f.now);
  f.executor.consent(f.scope, op.proposal.id, f.now);
  f.executor.review(f.actor, op.proposal.id, "approved", f.now);
  return op.proposal.id;
}

test("owned live facts determine integer money; consent and exact-operation review precede cancellation", () => {
  const f = setup();
  const op = f.executor.propose(f.scope, "case-1", "CW-1002", f.now);
  assert.equal(op.proposal.amountMinor, 34000);
  assert.equal(f.backend.owned(f.scope, "CW-1002").status, "confirmed");
  assert.throws(() => f.executor.execute(f.scope, op.proposal.id, f.now), /not_ready/);
  f.executor.consent(f.scope, op.proposal.id, f.now);
  assert.throws(() => f.executor.execute(f.scope, op.proposal.id, f.now), /operation_approval_required/);
  f.executor.review(f.actor, op.proposal.id, "approved", f.now);
  const done = f.executor.execute(f.scope, op.proposal.id, f.now);
  assert.equal(done.status, "done");
  assert.equal(f.backend.owned(f.scope, "CW-1002").status, "cancelled");
  assert.equal(f.backend.storage.read().refunds.length, 1);
  assert.equal(f.backend.storage.read().refunds[0].paymentRef, "original-card");
  assert.equal(f.executor.execute(f.scope, op.proposal.id, f.now).status, "done");
  assert.equal(f.backend.storage.read().refunds.length, 1);
});

test("booking identifiers do not establish access and cross-tenant operations stay invisible", () => {
  const f = setup(), id = prepare(f);
  for (const scope of [{ tenant: "shop-b", customer: "customer-a" }, { tenant: "shop-a", customer: "customer-b" }]) {
    assert.throws(() => f.executor.propose(scope, "case-2", "CW-1002", f.now), /booking_not_accessible/);
    assert.throws(() => f.executor.view(scope, id), /unknown_operation/);
    assert.throws(() => f.executor.consent(scope, id, f.now), /unknown_operation/);
    assert.throws(() => f.executor.execute(scope, id, f.now), /unknown_operation/);
  }
  assert.throws(() => f.executor.review({ ...f.actor, tenant: "shop-b" }, id, "approved", f.now), /unknown_operation/);
  assert.throws(() => f.executor.propose(f.scope, "case-storm", "CW-1002", f.now, true), /staff_required_for_claim/);
  assert.equal(f.backend.storage.read().refunds.length, 0);
});

test("a rejection, expired quote, changed booking or changed policy never dispatches", () => {
  for (const scenario of ["rejected", "expired", "changed-booking", "changed-policy", "revoked"] as const) {
    const f = setup();
    const op = f.executor.propose(f.scope, "case-1", "CW-1002", f.now);
    f.executor.consent(f.scope, op.proposal.id, f.now);
    f.executor.review(f.actor, op.proposal.id, scenario === "rejected" ? "rejected" : "approved", f.now);
    if (scenario === "changed-booking") f.backend.storage.transact((s) => { s.bookings[0].version++; s.bookings[0].rentalMinor = 10000; });
    if (scenario === "changed-policy") f.current.components.policy = { ...f.current.components.policy, digest: "0".repeat(64) };
    if (scenario === "revoked") f.authority.revoke(f.actor, f.grant.id, "regression", f.now);
    assert.throws(() => f.executor.execute(f.scope, op.proposal.id, scenario === "expired" ? new Date(op.proposal.expiresAt) : f.now), scenario);
    assert.equal(f.backend.storage.read().refunds.length, 0, scenario);
    assert.equal(f.backend.owned(f.scope, "CW-1002").status, "confirmed", scenario);
  }
});

test("shadow, assist and contain grants cannot perform business writes", () => {
  for (const tier of ["shadow", "assist", "contain"] as const) {
    const f = setup(), id = prepare(f);
    const grant = f.authority.approve(f.actor, { ...f.request, tier }, f.current, f.now);
    f.authority.activate(f.actor, grant.id, f.current, f.now);
    assert.throws(() => f.executor.execute(f.scope, id, f.now), /tier_cannot_transact/);
    assert.equal(f.backend.owned(f.scope, "CW-1002").status, "confirmed");
  }
});

test("crashes before dispatch or after commit reconcile without a second refund", () => {
  for (const fault of ["before-dispatch", "after-refund"] as const) {
    const f = setup(), id = prepare(f);
    assert.throws(() => f.executor.execute(f.scope, id, f.now, fault), /synthetic_crash/);
    const reopenedBackend = new SyntheticCitywheelsBackend(join(f.root, "backend"));
    const reopened = new SyntheticCancellationExecutor(join(f.root, "executor"), reopenedBackend, f.authority, () => f.current, f.options);
    assert.equal(reopened.view(f.scope, id).status, "dispatching");
    assert.throws(() => reopened.execute(f.scope, id, f.now), /not_ready/);
    const readback = reopened.reconcile(f.scope, id, f.now);
    assert.equal(readback.status, fault === "before-dispatch" ? "ready" : "done");
    assert.equal(reopened.execute(f.scope, id, f.now).status, "done");
    assert.equal(reopenedBackend.storage.read().refunds.length, 1);
  }
});

test("partial cancellation and refund failure become owned exceptions without pretending rollback", () => {
  for (const fault of ["after-cancel", "refund-failure"] as ExecutorFault[]) {
    const f = setup(), id = prepare(f);
    if (fault === "after-cancel") assert.throws(() => f.executor.execute(f.scope, id, f.now, fault), /synthetic_crash/);
    else assert.equal(f.executor.execute(f.scope, id, f.now, fault).status, "unknown");
    const result = f.executor.reconcile(f.scope, id, f.now);
    assert.equal(result.status, "unknown");
    assert.equal(result.exception?.owner, "refund-ops");
    assert.equal(f.backend.owned(f.scope, "CW-1002").status, "cancelled");
    assert.equal(f.backend.storage.read().refunds.length, 0);
    assert.throws(() => f.executor.execute(f.scope, id, f.now), /not_ready/);
  }
});

test("backend deduplication refuses conflicting refund amounts", () => {
  const f = setup(), id = prepare(f);
  const done = f.executor.execute(f.scope, id, f.now);
  assert.throws(() => f.backend.refund({ ...done.proposal, amountMinor: 34001 }, f.now), /idempotency_conflict/);
  assert.equal(f.backend.storage.read().refunds.length, 1);
  assert.equal(f.executor.propose(f.scope, "case-1", "CW-1002", f.now).proposal.id, id);
});

test("inconsistent read-back is an owned exception and cannot authorize another refund", () => {
  const f = setup(), id = prepare(f);
  f.executor.execute(f.scope, id, f.now);
  f.backend.storage.transact((s) => { s.refunds[0].amountMinor++; });
  const observed = f.executor.reconcile(f.scope, id, f.now);
  assert.equal(observed.status, "unknown");
  assert.equal(observed.exception?.code, "readback_mismatch");
  assert.equal(observed.exception?.owner, "refund-ops");
  assert.throws(() => f.executor.completeRefund(f.actor, f.scope, id, f.now), /readback_mismatch/);
  assert.equal(f.backend.storage.read().refunds.length, 1);
});

test("an expired quote is explicitly renewed without transferring consent or review", () => {
  const f = setup(), id = prepare(f);
  const expiredAt = new Date(f.executor.view(f.scope, id).proposal.expiresAt);
  assert.throws(() => f.executor.renew(f.scope, id, f.now), /proposal_not_expired/);
  const renewed = f.executor.renew(f.scope, id, expiredAt);
  assert.notEqual(renewed.proposal.id, id);
  assert.equal(renewed.proposal.generation, 2);
  assert.equal(renewed.proposal.supersedes, id);
  assert.equal(renewed.consentAt, null);
  assert.equal(renewed.review, null);
  assert.equal(f.executor.renew(f.scope, id, expiredAt).proposal.id, renewed.proposal.id);
  assert.equal(f.executor.view(f.scope, id).status, "superseded");
  assert.throws(() => f.executor.execute(f.scope, renewed.proposal.id, expiredAt), /not_ready/);
  const later = setup(), laterId = prepare(later);
  assert.throws(() => later.executor.execute(later.scope, laterId, later.now, "before-dispatch"), /synthetic_crash/);
  later.executor.reconcile(later.scope, laterId, new Date(later.now.getTime() + 10 * 60000));
  assert.throws(() => later.executor.renew(later.scope, laterId, new Date(later.now.getTime() + 6 * 60000)), /clock_regressed/);
});

test("the fixed shop clock does not weaken system expiry and voucher credit never becomes a card refund", () => {
  const f = setup();
  f.backend.storage.transact((s) => { s.bookings[0].startsAt = "2026-06-11T18:00:00+02:00"; s.bookings[0].paymentKind = "voucher"; });
  const executor = new SyntheticCancellationExecutor(join(f.root, "clock-executor"), f.backend, f.authority, () => f.current, { ...f.options, businessClock: () => new Date("2026-06-10T09:00:00+02:00") });
  const op = executor.propose(f.scope, "case-clock", "CW-1002", f.now);
  assert.equal(op.proposal.amountMinor, 34000);
  assert.equal(op.proposal.businessAt, "2026-06-10T07:00:00.000Z");
  assert.equal(op.proposal.createdAt, f.now.toISOString());
  assert.equal(op.proposal.paymentKind, "voucher");
  executor.consent(f.scope, op.proposal.id, f.now); executor.review(f.actor, op.proposal.id, "approved", f.now);
  assert.equal(executor.execute(f.scope, op.proposal.id, f.now).status, "done");
  assert.equal(f.backend.storage.read().refunds[0].paymentKind, "voucher");
  assert.equal("paymentRef" in f.backend.bookings(f.scope)[0], false);
});

test("customer consent is bound to every field of the proposal", () => {
  const f = setup(), id = prepare(f);
  f.executor.storage.transact((s) => { s.operations[0].proposal.expiresAt = "2026-11-03T12:30:00Z"; });
  assert.throws(() => f.executor.execute(f.scope, id, f.now), /not_ready/);
  assert.equal(f.backend.storage.read().refunds.length, 0);
});

test("partial completion needs a supervisor and current authority; reconciliation alone never dispatches", () => {
  const f = setup(), id = prepare(f);
  f.executor.execute(f.scope, id, f.now, "refund-failure");
  assert.equal(f.executor.reconcile(f.scope, id, f.now).status, "unknown");
  assert.equal(f.backend.storage.read().refunds.length, 0);
  assert.throws(() => f.executor.completeRefund({ ...f.actor, roles: ["operator"] }, f.scope, id, f.now), /resolution_forbidden/);
  assert.throws(() => f.executor.completeRefund({ ...f.actor, tenant: "other" }, f.scope, id, f.now), /resolution_forbidden/);
  const resolved = f.executor.completeRefund(f.actor, f.scope, id, new Date(f.now.getTime() + 10 * 60000));
  assert.equal(resolved.status, "done");
  assert.equal(resolved.resolution?.reviewer, f.actor.id);
  assert.equal(f.backend.storage.read().refunds.length, 1);
  assert.equal(f.executor.completeRefund(f.actor, f.scope, id, new Date(f.now.getTime() + 10 * 60000)).status, "done");
  assert.equal(f.backend.storage.read().refunds.length, 1);
});

test("a crash after a resolution refund is recovered by read-back and revoked authority cannot settle a new refund", () => {
  const f = setup(), id = prepare(f);
  f.executor.execute(f.scope, id, f.now, "refund-failure");
  assert.throws(() => f.executor.completeRefund(f.actor, f.scope, id, f.now, "after-refund"), /synthetic_crash/);
  const restarted = new SyntheticCancellationExecutor(join(f.root, "executor"), new SyntheticCitywheelsBackend(join(f.root, "backend")), f.authority, () => f.current, f.options);
  assert.equal(restarted.reconcile(f.scope, id, f.now).status, "done");
  assert.equal(f.backend.storage.read().refunds.length, 1);
  const other = setup(), otherId = prepare(other);
  other.executor.execute(other.scope, otherId, other.now, "refund-failure");
  other.authority.revoke(other.actor, other.grant.id, "regression", other.now);
  assert.throws(() => other.executor.completeRefund(other.actor, other.scope, otherId, other.now), /revoked/);
  assert.equal(other.backend.storage.read().refunds.length, 0);
});

test("three real executor processes cannot cancel or refund the same operation twice", async () => {
  const f = setup(), id = prepare(f);
  const context = join(f.root, "context.json"); writeFileSync(context, JSON.stringify({ current: f.current, scope: f.scope, options: f.options, now: f.now.toISOString(), id }));
  const code = `import {readFileSync} from 'node:fs'; import {join} from 'node:path';
    import {SyntheticCancellationExecutor,SyntheticCitywheelsBackend} from ${JSON.stringify(new URL("../src/citywheelsExecutor.js", import.meta.url).href)};
    import {AuthorityStore} from ${JSON.stringify(new URL("../src/authority.js", import.meta.url).href)};
    import {QualificationStore} from ${JSON.stringify(new URL("../src/qualification.js", import.meta.url).href)};
    const root=process.argv[1], c=JSON.parse(readFileSync(join(root,'context.json'),'utf8'));
    const executor=new SyntheticCancellationExecutor(join(root,'executor'),new SyntheticCitywheelsBackend(join(root,'backend')),new AuthorityStore(join(root,'authority'),new QualificationStore(join(root,'qualifications'))),()=>c.current,c.options);
    process.send('ready'); process.once('message',()=>{try{process.stdout.write(JSON.stringify({status:executor.execute(c.scope,c.id,new Date(c.now)).status}));}catch(e){process.stdout.write(JSON.stringify({error:e.message}));}process.disconnect();});`;
  const children = Array.from({ length: 3 }, () => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code, f.root], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
    const output = child.stdout, errors = child.stderr;
    if (!output || !errors) throw new Error("Executor child streams unavailable");
    let out = "", err = ""; output.on("data", (chunk) => { out += chunk; }); errors.on("data", (chunk) => { err += chunk; });
    const ready = once(child, "message", { signal: AbortSignal.timeout(10000) });
    const closed = once(child, "close").then(([code]) => { assert.equal(code, 0, err); return JSON.parse(out); });
    return { child, ready, closed };
  });
  try {
    await Promise.all(children.map((c) => c.ready)); children.forEach((c) => c.child.send("go"));
    const results = await Promise.all(children.map((c) => c.closed));
    assert.ok(results.some((r) => r.status === "done"), JSON.stringify(results));
    assert.equal(f.backend.storage.read().refunds.length, 1);
    assert.equal(f.executor.view(f.scope, id).status, "done");
  } finally { for (const { child } of children) if (child.exitCode === null) child.kill(); }
});
