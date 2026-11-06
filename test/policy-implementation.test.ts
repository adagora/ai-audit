import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { AuditLog, canon, sha256 } from "../src/audit.js";
import { recordQdl, replayQdl } from "../src/qdl.js";
import { governorIntent } from "../src/lab.js";
import { createDecisionPackage, packageJson, verifyPortableReceipt, type DecisionPackage } from "../src/decisionPackage.js";
import { policyImplementation, POLICY_IMPLEMENTATION_FILES } from "../src/policyImplementation.js";
import { decisionReceipt } from "../src/receipt.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const compiled = fileURLToPath(new URL("../src/", import.meta.url));
const fresh = () => mkdtempSync(join(tmpdir(), "policy-implementation-"));
const resealPackage = (value: DecisionPackage) => {
  const { digest, ...payload } = value;
  value.digest = sha256(canon(payload));
  return packageJson(value);
};
const runCli = (directory: string, ...args: string[]) => spawnSync(process.execPath, [join(directory, "src/cli.js"), ...args], { cwd: directory, encoding: "utf8", timeout: 15000 });
const copyRuntime = (directory: string) => {
  cpSync(compiled, join(directory, "src"), { recursive: true });
  writeFileSync(join(directory, "package.json"), '{"type":"module"}');
};
async function receipt(directory: string) {
  const log = new AuditLog(join(directory, "audit.jsonl"));
  const { decision, step } = await recordQdl(log, { systemId: "synthetic", useCase: "governor", input: "synthetic" }, { intent: governorIntent(2) }, { failures: 2 });
  const value = await createDecisionPackage(log, decision.id);
  return { log, decision, step, value };
}

