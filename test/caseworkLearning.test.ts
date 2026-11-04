import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CaseworkLearning, type LearningInput } from "../src/caseworkLearning.js";
import type { CaseworkPrincipal } from "../src/authority.js";
import { evidenceDigest } from "../src/qualification.js";

const actor = (id: string, roles: CaseworkPrincipal["roles"], tenant = "shop") => ({ id, roles, tenant });
const operator = actor("operator", ["operator"]), first = actor("first", ["labeler"]), second = actor("second", ["labeler"]), third = actor("third", ["adjudicator"]);
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "learning-")), store = new CaseworkLearning(directory);
  const input: LearningInput = { caseId: null, intent: "refund", question: "What is refundable?", answer: "340 EUR", context: { policy: "Full rental and deposit; no fee" },
    source: { family: "sample-one", kind: "representative", sampling: "random", split: "holdout", owner: "qa", reference: "sanitized-batch", sanitized: true, exposedToDevelopment: false },
    rubric: { id: "refund-correct", text: "Amount and conditions match policy", revision: "v1" }, assigned: ["first", "second"], adjudicator: "third" };
  const task = store.create(operator, input);
  return { directory, store, input, task };
}

test("blind labels survive restart and disagreement requires a distinct adjudicator", () => {
  const { directory, store, input, task } = fixture();
  store.recordJudge(operator, task.id, { name: "judge", revision: "r1", value: true, source: "frozen-run" });
  store.label(first, task.id, true);
  const view = store.assignments(second)[0];
  assert.equal(view.ownLabel, null);
  assert.equal(view.peerLabels, null);
  assert.equal("judge" in view, false);
  assert.equal(store.assignments(third)[0].peerLabels, null);
  assert.throws(() => store.adjudicate(third, task.id, false), /adjudication_not_required/);
  store.label(second, task.id, false);
  assert.throws(() => store.label(first, task.id, false), /label_locked/);
  assert.throws(() => store.publish(operator, task.id), /labels_unresolved/);
  const restarted = new CaseworkLearning(directory);
  assert.equal(restarted.assignments(third)[0].peerLabels?.length, 2);
  assert.equal(restarted.assignments(first)[0].peerLabels, null);
  const exported = restarted.calibrationInput(operator, [task.id], evidenceDigest(input.rubric), { name: "judge", revision: "r1" });
  assert.equal("adjudication" in exported.dataset.rows[0], false);
  restarted.adjudicate(third, task.id, false);
  const published = restarted.publish(operator, task.id);
  assert.equal(published.gold, false);
  assert.equal(published.representative, true);
  assert.equal(restarted.publish(operator, task.id).digest, published.digest);
  assert.throws(() => restarted.recordJudge(operator, task.id, { name: "new", revision: "r2", value: false, source: "fit" }), /gold_already_exposed/);
  assert.deepEqual(Object.keys(restarted.create(operator, input)).sort(), ["id", "snapshotDigest"]);
  assert.throws(() => restarted.create(operator, { ...input, assigned: ["other", "second"] }), /assignment_locked/);
});

test("learning roles and tenant scope cannot be supplied by task contents", () => {
  const { store, task, input } = fixture();
  assert.throws(() => store.create(first, input), /forbidden/);
  assert.throws(() => store.label(operator, task.id, true), /forbidden/);
  assert.throws(() => store.label(actor("other", ["labeler"]), task.id, true), /not_assigned/);
  assert.throws(() => store.label(actor("first", ["labeler"], "elsewhere"), task.id, true), /not_found/);
  assert.deepEqual(store.assignments(actor("first", ["labeler"], "elsewhere")), []);
  assert.throws(() => store.assignments(null as unknown as CaseworkPrincipal), /forbidden/);
  assert.throws(() => store.create(operator, { ...input, adjudicator: "first" }), /invalid_task/);
});

test("calibration rejects changed rubric, judge and development-contaminated families", () => {
  const { store, task, input } = fixture();
  store.label(first, task.id, true); store.label(second, task.id, true);
  const digest = evidenceDigest(input.rubric), judge = { name: "judge", revision: "r1" };
  assert.throws(() => store.calibrationInput(operator, [task.id], digest, judge), /judge_changed_or_missing/);
  store.recordJudge(operator, task.id, { ...judge, value: false, source: "before-gold" });
  assert.throws(() => store.calibrationInput(operator, [task.id], "changed", judge), /rubric_changed/);
  assert.throws(() => store.calibrationInput(operator, [task.id], digest, { ...judge, revision: "r2" }), /judge_changed_or_missing/);
  assert.equal(store.calibrationInput(operator, [task.id], digest, judge).dataset.rows[0].judge, false);
  store.create(operator, { ...input, answer: "Development alternative", source: { ...input.source, split: "dev", exposedToDevelopment: true } });
  assert.throws(() => store.calibrationInput(operator, [task.id], digest, judge), /not_independent_holdout/);
  assert.throws(() => store.create(operator, { ...input, answer: "New holdout" }), /holdout_contaminated/);
});

test("exporting calibration exposes family gold and blocks fitting a later judge", () => {
  const { store, task, input } = fixture();
  const judge = { name: "judge", revision: "r1" };
  store.recordJudge(operator, task.id, { ...judge, value: true, source: "frozen" });
  store.label(first, task.id, true); store.label(second, task.id, true);
  store.calibrationInput(operator, [task.id], evidenceDigest(input.rubric), judge);
  const rerun = store.create(operator, { ...input, answer: "Another answer" });
  assert.throws(() => store.recordJudge(operator, rerun.id, { ...judge, value: true, source: "after-export" }), /gold_already_exposed/);
  assert.throws(() => store.calibrationInput(operator, [task.id, rerun.id], evidenceDigest(input.rubric), judge), /repeated_source_family/);
});
