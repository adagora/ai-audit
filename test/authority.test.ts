import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AuthorityStore, type CaseworkPrincipal, type GrantRequest } from "../src/authority.js";
import { COMPONENTS, evidenceDigest, QualificationStore } from "../src/qualification.js";
import { CaseworkStorage } from "../src/caseworkStorage.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "casework-authority-"));
  const qualifications = new QualificationStore(join(root, "qualifications"));
  const ref = qualifications.put("synthetic-component");
  const files = [{ path: "component.json", ...ref }];
  const components = Object.fromEntries(COMPONENTS.map((name) => [name, { files, digest: evidenceDigest(files) }]));
  const suite = { schemaVersion: 1, name: "quotes", version: "1", cases: [{ id: "one", intent: "refund", split: "holdout", assertions: [{ id: "amount" }] }] };
  const report = { schemaVersion: 1, suite: { hash: evidenceDigest(suite) }, target: { revision: "r1" }, options: { repetitions: 1 }, passed: true, gates: [], results: [{ caseId: "one", intent: "refund", split: "holdout", repetition: 0, status: "pass", checks: [{ id: "amount", status: "pass", severity: "critical" }] }] };
  const model = { name: "fake", provider: "scripted", immutableRevision: null };
  const p = qualifications.create({ intent: "refund", targetRevision: "r1", coverage: { maximumTier: "transact", actions: ["cancel-refund"] }, components, model, suite: qualifications.put(JSON.stringify(suite)), report: qualifications.put(JSON.stringify(report)), calibration: null,
    provenance: { kind: "synthetic", owner: "qa", sampling: "development", source: "test-fixture", independentReview: null } });
  const directory = join(root, "authority"), authority = new AuthorityStore(directory, qualifications);
  const actor: CaseworkPrincipal = { tenant: "shop-a", id: "alice", roles: ["reviewer", "deployer", "operator"] };
  const current = { targetRevision: "r1", components, model };
  const now = new Date("2026-11-03T12:00:00Z");
  const request: GrantRequest = { packageDigest: p.digest, scope: "synthetic", tier: "transact", limits: { actions: ["cancel-refund"], maxAmountMinor: 34000, currency: "EUR" }, expiresAt: "2026-11-03T13:00:00Z", acceptsMutableModel: true };
  const operation = { tenant: "shop-a", intent: "refund", scope: "synthetic" as const, action: "cancel-refund", amountMinor: 34000, currency: "EUR" };
  return { root, directory, qualifications, authority, actor, current, now, request, operation };
}

test("passing measurements confer no authority; approval and activation are separate and survive restart", () => {
  const f = setup();
  assert.throws(() => f.authority.authorize(f.operation, f.current, f.now), /not_active/);
  const grant = f.authority.approve(f.actor, f.request, f.current, f.now);
  assert.throws(() => f.authority.authorize(f.operation, f.current, f.now), /not_active/);
  f.authority.activate(f.actor, grant.id, f.current, f.now);
  const reopened = new AuthorityStore(f.directory, f.qualifications);
  assert.equal(reopened.authorize(f.operation, f.current, f.now).id, grant.id);
  assert.deepEqual(reopened.view(f.actor).events.map((e) => e.kind), ["approved", "activated"]);
});

test("authority is bounded by tenant, intent, scope, action, amount, currency and exact release", () => {
  const f = setup(), grant = f.authority.approve(f.actor, f.request, f.current, f.now);
  f.authority.activate(f.actor, grant.id, f.current, f.now);
  for (const change of [{ tenant: "shop-b" }, { intent: "other" }, { scope: "production" as const }, { action: "send-money" }, { amountMinor: 34001 }, { currency: "USD" }, { amountMinor: -1 }, { amountMinor: 0.5 }]) {
    assert.throws(() => f.authority.authorize({ ...f.operation, ...change }, f.current, f.now));
  }
  assert.throws(() => f.authority.authorize(f.operation, { ...f.current, targetRevision: "r2" }, f.now), /release_changed/);
  assert.throws(() => f.authority.authorize(f.operation, { ...f.current, model: { ...f.current.model, name: "other" } }, f.now), /release_changed/);
  assert.equal(f.authority.view({ ...f.actor, tenant: "shop-b" }).grants.length, 0);
  assert.throws(() => f.authority.activate({ ...f.actor, tenant: "shop-b" }, grant.id, f.current, f.now), /unknown_grant/);
});

test("revocation is idempotent, prevents reactivation and never grants production authority to synthetic cases", () => {
  const f = setup();
  assert.throws(() => f.authority.approve(f.actor, { ...f.request, scope: "production" }, f.current, f.now), /not_qualified/);
  assert.throws(() => f.authority.approve(f.actor, { ...f.request, acceptsMutableModel: false }, f.current, f.now), /mutable_model_unaccepted/);
  const grant = f.authority.approve(f.actor, f.request, f.current, f.now);
  f.authority.activate(f.actor, grant.id, f.current, f.now);
  f.authority.revoke(f.actor, grant.id, "regression", f.now);
  f.authority.revoke(f.actor, grant.id, "regression", f.now);
  assert.equal(f.authority.view(f.actor).events.filter((e) => e.kind === "revoked").length, 1);
  assert.throws(() => f.authority.authorize(f.operation, f.current, f.now), /revoked/);
  assert.throws(() => f.authority.activate(f.actor, grant.id, f.current, f.now), /revoked/);
});