test("implementation manifest covers the complete local interpreter import closure", () => {
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const text = readFileSync(join(compiled, name), "utf8");
    assert.doesNotMatch(text, /\b(?:eval|require)\s*\(|\bimport\s*\(|\bcreateRequire\b/, name);
    for (const match of text.matchAll(/(?:from\s*|import\s*)["']\.\/([^"']+)["']/g)) visit(match[1]);
  };
  visit("policyAdapter.js");
  assert.deepEqual([...seen].sort(), [...POLICY_IMPLEMENTATION_FILES]);
  const first = policyImplementation(), second = policyImplementation();
  assert.deepEqual(second, first);
  const { digest, ...payload } = first;
  assert.equal(sha256(JSON.stringify(payload)), digest);
  first.files[0].sha256 = "0".repeat(64);
  assert.notEqual(policyImplementation().files[0].sha256, first.files[0].sha256);
});

test("receipt pins actual code and rejects changed, missing or untrusted manifest data", async () => {
  const directory = fresh();
  try {
    const { value, step } = await receipt(directory);
    assert.equal(value.version, 3);
    assert.equal(value.program.implementation.digest, step.qdl.runtime?.implementationDigest);
    const verified = await verifyPortableReceipt(packageJson(value));
    assert.deepEqual(verified.implementation, { matched: true, digest: policyImplementation().digest });
    const changed = structuredClone(value);
    changed.program.implementation.files[0].sha256 = "0".repeat(64);
    await assert.rejects(verifyPortableReceipt(resealPackage(changed)), /audit_policy_implementation_mismatch/);
    const changedDigest = structuredClone(value);
    changedDigest.program.implementation.digest = "0".repeat(64);
    await assert.rejects(verifyPortableReceipt(resealPackage(changedDigest)), /audit_policy_implementation_mismatch/);
    const injected = structuredClone(value);
    injected.program.implementation.files[0].path = "../../untrusted.js";
    await assert.rejects(verifyPortableReceipt(resealPackage(injected)), /audit_invalid_decision_package/);
    const unpinned = structuredClone(value) as any;
    delete unpinned.program.implementation;
    await assert.rejects(verifyPortableReceipt(resealPackage(unpinned)), /audit_invalid_decision_package/);
    const old = structuredClone(value) as any;
    old.version = 2;
    await assert.rejects(verifyPortableReceipt(resealPackage(old)), /audit_invalid_decision_package/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("export cannot assign an implementation to an unpinned historical decision", async () => {
  const directory = fresh();
  try {
    const { log, decision } = await receipt(directory);
    let previous = "0".repeat(64);
    const lines = log.read().map((original) => {
      const rec: any = structuredClone(original);
      delete rec.hash;
      if (rec.qdl) delete rec.qdl.runtime;
      rec.prevHash = previous;
      rec.hash = sha256(canon(rec));
      previous = rec.hash;
      return JSON.stringify(rec);
    });
    writeFileSync(log.path, lines.join("\n") + "\n");
    assert.equal(log.verifyChain().ok, true);
    await assert.rejects(replayQdl(log, decision.id), /audit_policy_implementation_missing/);
    await assert.rejects(createDecisionPackage(log, decision.id), /audit_policy_implementation_missing/);
    const view = await decisionReceipt(log, decision.id);
    assert.equal(view.policy.implementationDigest, undefined);
    assert.equal(view.policy.registry, undefined);
    assert.equal(view.verification.replay.reproduced, false);
    const cli = spawnSync(process.execPath, [join(compiled, "cli.js"), "replay", "--decision", decision.id, "--log", log.path], { encoding: "utf8" });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /audit_policy_implementation_missing/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a byte-only implementation change is rejected even when the calculation is unchanged", async () => {
  const directory = fresh();
  try {
    const { value, log, decision } = await receipt(directory);
    copyRuntime(directory);
    writeFileSync(join(directory, "receipt.json"), packageJson(value));
    const before = runCli(directory, "verify-receipt", "--input", "receipt.json");
    assert.equal(before.status, 0, before.stderr);
    appendFileSync(join(directory, "src/policyEvidence.js"), "\n");
    const after = runCli(directory, "verify-receipt", "--input", "receipt.json");
    assert.equal(after.status, 1);
    assert.match(after.stderr, /audit_policy_implementation_mismatch/);
    const exported = runCli(directory, "receipt", "--log", log.path, "--decision", decision.id, "--format", "json");
    assert.notEqual(exported.status, 0);
    assert.match(exported.stderr, /audit_policy_implementation_mismatch/);
    writeFileSync(join(directory, "policy.json"), JSON.stringify(governorIntent(2)));
    writeFileSync(join(directory, "inputs.json"), '{"failures":2}');
    const recalculated = runCli(directory, "decide", "--policy", "policy.json", "--inputs", "inputs.json", "--log", "changed.jsonl", "--system-id", "synthetic", "--use-case", "governor");
    assert.equal(recalculated.status, 0, recalculated.stderr);
    assert.deepEqual(JSON.parse(recalculated.stdout).outputs, value.run.outputs);
    const changed = new AuditLog(join(directory, "changed.jsonl")).read().find((rec) => rec.qdl) as any;
    assert.notEqual(changed.qdl.runtime.implementationDigest, value.program.implementation.digest);
    const path = join(directory, "src/policyRuntime.js");
    const original = readFileSync(path, "utf8");
    const trap = original.replace("export function evaluatePolicy(source, bindings) {", 'export function evaluatePolicy(source, bindings) { throw new Error("unexpected_execution");');
    assert.notEqual(trap, original);
    writeFileSync(path, trap);
    const beforeEvaluation = runCli(directory, "verify-receipt", "--input", "receipt.json");
    assert.equal(beforeEvaluation.status, 1);
    assert.match(beforeEvaluation.stderr, /audit_policy_implementation_mismatch/);
    assert.doesNotMatch(beforeEvaluation.stderr, /unexpected_execution/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a running process detects code changed after its manifest was loaded", () => {
  const directory = fresh();
  try {
    copyRuntime(directory);
    const script = 'import {appendFileSync} from "node:fs"; import {policyImplementation} from "./src/policyImplementation.js"; policyImplementation(); appendFileSync("src/policyRuntime.js", "\\n"); try { policyImplementation(); process.exit(1); } catch (e) { if (e.message !== "audit_policy_implementation_changed") throw e; }';
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("repeated builds in different output directories produce identical implementation bytes", { timeout: 90000 }, () => {
  const directory = fresh();
  try {
    const snapshots = [];
    for (const name of ["first", "second"]) {
      const output = join(directory, name);
      const build = spawnSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--project", join(root, "tsconfig.json"), "--outDir", output], { cwd: root, encoding: "utf8", timeout: 40000 });
      assert.equal(build.status, 0, build.stdout + build.stderr);
      snapshots.push(POLICY_IMPLEMENTATION_FILES.map((file) => ({ path: file, sha256: createHash("sha256").update(readFileSync(join(output, "src", file))).digest("hex") })));
    }
    assert.deepEqual(snapshots[0], snapshots[1]);
    assert.deepEqual(snapshots[0], policyImplementation().files);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
