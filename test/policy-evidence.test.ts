import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compilePolicy, evaluatePolicy, PolicyError, type NativePolicy } from "../src/policyRuntime.js";

const policy = (): NativePolicy => JSON.parse(readFileSync("examples/evidence-policy/policy.json", "utf8"));
const record = (id: string, changes: Record<string, unknown> = {}) => ({ id, source: "review-a", claim: "release-eligible", value: true, kind: "observation", observedAt: 900, revision: 2, ...changes });
const clock = { now: 1000 };
const run = (evidence: unknown[], changes: Record<string, unknown> = {}, p = policy()) => evaluatePolicy(compilePolicy(p).source, { evidence, clock, amount: 250, ...changes });
const outputs = (evidence: unknown[], changes: Record<string, unknown> = {}, p = policy()) => {
  const result = run(evidence, changes, p);
  assert.equal(result.status, "completed", JSON.stringify(result.error));
  return result.outputs as [Record<string, any>, boolean, { status: string }];
};
const fault = (code: string) => (e: unknown) => e instanceof PolicyError && e.code === code;

test("current, stale and conflicting reviews gate a simulated action", () => {
  const cases = JSON.parse(readFileSync("examples/evidence-policy/cases.json", "utf8"));
  for (const item of cases) {
    const result = evaluatePolicy(compilePolicy(policy()).source, item.inputs);
    assert.equal(result.status, "completed");
    const [assessment, allowed, action] = result.outputs as any[];
    assert.equal(assessment.state, item.expectedState);
    assert.equal(allowed, item.expectedAllowed);
    assert.equal(action.status, allowed ? "simulated" : "skipped");
    assert.deepEqual(evaluatePolicy(compilePolicy(policy()).source, item.inputs), result);
  }
});

test("freshness and revision boundaries are inclusive and skip reasons have fixed precedence", () => {
  const records = [record("boundary"), record("stale", { observedAt: 899 }), record("future", { observedAt: 1001 }),
    record("old-revision", { revision: 1 }), record("unknown", { value: null, observedAt: 1001 }),
    record("kind", { kind: "testimony", value: null }), record("source", { source: "not-allowed", kind: "testimony" }),
    record("claim", { claim: "other", source: "not-allowed" })];
  const [assessment, allowed] = outputs(records);
  assert.deepEqual(assessment.used.map((r: any) => r.id), ["boundary"]);
  assert.deepEqual(assessment.skipped.map((s: any) => [s.record.id, s.reason]), [
    ["stale", "stale"], ["future", "future"], ["old-revision", "revision"], ["unknown", "unknown"], ["kind", "kind"], ["source", "source"], ["claim", "claim"],
  ]);
  assert.equal(allowed, false);
  assert.equal(assessment.support, 1);
  const instant = policy(); instant.steps[0].params.maxAge = 0;
  assert.equal(outputs([record("same-tick", { observedAt: 1000 })], {}, instant)[0].used.length, 1);
});

test("unknown and refuted evidence never authorize; contradictions are retained", () => {
  assert.equal(outputs([])[0].state, "unknown");
  assert.equal(outputs([record("unknown", { value: null })])[0].state, "unknown");
  assert.equal(outputs([record("no", { value: false })])[0].state, "refuted");
  const [sameSource, allowed] = outputs([record("yes"), record("no", { value: false, revision: 3 })]);
  assert.equal(sameSource.state, "conflict");
  assert.deepEqual([sameSource.support, sameSource.refute, sameSource.sources], [1, 1, 1]);
  assert.deepEqual(sameSource.sourceConflicts, ["review-a"]);
  assert.equal(allowed, false);
  const [differentSources] = outputs([record("yes"), record("no", { source: "review-b", value: false })]);
  assert.equal(differentSources.state, "conflict");
  assert.deepEqual(differentSources.sourceConflicts, []);
  assert.equal(outputs([record("old", { observedAt: 899 })])[0].state, "unknown");
  const [expiredNegative, permitted] = outputs([record("yes"), record("second", { source: "review-b" }), record("expired-no", { value: false, observedAt: 899 })]);
  assert.equal(expiredNegative.state, "supported");
  assert.equal(permitted, true);
  assert.equal(expiredNegative.skipped[0].reason, "stale");
});

