import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CaseworkRegression, type RegressionAssertion } from "../src/caseworkRegression.js";
import type { CaseworkPrincipal } from "../src/authority.js";
import { evidenceDigest } from "../src/qualification.js";
const operator: CaseworkPrincipal = { tenant: "shop", id: "author", roles: ["operator"] };
const reviewer: CaseworkPrincipal = { tenant: "shop", id: "reviewer", roles: ["labeler"] };
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "regression-")), store = new CaseworkRegression(directory);
  const input = { source: { caseId: "old-case", taskId: "human-task", publicationDigest: "a".repeat(64), observationDigest: "b".repeat(64), gold: false }, evidence: { policy: "Verified policy" }, intent: "refund", input: { question: "Refund CW-1002?" }, reviewer: reviewer.id,
    assertions: [{ id: "amount", type: "contains", value: "340", severity: "critical" }] as RegressionAssertion[] };
  return { directory, store, input };
}
test("regression expectations require separate immutable review and retain exact rerun linkage", () => {
  const { directory, store, input } = fixture(), r = store.create(operator, input);
  assert.equal(r.suite.cases[0].split, "test");
  assert.equal(Object.hasOwn(r.suite.cases[0].input as object, "assertions"), false);
  assert.throws(() => store.executable(operator, r.id), /review_required/);
  assert.throws(() => store.review({ ...operator, roles: ["labeler"] }, r.id, true, "Self review"), /not_assigned/);
  store.review(reviewer, r.id, true, "Checked independent booking and policy facts");
  assert.throws(() => store.review(reviewer, r.id, false, "Change"), /review_locked/);
  const restarted = new CaseworkRegression(directory), approved = restarted.executable(operator, r.id);
  const run = { runId: "new-run", reportDigest: "c".repeat(64), targetRevision: "d".repeat(64), target: "python" as const, passed: true, at: new Date().toISOString(), caseIds: ["new-case"] };
  assert.throws(() => restarted.recordRun(operator, r.id, run, "changed"), /suite_changed/);
  restarted.recordRun(operator, r.id, run, evidenceDigest(approved.suite));
  restarted.recordRun(operator, r.id, run, evidenceDigest(approved.suite));
  assert.equal(restarted.get(operator, r.id).runs.length, 1);
  assert.equal(restarted.get(operator, r.id).source.caseId, "old-case");
  assert.throws(() => restarted.recordRun(operator, r.id, { ...run, passed: false }, evidenceDigest(approved.suite)), /run_conflict/);
  assert.throws(() => restarted.get({ ...operator, tenant: "elsewhere" }, r.id), /not_found/);
});
test("regressions reject copied target assertions, vacuous checks and unreviewed execution", () => {
  const { store, input } = fixture();
  assert.throws(() => store.create(operator, { ...input, reviewer: operator.id }), /invalid_fixture/);
  assert.throws(() => store.create(operator, { ...input, input: { question: "x", assertions: [] } }), /invalid_fixture/);
  for (const assertions of [[], [{ id: "empty", type: "contains", value: "", severity: "critical" }], [{ id: "inverted", type: "range", min: 4, max: 1, severity: "critical" }]]) {
    assert.throws(() => store.create(operator, { ...input, assertions: assertions as RegressionAssertion[] }), /invalid_/);
  }
  const r = store.create(operator, input);
  assert.deepEqual(store.assignments({ ...reviewer, tenant: "elsewhere" }), []);
  store.review(reviewer, r.id, false, "Expected amount lacks verified facts");
  assert.throws(() => store.executable(operator, r.id), /review_required/);
});
