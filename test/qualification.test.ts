import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { COMPONENTS, evidenceDigest, evidenceJson, QualificationStore, type QualificationPackage } from "../src/qualification.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "qualification-"));
  mkdirSync(join(root, "release"));
  writeFileSync(join(root, "release", "app.js"), "export const version = 1;\n");
  const store = new QualificationStore(join(root, "evidence"));
  const component = store.capture(root, ["release"]);
  const components = Object.fromEntries(COMPONENTS.map((name) => [name, component]));
  const suite = { schemaVersion: 1, name: "refund", version: "1", cases: [{ id: "one", intent: "refund", split: "holdout", input: { question: "refund" }, assertions: [{ id: "amount", type: "equals", value: 340 }] }] };
  const report = { schemaVersion: 1, suite: { hash: evidenceDigest(suite) }, target: { revision: "release-1" }, options: { repetitions: 1 }, passed: true, gates: [], results: [{ caseId: "one", intent: "refund", split: "holdout", repetition: 0, status: "pass", checks: [{ id: "amount", status: "pass", severity: "critical" }] }] };
  const suiteRef = store.put(JSON.stringify(suite));
  const input: Omit<QualificationPackage, "format" | "version" | "createdAt" | "digest"> = {
    intent: "refund", targetRevision: "release-1", coverage: { maximumTier: "contain", actions: ["deliver-answer"] }, components, model: { provider: "fake", name: "scripted", immutableRevision: "1" },
    suite: suiteRef, report: store.put(JSON.stringify(report)), calibration: null,
    provenance: { kind: "representative", owner: "qa", sampling: "random", source: "reviewed-case-export", independentReview: { reviewers: ["a", "b"], datasetDigest: suiteRef.digest, rubricDigest: component.digest } },
  };
  const current = { targetRevision: input.targetRevision, components, model: input.model };
  return { root, store, input, current, suite, report };
}

test("evidence identities match IntentGauge canonical ordering including integer-like object keys", () => {
  const value = { input: { "2": "b", "10": "a" } };
  const canonical = '{"input":{"10":"a","2":"b"}}';
  assert.equal(evidenceJson(value), canonical);
  assert.equal(evidenceDigest(value), createHash("sha256").update(canonical).digest("hex"));
  assert.throws(() => evidenceDigest({ x: undefined }));
  assert.throws(() => evidenceDigest({ x: Infinity }));
  assert.throws(() => evidenceDigest(new Array(2)));
});

test("qualification reopens exact snapshots, remains unapproved and requires current release identity", () => {
  const { root, store, input, current, report } = fixture();
  const value = store.create(input);
  const reopened = new QualificationStore(join(root, "evidence"));
  assert.deepEqual(reopened.load(value.digest), value);
  assert.equal(reopened.list().length, 1);
  const assessment = reopened.inspect(value, current);
  assert.equal(assessment.readyForApproval, true);
  assert.equal(assessment.approval, "not-recorded");
  assert.equal(reopened.inspect(value).readyForApproval, false);
  assert.ok(reopened.inspect(value).issues.includes("current-release-not-checked"));
  writeFileSync(join(root, "release", "app.js"), "export const version = 2;\n");
  const changed = reopened.capture(root, ["release"]);
  assert.equal(reopened.inspect(value, { ...current, components: { ...current.components, application: changed } }).applicable, false);
  assert.equal(reopened.inspect(value, { ...current, model: { ...current.model, name: "other" } }).applicable, false);
  assert.equal(reopened.inspect(value, { ...current, targetRevision: "other" }).applicable, false);
});

test("snapshot identity includes full relative paths and dependency bytes", () => {
  const { root, store } = fixture();
  mkdirSync(join(root, "release", "a")); mkdirSync(join(root, "release", "b"));
  writeFileSync(join(root, "release", "a", "same.js"), "A"); writeFileSync(join(root, "release", "b", "same.js"), "B");
  const first = store.capture(root, ["release"]);
  writeFileSync(join(root, "release", "b", "same.js"), "A"); writeFileSync(join(root, "release", "a", "same.js"), "B");
  const second = store.capture(root, ["release"]);
  assert.notEqual(first.digest, second.digest);
  assert.equal(first.files.length, 3);
  assert.equal(store.capture(root, ["release", "release/app.js"]).digest, second.digest);
});

test("capture refuses symlinks, traversal, credentials and real traffic paths", () => {
  const { root, store } = fixture();
  symlinkSync(join(root, "release"), join(root, "linked"));
  writeFileSync(join(root, ".env"), "SECRET=not-a-real-key");
  for (const name of ["../outside", "release/../release/app.js", "linked/app.js", ".env", "live/test.jsonl", "key.pem"]) assert.throws(() => store.capture(root, [name]));
});

