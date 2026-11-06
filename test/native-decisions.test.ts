import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "../src/audit.js";
import { recordQdl, replayQdl } from "../src/qdl.js";
import { createDecisionPackage, packageJson, renderDecisionSvg, verifyPortableReceipt } from "../src/decisionPackage.js";
import { governorIntent } from "../src/lab.js";
import { policyHistories, withChanges } from "../src/policies.js";
import { decisionReceipt } from "../src/receipt.js";


test("native decisions record and replay completion, refusal and computed failure", async () => {
  const dir = mkdtempSync(join(tmpdir(), "native-decisions-"));
  try {
    const log = new AuditLog(join(dir, "audit.jsonl"));
    const entry = { systemId: "native", useCase: "governor", input: "synthetic" };
    const completed = await recordQdl(log, entry, { intent: governorIntent(2) }, { failures: 2 });
    assert.equal(completed.step.qdl.status, "completed");
    assert.match(completed.step.qdl.sourceHash!, /^ap_/);
    assert.deepEqual(completed.decision.output, [true, { status: "simulated", action: "pause-session", payload: 2 }]);
    assert.equal((await replayQdl(log, completed.decision.id)).reproduced, true);
    const refused = await recordQdl(log, entry, { intent: governorIntent(2) }, { failures: -1 });
    assert.equal(refused.step.qdl.status, "refused");
    assert.equal((await replayQdl(log, refused.decision.id)).reproduced, true);
    const invalid = await recordQdl(log, entry, { intent: { ...governorIntent(2), steps: [{ id: "bad", op: "network", inputs: [], params: {} }] } }, { failures: 2 });
    assert.equal(invalid.step.qdl.status, "refused");
    assert.equal((await replayQdl(log, invalid.decision.id)).reproduced, true);
    const arithmetic = { format: "auditline-policy", version: 1, name: "division", inputs: [{ id: "zero", value: 0, type: { kind: "number", unit: "one" } }],
      steps: [{ id: "bad", op: "arithmetic", inputs: ["zero", "zero"], params: { kind: "div" } }], outputs: ["bad"] };
    const failed = await recordQdl(log, entry, { intent: arithmetic }, {});
    assert.equal(failed.step.qdl.status, "failed");
    assert.equal((await replayQdl(log, failed.decision.id)).reproduced, true);
    await recordQdl(log, entry, { intent: governorIntent(3) }, { failures: 2 });
    const histories = await withChanges(policyHistories(log.read()), log.read());
    assert.ok(histories[0].versions.some((v) => v.changes?.some((c) => c.path.includes("limit"))));
    assert.deepEqual(log.verifyChain(), { ok: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("native receipts identify runtime and reject altered source, version, inputs and SVG", async () => {
  const dir = mkdtempSync(join(tmpdir(), "native-receipt-"));
  try {
    const log = new AuditLog(join(dir, "audit.jsonl"));
    const { decision } = await recordQdl(log, { systemId: "native", useCase: "governor", input: "synthetic" }, { intent: governorIntent(2) }, { failures: 2 });
    const receipt = await createDecisionPackage(log, decision.id);
    assert.equal(receipt.version, 3);
    assert.equal(receipt.program.registry, "auditline-policy-2");
    const json = packageJson(receipt), svg = await renderDecisionSvg(receipt);
    assert.equal((await verifyPortableReceipt(json)).reproduced, true);
    assert.equal((await verifyPortableReceipt(svg)).reproduced, true);
    assert.ok(svg.includes("An Auditline policy index"));
    for (const changed of [json.replace('"version": 3', '"version": 2'), json.replace('"failures": 2', '"failures": 3'), json.replace('"registry": "auditline-policy-2"', '"registry": "other"'), svg.replace("Calculation reproduced", "Trusted calculation")]) {
      await assert.rejects(verifyPortableReceipt(changed));
    }
    await assert.rejects(verifyPortableReceipt(JSON.stringify(receipt)), /audit_package_not_as_written/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("input basis follows its binding name and remains a caller assertion", async () => {
  const dir = mkdtempSync(join(tmpdir(), "native-basis-"));
  try {
    const log = new AuditLog(join(dir, "audit.jsonl"));
    const policy = governorIntent(2);
    policy.inputs[0].id = "count";
    policy.inputs[0].basis = "testimony";
    for (const step of policy.steps) step.inputs = step.inputs.map((id) => id === "failures" ? "count" : id);
    const { decision } = await recordQdl(log, { systemId: "native", useCase: "governor", input: "synthetic" }, { intent: policy }, { failures: 2 });
    assert.deepEqual((decision.output as unknown[]).slice(0, 1), [true]);
    const receipt = await decisionReceipt(log, decision.id);
    assert.equal(receipt.inputs.recorded.find((input) => input.name === "failures")?.basis, "testimony");
    assert.match(receipt.inputs.basisNote, /caller assertions/);
    assert.match(receipt.inputs.basisNote, /not independently verified/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("real CLI records, reviews, replays and exports a native decision", () => {
  const dir = mkdtempSync(join(tmpdir(), "native-cli-"));
  try {
    const policy = join(dir, "policy.json"), inputs = join(dir, "inputs.json");
    writeFileSync(policy, JSON.stringify(governorIntent(2))); writeFileSync(inputs, '{"failures":2}');
    const cli = new URL("../src/cli.js", import.meta.url);
    const run = (...args: string[]) => {
      const result = spawnSync(process.execPath, [cli.pathname, ...args, "--log", join(dir, "audit.jsonl")], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
    };
    const decision = run("decide", "--policy", policy, "--inputs", inputs, "--system-id", "native", "--use-case", "governor").decision;
    run("approve", "--decision", decision, "--reviewer", "synthetic-reviewer", "--verdict", "approved");
    assert.equal(run("replay", "--decision", decision).reproduced, true);
    for (const format of ["json", "svg"]) {
      const file = join(dir, `receipt.${format}`);
      run("receipt", "--decision", decision, "--format", format, "--output", file);
      assert.equal(run("verify-receipt", "--input", file).reproduced, true);
      assert.ok(readFileSync(file, "utf8").includes("auditline-policy"));
    }
    run("policies");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
