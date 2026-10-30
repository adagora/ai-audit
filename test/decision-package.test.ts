import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { AuditLog, canon, sha256 } from "../src/audit.js";
import { recordQdl } from "../src/qdl.js";
import { createDecisionPackage, packageJson, parseDecisionPackage, renderDecisionSvg, verifyPortableReceipt, type DecisionPackage } from "../src/decisionPackage.js";

const policy = JSON.parse(readFileSync(new URL("../../examples/quineling-quote/policy.json", import.meta.url), "utf8"));
const inputs = { minutes: 42, rate: 4.5, setup: 120, material: 85, llmPrice: 274 };
const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const cli = (...args: string[]) => spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
const reseal = (value: DecisionPackage) => {
  const { digest, ...payload } = value;
  value.digest = sha256(canon(payload));
  return value;
};
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "decision-package-"));
  const log = new AuditLog(join(directory, "audit.jsonl"));
  const result = await recordQdl(log, { systemId: "fixture", useCase: "quote", input: "private description", params: { note: "private caller assertion" } }, { intent: policy }, inputs);
  log.approve(result.decision.id, "private reviewer", "approved", "private review note");
  const bundle = await createDecisionPackage(log, result.decision.id);
  return { directory, log, result, bundle };
}

test("portable JSON and SVG reproduce in a fresh process without the original log", async () => {
  const { directory, log, result, bundle } = await fixture();
  const original = readFileSync(log.path, "utf8");
  const svg = await renderDecisionSvg(bundle);
  assert.deepEqual(parseDecisionPackage(svg), bundle);
  assert.equal((await verifyPortableReceipt(svg)).presentation, "matched");
  assert.equal((await verifyPortableReceipt(packageJson(bundle))).presentation, "not-included");
  for (const omitted of ["private description", "private caller assertion", "private reviewer", "private review note"]) assert.equal(svg.includes(omitted), false);
  assert.deepEqual(bundle.run.outputs.slice(0, 3), [394, false, false]);
  assert.match(svg, /Origin not verified/);
  assert.match(svg, /exact source and inputs/);
  assert.match(svg, /Source|Program/);
  const jsonFile = join(directory, "decision.json"), svgFile = join(directory, "decision.svg");
  const exported = cli("receipt", "--log", log.path, "--decision", result.decision.id, "--format", "json", "--output", jsonFile);
  assert.equal(exported.status, 0, exported.stderr);
  const exportedSvg = cli("receipt", "--log", log.path, "--decision", result.decision.id, "--format", "svg", "--output", svgFile);
  assert.equal(exportedSvg.status, 0, exportedSvg.stderr);
  assert.equal(readFileSync(log.path, "utf8"), original);
  writeFileSync(log.path, "original deliberately unavailable\n");
  for (const input of [jsonFile, svgFile]) {
    const verified = cli("verify-receipt", "--input", input);
    assert.equal(verified.status, 0, verified.stderr);
    const evidence = JSON.parse(verified.stdout);
    assert.equal(evidence.reproduced, true);
    assert.equal(evidence.origin, "not-verified");
    assert.equal(evidence.humanApproval, "not-verified");
  }
});

test("found by a probe: a JSON receipt verifies only as ai-audit writes it, so a number spelled another way cannot show a different input to a reader that keeps decimal digits (ADR 0059)", async () => {
  const { bundle } = await fixture();
  const written = packageJson(bundle);
  assert.equal((await verifyPortableReceipt(written + "\n")).reproduced, true);
  for (const respelled of [written.replace('"rate": 4.5', '"rate": 4.50000000000000001'), written.replace('"minutes": 42', '"minutes": 4.2e1'), JSON.stringify(bundle), written.replace('"rate": 4.5', '"rate" : 4.5')]) {
    assert.notEqual(respelled, written);
    assert.equal(parseDecisionPackage(respelled).run.inputs.rate, 4.5);
    await assert.rejects(verifyPortableReceipt(respelled), /audit_package_not_as_written/);
  }
});

