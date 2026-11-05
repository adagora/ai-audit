import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compilePolicy, recoverPolicy, evaluatePolicy, PolicyError, POLICY_LIMITS } from "../src/policyRuntime.js";

const base = () => ({ format: "auditline-policy", version: 1, name: "Unit price", inputs: [
  { id: "total", name: "total", type: { kind: "number", unit: "PLN", min: 0 } },
  { id: "pieces", name: "pieces", type: { kind: "number", unit: "one", min: 0 } },
], steps: [{ id: "unit", op: "arithmetic", inputs: ["total", "pieces"], params: { kind: "div" } }], outputs: ["unit"] });
const fault = (code: string) => (e: unknown) => e instanceof PolicyError && e.code === code;

test("native source has exact recovery and identities independent of key order", () => {
  const original = base(), artifact = compilePolicy(original);
  const other = compilePolicy(Object.fromEntries(Object.entries(original).reverse()));
  assert.equal(artifact.source, other.source);
  assert.match(artifact.id, /^ap_[a-f0-9]{64}$/);
  assert.deepEqual(recoverPolicy(artifact.source), artifact);
  assert.throws(() => recoverPolicy(" " + artifact.source), fault("policy_source_not_as_written"));
  assert.throws(() => recoverPolicy(artifact.source.replace('"version":1', '"version":1,"version":1')), fault("policy_source_not_as_written"));
  assert.throws(() => recoverPolicy('{"format":"auditline-policy","x":'), fault("policy_source"));
  assert.throws(() => recoverPolicy(" ".repeat(POLICY_LIMITS.bytes + 1)), fault("policy_limit"));
  assert.throws(() => compilePolicy({ ...original, extra: true }), fault("policy_shape"));
  assert.throws(() => compilePolicy({ ...original, format: "qdl-intent" }), fault("policy_version"));
});

test("native evaluation distinguishes refused bindings from computed failures", () => {
  const { source } = compilePolicy(base());
  assert.deepEqual(evaluatePolicy(source, { total: 120, pieces: 3 }).outputs, [40]);
  assert.throws(() => evaluatePolicy(source, { total: 120 }), fault("policy_shape"));
  assert.throws(() => evaluatePolicy(source, { total: 120, pieces: 3, ignored: true }), fault("policy_shape"));
  assert.throws(() => evaluatePolicy(source, { total: -1, pieces: 3 }), fault("policy_refinement"));
  assert.throws(() => evaluatePolicy(source, { total: "120", pieces: 3 }), fault("policy_type"));
  assert.throws(() => evaluatePolicy(source, { total: Infinity, pieces: 3 }), fault("policy_nonfinite"));
  const zero = evaluatePolicy(source, { total: 120, pieces: 0 });
  assert.equal(zero.status, "failed");
  assert.equal(zero.outputs, undefined);
  assert.deepEqual(zero.error, { code: "policy_division_by_zero", path: "$.nodes.unit.result", nodeId: "unit" });
  assert.equal(evaluatePolicy(source, { total: 120, pieces: 0 }).inputHash, zero.inputHash);
  assert.deepEqual(evaluatePolicy(source, { total: -0, pieces: 1 }).outputs, [0]);
});

test("hostile and oversized policy values refuse before execution", () => {
  const circular: any = base(); circular.inputs = [circular];
  assert.throws(() => compilePolicy(circular), fault("policy_limit"));
  assert.throws(() => compilePolicy(JSON.parse('{"__proto__":true}')), fault("policy_key"));
  assert.throws(() => compilePolicy({ ...base(), name: "a".repeat(16385) }), fault("policy_limit"));
  assert.throws(() => compilePolicy({ ...base(), steps: Array.from({ length: 65 }, () => base().steps[0]) }), fault("policy_limit"));
  const getter = Object.defineProperty(base(), "name", { enumerable: true, get() { throw new Error("getter executed"); } });
  assert.throws(() => compilePolicy(getter), fault("policy_json"));
  const changed = base(); changed.steps[0].inputs[0] = "future";
  assert.throws(() => compilePolicy(changed), fault("policy_reference"));
  changed.steps[0].inputs[0] = "unit";
  assert.throws(() => compilePolicy(changed), fault("policy_reference"));
  const unknown = base(); unknown.steps[0].op = "fetch";
  assert.throws(() => compilePolicy(unknown), fault("policy_operation"));
  const dup = base(); dup.inputs[1].name = "total";
  assert.throws(() => compilePolicy(dup), fault("policy_input"));
});

test("computed overflow and explicit integer output refinements fail", () => {
  const policy: any = base(); policy.steps[0].params.kind = "mul";
  assert.equal(evaluatePolicy(compilePolicy(policy).source, { total: Number.MAX_VALUE, pieces: 2 }).error?.code, "policy_nonfinite");
  policy.steps[0].type = { kind: "number", unit: "PLN", integer: true };
  assert.equal(evaluatePolicy(compilePolicy(policy).source, { total: Number.MAX_SAFE_INTEGER, pieces: 2 }).error?.code, "policy_refinement");
  policy.inputs[0].type.integer = true;
  assert.throws(() => evaluatePolicy(compilePolicy(policy).source, { total: 0.5, pieces: 2 }), fault("policy_refinement"));
});