test("expiry includes its boundary and denial preserves a clock floor against resurrection", () => {
  const f = setup(), grant = f.authority.approve(f.actor, f.request, f.current, f.now);
  f.authority.activate(f.actor, grant.id, f.current, f.now);
  assert.throws(() => f.authority.authorize(f.operation, f.current, new Date(f.request.expiresAt)), /expired/);
  assert.throws(() => f.authority.authorize(f.operation, f.current, f.now), /clock_regressed/);
});

test("production grants cannot extend a quote qualification into transaction authority", () => {
  const f = setup();
  const { digest, format, version, createdAt, ...input } = f.qualifications.load(f.request.packageDigest);
  const p = f.qualifications.create({ ...input, coverage: { maximumTier: "contain", actions: ["deliver-answer"] },
    provenance: { kind: "representative", owner: "qa", sampling: "random", source: "reviewed-fixture", independentReview: { reviewers: ["a", "b"], datasetDigest: input.suite.digest, rubricDigest: input.components.rubric!.digest } } });
  assert.throws(() => f.authority.approve(f.actor, { ...f.request, packageDigest: p.digest, scope: "production" }, f.current, f.now), /capability_ceiling/);
  const request = { ...f.request, packageDigest: p.digest, scope: "production" as const, tier: "contain" as const, limits: { ...f.request.limits, actions: ["deliver-answer"] } };
  const grant = f.authority.approve(f.actor, request, f.current, f.now);
  f.authority.activate(f.actor, grant.id, f.current, f.now);
  assert.equal(f.authority.authorize({ ...f.operation, scope: "production", action: "deliver-answer" }, f.current, f.now).id, grant.id);
});

test("review and deployment roles cannot be supplied through operation data", () => {
  const f = setup();
  assert.throws(() => f.authority.approve({ ...f.actor, roles: ["operator"] }, f.request, f.current, f.now), /forbidden/);
  const grant = f.authority.approve({ ...f.actor, roles: ["reviewer"] }, f.request, f.current, f.now);
  assert.throws(() => f.authority.activate({ ...f.actor, roles: ["reviewer"] }, grant.id, f.current, f.now), /forbidden/);
  assert.throws(() => f.authority.view({ ...f.actor, roles: [] }), /forbidden/);
  assert.throws(() => f.authority.approve(f.actor, { ...f.request, limits: { ...f.request.limits, credential: "synthetic-only" } as any }, f.current, f.now), /invalid_grant/);
});

test("corrupt and busy authority state fail closed without stealing a live lock", () => {
  const f = setup(), grant = f.authority.approve(f.actor, f.request, f.current, f.now);
  f.authority.activate(f.actor, grant.id, f.current, f.now);
  const lock = join(f.directory, "state.lock");
  writeFileSync(lock, JSON.stringify({ pid: process.pid, host: hostname() }));
  assert.throws(() => f.authority.authorize(f.operation, f.current, f.now), /EEXIST/);
  assert.throws(() => f.authority.storage.recoverDeadLock(), /lock_live/);
  assert.equal(existsSync(lock), true);
  const path = join(f.directory, "state.json"), value = JSON.parse(readFileSync(path, "utf8"));
  value.data.grants[0].limits.maxAmountMinor = 999999;
  writeFileSync(path, JSON.stringify(value));
  assert.throws(() => f.authority.view(f.actor), /state_invalid/);
});

test("local state commits are serialized across real processes and a crash requires explicit recovery", () => {
  const directory = mkdtempSync(join(tmpdir(), "casework-storage-"));
  const module = fileURLToPath(new URL("../src/caseworkStorage.js", import.meta.url));
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `import {CaseworkStorage} from ${JSON.stringify(new URL("file://" + module).href)}; const s=new CaseworkStorage(process.argv[1],()=>({count:0}),v=>Number.isInteger(v?.count)); s.transact(v=>{v.count++; process.exit(0)});`, directory]);
  assert.equal(child.status, 0);
  const storage = new CaseworkStorage(directory, () => ({ count: 0 }), (v): v is { count: number } => !!v && Number.isInteger((v as any).count));
  assert.throws(() => storage.transact((v) => { v.count++; }), /EEXIST/);
  storage.recoverDeadLock();
  assert.equal(storage.read().count, 0);
  storage.transact((v) => { v.count++; });
  assert.equal(storage.read().count, 1);
  assert.throws(() => storage.transact((v) => { v.count++; throw new Error("abort"); }), /abort/);
  assert.equal(storage.read().count, 1);
  assert.throws(() => storage.transact(async () => 1), /async_transaction/);
});