test("portable verification rejects changed inputs, outputs, runtime identity, source and SVG presentation", async () => {
  const { bundle } = await fixture();
  const changed = structuredClone(bundle);
  changed.run.inputs.minutes = 2;
  await assert.rejects(verifyPortableReceipt(JSON.stringify(changed)), /audit_package_digest_mismatch/);
  await assert.rejects(verifyPortableReceipt(JSON.stringify(reseal(changed))), /audit_package_replay_failed/);
  const output = structuredClone(bundle);
  output.run.outputs[0] = 1;
  output.run.outputsHash = sha256(canon(output.run.outputs));
  await assert.rejects(verifyPortableReceipt(JSON.stringify(reseal(output))), /audit_package_replay_failed/);
  const runtime = structuredClone(bundle);
  runtime.program.registryDigest = "0".repeat(64);
  await assert.rejects(verifyPortableReceipt(JSON.stringify(reseal(runtime))), /audit_package_runtime_mismatch/);
  const source = structuredClone(bundle);
  source.program.sourceHash = "ql_" + "0".repeat(64);
  await assert.rejects(verifyPortableReceipt(JSON.stringify(reseal(source))), /audit_package_source_mismatch/);
  const svg = await renderDecisionSvg(bundle);
  await assert.rejects(verifyPortableReceipt(svg.replace("Origin not verified", "Approved by everyone")), /audit_package_presentation_mismatch/);
  await assert.rejects(verifyPortableReceipt(svg.replace("</svg>", '<script>alert(1)</script></svg>')), /audit_package_presentation_mismatch/);
  assert.throws(() => parseDecisionPackage('{"format":"unknown"}'), /audit_invalid_decision_package/);
  assert.throws(() => parseDecisionPackage('{"format":"ai-audit-decision-package'), /audit_invalid_decision_package/);
  assert.throws(() => parseDecisionPackage(JSON.stringify(bundle).replace('"version":1', '"version":1,"version":1')), /audit_invalid_decision_package/);
  assert.throws(() => parseDecisionPackage(JSON.stringify({ ...bundle, prompt: "unexpected field" })), /audit_invalid_decision_package/);
});

test("a rehashed origin claim remains explicitly unverified", async () => {
  const { bundle } = await fixture();
  bundle.origin.decisionHash = "0".repeat(64);
  bundle.decision.id = "invented-id";
  const result = await verifyPortableReceipt(packageJson(reseal(bundle)));
  assert.equal(result.reproduced, true);
  assert.equal(result.origin, "not-verified");
  assert.equal(result.humanApproval, "not-verified");
});

test("receipt HTML offers offline downloads and export cannot replace the audit log", async () => {
  const { log, result } = await fixture();
  const original = readFileSync(log.path, "utf8");
  const rendered = cli("receipt", "--log", log.path, "--decision", result.decision.id);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.match(rendered.stdout, /Download SVG with replay data/);
  assert.match(rendered.stdout, /Download replay JSON/);
  const downloads = [...rendered.stdout.matchAll(/href="data:([^,]+),([^"]+)"/g)];
  assert.equal(downloads.length, 2);
  for (const download of downloads) {
    const text = download[1].endsWith(";base64") ? Buffer.from(download[2], "base64").toString("utf8") : decodeURIComponent(download[2]);
    assert.equal((await verifyPortableReceipt(text)).reproduced, true);
  }
  const overwrite = cli("receipt", "--log", log.path, "--decision", result.decision.id, "--format", "svg", "--output", log.path);
  assert.equal(overwrite.status, 2);
  assert.match(overwrite.stderr, /audit_output_exists/);
  assert.equal(readFileSync(log.path, "utf8"), original);
  const invalid = cli("receipt", "--log", log.path, "--decision", result.decision.id, "--format", "pdf");
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /audit_invalid_format/);
});

test("sharing refuses broken evidence, incomplete decisions and sensitive retained inputs", async () => {
  const { log, result } = await fixture();
  const original = readFileSync(log.path, "utf8");
  writeFileSync(log.path, original.replace('"minutes":42', '"minutes":43'));
  await assert.rejects(createDecisionPackage(log, result.decision.id), /audit_invalid_evidence_chain/);
  writeFileSync(log.path, original);
  const refused = await recordQdl(log, { systemId: "fixture", useCase: "quote", input: "bad input" }, { intent: policy }, { ...inputs, minutes: -1 });
  await assert.rejects(createDecisionPackage(log, refused.decision.id), /audit_package_requires_completed_decision/);
  const notePolicy = { format: "qdl-intent", version: 1, name: "Echo", thought: "return input", inputs: [{ id: "note", name: "note", type: { kind: "string" } }], steps: [], outputs: ["note"] };
  const email = "private@example.com";
  const sensitive = await recordQdl(log, { systemId: "fixture", useCase: "echo", input: "sensitive" }, { intent: notePolicy }, { note: email }, new Set([sha256(email)]));
  assert.equal(sensitive.step.qdl.status, "completed");
  await assert.rejects(createDecisionPackage(log, sensitive.decision.id), /audit_package_sensitive_data/);
});