test("corrupt or missing bytes never qualify even when the report says passed", () => {
  const { root, store, input, current, report } = fixture();
  const value = store.create(input);
  writeFileSync(join(root, "evidence", "blobs", value.report.digest), "{}");
  assert.equal(store.inspect(value, current).integrity, false);
  assert.equal(store.inspect(value, current).readyForApproval, false);
  assert.throws(() => store.put(JSON.stringify(report)), /immutable_conflict|blob_digest/);
});

test("package edits, duplicate JSON keys and mismatched report identities are rejected", () => {
  const { store, root, input, current, report } = fixture();
  const value = store.create(input);
  const mutated = { ...value, targetRevision: "changed" };
  assert.equal(store.inspect(mutated, current).integrity, false);
  writeFileSync(join(root, "evidence", "packages", value.digest + ".json"), JSON.stringify(mutated));
  assert.throws(() => store.load(value.digest), /package_digest/);
  for (const bytes of [JSON.stringify({ ...report, target: { revision: "wrong" } }), '{"schemaVersion":1,"schemaVersion":2}']) {
    const v = store.create({ ...input, report: store.put(bytes) });
    assert.equal(store.inspect(v, current).readyForApproval, false);
  }
});

test("incomplete, duplicated, skipped-critical and failing results cannot qualify", () => {
  const { store, input, current, report } = fixture();
  const row = report.results[0];
  for (const changes of [
    { results: [] }, { results: [row, row] }, { options: { repetitions: 2 } },
    { results: [{ ...row, status: "fail" }] },
    { results: [{ ...row, checks: [{ id: "amount", status: "skip", severity: "critical" }] }] },
    { results: [{ ...row, caseId: "unknown" }] }, { results: [{ ...row, intent: "other" }] },
    { gates: [{ passed: false }] }, { passed: false },
  ]) {
    const value = store.create({ ...input, report: store.put(JSON.stringify({ ...report, ...changes })) });
    assert.equal(store.inspect(value, current).readyForApproval, false, JSON.stringify(changes));
  }
});

test("synthetic and risk-selected runs never claim independent representative qualification", () => {
  const { store, input, current } = fixture();
  for (const provenance of [
    { ...input.provenance, kind: "synthetic" as const },
    { ...input.provenance, independentReview: null },
    { ...input.provenance, sampling: "risk-selected" as const },
    { ...input.provenance, independentReview: { ...input.provenance.independentReview!, datasetDigest: "0".repeat(64) } },
    { ...input.provenance, independentReview: { ...input.provenance.independentReview!, rubricDigest: "0".repeat(64) } },
  ]) {
    const value = store.create({ ...input, provenance });
    const result = store.inspect(value, current);
    assert.equal(result.evidencePassed, true);
    assert.equal(result.representative, false);
    assert.equal(result.readyForApproval, false);
  }
});

test("judge scoring needs matching eligible calibration, while deterministic checks need no judge", () => {
  const { store, input, current, report } = fixture();
  const judge = { name: "judge", revision: "1" };
  const judgedReport = store.put(JSON.stringify({ ...report, judge }));
  const missing = store.create({ ...input, report: judgedReport });
  assert.ok(store.inspect(missing, current).issues.includes("missing-judge-calibration"));
  const calibration = store.put(JSON.stringify({ datasetDigest: input.suite.digest, rubricDigest: input.components.rubric!.digest, report: { judge, eligible: true, slices: [{ intent: "refund", eligible: true, unresolved: 0 }] } }));
  const calibrated = store.create({ ...input, report: judgedReport, calibration });
  assert.equal(store.inspect(calibrated, current).readyForApproval, true);
  assert.equal(store.inspect(store.create(input), current).readyForApproval, true);
});

test("package readers do not follow a substituted blob symlink", () => {
  const { root, store, input, current } = fixture();
  const value = store.create(input);
  const path = join(root, "evidence", "blobs", value.report.digest);
  const copy = join(root, "copy"); writeFileSync(copy, readFileSync(path));
  const ref = store.put("separate");
  const target = join(root, "evidence", "blobs", ref.digest);
  assert.ok(readFileSync(target).length > 0);
  symlinkSync(copy, join(root, "evidence", "blobs", "0".repeat(64)));
  assert.throws(() => store.read({ digest: "0".repeat(64), bytes: value.report.bytes }));
  assert.equal(store.inspect(value, current).integrity, true);
});