test("native compilation checks numeric dimensions and boolean guards", () => {
  const policy: any = base(); policy.steps[0].params.kind = "add";
  assert.throws(() => compilePolicy(policy), fault("policy_unit"));
  policy.inputs[1].type.unit = "PLN";
  assert.deepEqual(evaluatePolicy(compilePolicy(policy).source, { total: 2, pieces: 3 }).outputs, [5]);
  policy.steps[0] = { id: "unit", op: "action", inputs: ["total", "pieces"], params: { allowed: true, action: "test" } };
  assert.throws(() => compilePolicy(policy), fault("policy_type"));
  policy.steps[0] = { id: "unit", op: "arithmetic", inputs: ["total", "pieces"], params: { kind: "mul" } };
  policy.inputs[0].type.integer = true; policy.inputs[1].type.integer = true;
  assert.equal(evaluatePolicy(compilePolicy(policy).source, { total: Number.MAX_SAFE_INTEGER, pieces: 2 }).error?.code, "policy_refinement");
});

test("trace and output expansion stop at explicit budgets", () => {
  const policy: any = { format: "auditline-policy", version: 1, name: "bounded expansion", inputs: [
    { id: "text", name: "text", type: { kind: "string" } }, { id: "yes", value: true, type: { kind: "boolean" } },
  ], steps: Array.from({ length: 62 }, (_, i) => ({ id: `copy${i}`, op: "choose", inputs: ["yes", "text", "text"], params: {} })), outputs: ["copy61"] };
  const result = evaluatePolicy(compilePolicy(policy).source, { text: "x".repeat(5000) });
  assert.equal(result.status, "failed");
  assert.equal(result.error?.code, "policy_trace_limit");
  assert.ok(Buffer.byteLength(JSON.stringify(result.trace)) < POLICY_LIMITS.traceBytes);
  policy.steps = []; policy.outputs = Array.from({ length: 16 }, () => "text");
  const expanded = evaluatePolicy(compilePolicy(policy).source, { text: "x".repeat(5000) });
  assert.equal(expanded.error?.path, "$.outputs");
  assert.equal(expanded.error?.code, "policy_limit");
});

test("machining policies preserve independently retained expected outcomes", () => {
  const fixtures = JSON.parse(readFileSync("test/fixtures/policy-runtime/expected-machining.json", "utf8"));
  assert.equal(fixtures.length, 2);
  for (const fixture of fixtures) {
    assert.equal(fixture.cases.length, 40);
    const policy = JSON.parse(readFileSync(fixture.policy, "utf8"));
    const artifact = compilePolicy(policy);
    for (const item of fixture.cases) {
      const actual = evaluatePolicy(artifact.source, item.inputs);
      assert.equal(actual.status, "completed");
      assert.deepEqual(actual.outputs, item.outputs);
      assert.deepEqual(evaluatePolicy(recoverPolicy(artifact.source).source, item.inputs), actual);
    }
  }
});

test("public rationale and input basis change identity without claiming factual verification", () => {
  const policy: any = base();
  policy.rationale = "Price per item uses the supplied cost and quantity.";
  policy.inputs[0].basis = "testimony";
  const first = compilePolicy(policy);
  assert.equal(recoverPolicy(first.source).policy.inputs[0].basis, "testimony");
  policy.inputs[0].basis = "confirmed";
  const second = compilePolicy(policy);
  assert.notEqual(first.id, second.id);
  assert.deepEqual(evaluatePolicy(first.source, { total: 120, pieces: 3 }).outputs, evaluatePolicy(second.source, { total: 120, pieces: 3 }).outputs);
  policy.inputs[0].basis = "verified-by-the-model";
  assert.throws(() => compilePolicy(policy), fault("policy_basis"));
  delete policy.inputs[0].basis;
  policy.rationale = "x".repeat(513);
  assert.throws(() => compilePolicy(policy), fault("policy_rationale"));
});

test("inspection and recovery do not execute a policy", async () => {
  const { policyRuntime } = await import("../src/policyAdapter.js");
  const { Session } = await policyRuntime();
  const session = new Session();
  const artifact = session.compile(base());
  const restored = new Session();
  restored.recover({ source: artifact.source });
  assert.deepEqual(restored.index(artifact.id), session.index(artifact.id));
  assert.equal(restored.run({ artifactId: artifact.id, requestId: "explicit-run", inputs: { total: 100, pieces: 0 } }).result.status, "failed");
  assert.deepEqual(restored.index(artifact.id), session.index(artifact.id));
});

test("seeded grammar mutation exercises native parsing and evaluation deterministically", () => {
  let seed = 123456;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let i = 0; i < 1500; i++) {
    const policy: any = base(), choice = random() % 8;
    if (choice === 0) policy.steps[0].inputs.push("unknown");
    if (choice === 1) policy.steps[0].params.kind = "execute";
    if (choice === 2) policy.inputs[0].type.min = "bad";
    if (choice === 3) policy.outputs = ["missing"];
    if (choice === 4) policy.steps[0].id = "constructor";
    try {
      const artifact = recoverPolicy(JSON.stringify(policy));
      const inputs = { total: random() % 1000, pieces: random() % 12 };
      assert.deepEqual(evaluatePolicy(artifact.source, inputs), evaluatePolicy(artifact.source, inputs));
    } catch (e) { assert.ok(e instanceof PolicyError); }
    try {
      const artifact = compilePolicy(policy);
      assert.equal(recoverPolicy(artifact.source).id, artifact.id);
      const total = random() % 1000, pieces = random() % 12;
      const result = evaluatePolicy(artifact.source, { total, pieces });
      assert.equal(result.status, pieces === 0 ? "failed" : "completed");
      if (pieces) assert.deepEqual(result.outputs, [total / pieces]);
    } catch (e) { assert.ok(e instanceof PolicyError); }
  }
});