test("multiple records from one source cannot satisfy a distinct-source threshold", () => {
  const [assessment, allowed] = outputs([record("a"), record("a-again")]);
  assert.equal(assessment.used.length, 2);
  assert.equal(assessment.support, 1);
  assert.equal(allowed, false);
  assert.equal(outputs([record("a"), record("b", { source: "review-b" })])[1], true);
  const p = policy(); p.steps[1].params.minSources = 1;
  assert.equal(outputs([record("a")], {}, p)[1], true);
  assert.equal(outputs([record("a"), record("negative", { value: false })], {}, p)[1], false);
});

test("malformed evidence and clocks refuse before evaluation", () => {
  for (const bad of [record("a", { value: "true" }), record("a", { kind: "guess" }), record("a", { observedAt: -1 }), record("a", { revision: 0.5 }), record("a", { extra: true })]) {
    assert.throws(() => run([bad]), (e) => e instanceof PolicyError);
  }
  assert.throws(() => run([record("duplicate"), record("duplicate")]), fault("policy_evidence"));
  assert.throws(() => run(Array.from({ length: 129 }, (_, i) => record(`row${i}`))), fault("policy_evidence"));
  for (const bad of [{ now: -1 }, { now: 0.1 }, {}, { ...clock, extra: true }, { ...clock, maxAge: 100000 } ]) {
    assert.throws(() => run([], { clock: bad }), (e) => e instanceof PolicyError);
  }
  assert.throws(() => run([], { clock: { ...clock, now: Infinity } }), fault("policy_nonfinite"));
});

test("evidence rules require version 2 and a derived result, with explicit sources and quorum", () => {
  const old = policy(); old.version = 1;
  assert.throws(() => compilePolicy(old), fault("policy_version"));
  for (const params of [{ allowedKinds: [], allowedSources: ["review-a"] }, { allowedKinds: ["observation"], allowedSources: [] },
    { allowedKinds: ["observation", "observation"], allowedSources: ["review-a"] }, { allowedKinds: ["observation"], allowedSources: ["review-a", "review-a"] }]) {
    const p = policy(); p.steps[0].params = { ...p.steps[0].params, ...params };
    assert.throws(() => compilePolicy(p), fault("policy_evidence_parameters"));
  }
  const forged = policy(); forged.steps[1].inputs = ["amount"];
  assert.throws(() => compilePolicy(forged), fault("policy_type"));
  for (const value of [0, 129, 1.5, "2"]) {
    const p = policy(); p.steps[1].params.minSources = value;
    assert.throws(() => compilePolicy(p), fault("policy_evidence_parameters"));
  }
  for (const changes of [{ maxAge: -1 }, { minRevision: 0.5 }, { maxAge: Number.MAX_SAFE_INTEGER + 1 }]) {
    const p = policy(); Object.assign(p.steps[0].params, changes);
    assert.throws(() => compilePolicy(p), fault("policy_evidence_parameters"));
  }
});

test("a changed recorded clock changes the decision, never the policy identity", () => {
  const artifact = compilePolicy(policy());
  const evidence = [record("a"), record("b", { source: "review-b" })];
  const current = evaluatePolicy(artifact.source, { evidence, clock, amount: 250 });
  const later = evaluatePolicy(artifact.source, { evidence, clock: { ...clock, now: 1001 }, amount: 250 });
  assert.equal(current.outputs?.[1], true);
  assert.equal(later.outputs?.[1], false);
  assert.notEqual(current.inputHash, later.inputHash);
  assert.equal(compilePolicy(policy()).id, artifact.id);
  assert.throws(() => evaluatePolicy(artifact.source, { evidence, clock: { now: 1001, maxAge: 10000 }, amount: 250 }), fault("policy_shape"));
  const relaxed = policy(); relaxed.steps[0].params.maxAge = 10000;
  const changedRule = compilePolicy(relaxed);
  assert.notEqual(changedRule.id, artifact.id);
  assert.equal(evaluatePolicy(changedRule.source, { evidence, clock: { now: 1001 }, amount: 250 }).outputs?.[1], true);
});

test("maximum evidence cardinality and safe-integer clock boundaries remain explicit", () => {
  const p = policy();
  p.steps[0].params.allowedSources = Array.from({ length: 128 }, (_, i) => `source-${i}`);
  p.steps[1].params.minSources = 128;
  const records = Array.from({ length: 128 }, (_, i) => record(`r${i}`, { source: `source-${i}` }));
  const [assessment, allowed] = outputs(records, {}, p);
  assert.equal(assessment.support, 128);
  assert.equal(allowed, true);
  const limit = Number.MAX_SAFE_INTEGER;
  const edge = policy(); edge.steps[0].params.maxAge = 1; edge.steps[0].params.minRevision = limit;
  assert.equal(outputs([record("edge", { observedAt: limit - 1, revision: limit })], { clock: { now: limit } }, edge)[0].used.length, 1);
  assert.throws(() => run([], { clock: { ...clock, now: limit + 1 } }), fault("policy_evidence_clock"));
});

test("evidence expansion cannot exceed output or trace budgets and publishes no partial outputs", () => {
  const records = Array.from({ length: 128 }, (_, i) => record(`r${i}`.padEnd(64, "x")));
  const trace = policy();
  const node = trace.steps[0];
  trace.steps = Array.from({ length: 12 }, (_, i) => ({ ...node, id: `assessment${i}` }));
  trace.outputs = ["assessment11"];
  const traceFailure = run(records, {}, trace);
  assert.equal(traceFailure.status, "failed");
  assert.equal(traceFailure.error?.code, "policy_trace_limit");
  assert.equal(traceFailure.outputs, undefined);
  const output = policy(); output.steps = [output.steps[0]];
  output.outputs = Array.from({ length: 4 }, () => "assessment");
  const outputFailure = run(records, {}, output);
  assert.equal(outputFailure.status, "failed");
  assert.equal(outputFailure.error?.code, "policy_limit");
  assert.equal(outputFailure.error?.path, "$.outputs");
  assert.equal(outputFailure.outputs, undefined);
});

test("seeded evidence mutations agree with an independent set-based oracle", () => {
  let seed = 773;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const artifact = compilePolicy(policy());
  for (let i = 0; i < 1500; i++) {
    const records = Array.from({ length: next() % 10 }, (_, n) => record(`r${n}`, { source: next() % 2 ? "review-a" : "review-b", value: next() % 3 === 0 ? null : next() % 2 === 0,
      observedAt: 880 + next() % 140, revision: next() % 4, kind: next() % 3 ? "observation" : "inference" }));
    const eligible = records.filter((r) => r.kind === "observation" && r.value !== null && r.observedAt <= 1000 && r.observedAt >= 900 && r.revision >= 2);
    const yes = new Set(eligible.filter((r) => r.value).map((r) => r.source)), no = new Set(eligible.filter((r) => !r.value).map((r) => r.source));
    const expected = yes.size && no.size ? "conflict" : yes.size ? "supported" : no.size ? "refuted" : "unknown";
    const result = evaluatePolicy(artifact.source, { evidence: records, clock, amount: 250 });
    const [assessment, allowed] = result.outputs as any[];
    assert.equal(assessment.state, expected);
    assert.equal(assessment.support, yes.size);
    assert.equal(assessment.refute, no.size);
    assert.equal(allowed, expected === "supported" && yes.size >= 2);
  }
});
