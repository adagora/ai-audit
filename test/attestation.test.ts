import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { AuditLog } from "../src/audit.js";
import { createAttestation, generateAttestationKeys, verifyAttestation } from "../src/attestation.js";
import { createDecisionPackage, renderDecisionSvg } from "../src/decisionPackage.js";
import { recordQdl } from "../src/qdl.js";

const policy = JSON.parse(readFileSync(new URL("../../examples/quineling-quote/policy.json", import.meta.url), "utf8"));
const inputs = { minutes: 42, rate: 4.5, setup: 120, material: 85, llmPrice: 274 };
const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const cli = (...args: string[]) => spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "decision-attestation-"));
  const log = new AuditLog(join(directory, "audit.jsonl"));
  const { decision } = await recordQdl(log, { systemId: "fixture", useCase: "quote", input: "fake quote" }, { intent: policy }, inputs);
  const privatePath = join(directory, "reviewer-private.pem"), publicPath = join(directory, "reviewer-public.pem");
  const keyId = generateAttestationKeys(privatePath, publicPath);
  return { directory, log, decision, privatePath, publicPath, keyId };
}

test("signed review binds a portable receipt to a checkpoint with a separately supplied key", async () => {
  const f = await fixture();
  await assert.rejects(createAttestation(f.log, f.decision.id, readFileSync(f.privatePath, "utf8"), "approved"), /audit_review_mismatch/);
  f.log.approve(f.decision.id, "fake reviewer", "approved", "fake note");
  const original = readFileSync(f.log.path, "utf8");
  const packageText = JSON.stringify(await createDecisionPackage(f.log, f.decision.id));
  const attestation = await createAttestation(f.log, f.decision.id, readFileSync(f.privatePath, "utf8"), "approved");
  const verified = await verifyAttestation(packageText, JSON.stringify(attestation), readFileSync(f.publicPath, "utf8"));
  assert.equal(verified.reproduced, true);
  assert.equal(verified.origin, "signed-checkpoint");
  assert.equal(verified.approval, "signed-review-record");
  assert.equal(verified.verdict, "approved");
  assert.equal(verified.keyId, f.keyId);
  assert.equal(verified.checkpoint.count, f.log.read().length);
  assert.equal(readFileSync(f.log.path, "utf8"), original);
  assert.equal(statSync(f.privatePath).mode & 0o777, 0o600);
  for (const omitted of ["fake reviewer", "fake note", "fake quote"]) assert.equal(JSON.stringify(attestation).includes(omitted), false);
  const svg = await renderDecisionSvg(JSON.parse(packageText));
  assert.equal((await verifyAttestation(svg, JSON.stringify(attestation), readFileSync(f.publicPath, "utf8"))).presentation, "matched");
});

test("attestation verification rejects changed verdict, receipt, key and fabricated approval", async () => {
  const f = await fixture();
  f.log.approve(f.decision.id, "fake reviewer", "approved");
  const packageText = JSON.stringify(await createDecisionPackage(f.log, f.decision.id));
  const attestation = await createAttestation(f.log, f.decision.id, readFileSync(f.privatePath, "utf8"), "approved");
  const publicPem = readFileSync(f.publicPath, "utf8");
  await assert.rejects(createAttestation(f.log, f.decision.id, readFileSync(f.privatePath, "utf8"), "rejected"), /audit_review_mismatch/);
  await assert.rejects(verifyAttestation(packageText, JSON.stringify({ ...attestation, review: { ...attestation.review, verdict: "rejected" } }), publicPem), /audit_attestation_signature_mismatch/);
  const changedReceipt = JSON.parse(packageText);
  changedReceipt.decision.id = "another-decision";
  await assert.rejects(verifyAttestation(JSON.stringify(changedReceipt), JSON.stringify(attestation), publicPem), /audit_package_digest_mismatch/);
  const other = await fixture();
  await assert.rejects(verifyAttestation(packageText, JSON.stringify(attestation), readFileSync(other.publicPath, "utf8")), /audit_attestation_key_mismatch/);
  await assert.rejects(verifyAttestation(packageText, JSON.stringify({ ...attestation, review: { ...attestation.review, extra: "x" } }), publicPem), /audit_invalid_attestation/);
});

test("CLI signs and verifies a reviewed decision without overwriting evidence", async () => {
  const f = await fixture();
  f.log.approve(f.decision.id, "fake reviewer", "approved");
  const receiptFile = join(f.directory, "decision.svg"), attestationFile = join(f.directory, "decision.attestation.json");
  assert.equal(cli("receipt", "--log", f.log.path, "--decision", f.decision.id, "--format", "svg", "--output", receiptFile).status, 0);
  const signed = cli("attest", "--log", f.log.path, "--decision", f.decision.id, "--verdict", "approved", "--private-key", f.privatePath, "--output", attestationFile);
  assert.equal(signed.status, 0, signed.stderr);
  const verified = cli("verify-attestation", "--input", receiptFile, "--attestation", attestationFile, "--public-key", f.publicPath);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).approval, "signed-review-record");
  const workbenchFile = join(f.directory, "signed-workbench.html");
  const workbench = cli("workbench", "--log", f.log.path, "--output", workbenchFile, "--input", receiptFile, "--attestation", attestationFile, "--public-key", f.publicPath);
  assert.equal(workbench.status, 0, workbench.stderr);
  assert.match(readFileSync(workbenchFile, "utf8"), /Signed decision checkpoint/);
  assert.match(readFileSync(workbenchFile, "utf8"), /signed review record/);
  const unrelated = await fixture();
  const mismatched = cli("workbench", "--log", unrelated.log.path, "--output", join(f.directory, "mismatched.html"), "--input", receiptFile, "--attestation", attestationFile, "--public-key", f.publicPath);
  assert.equal(mismatched.status, 2);
  assert.match(mismatched.stderr, /audit_attestation_log_mismatch/);
  const overwrite = cli("attest", "--log", f.log.path, "--decision", f.decision.id, "--verdict", "approved", "--private-key", f.privatePath, "--output", attestationFile);
  assert.equal(overwrite.status, 2);
  assert.match(overwrite.stderr, /audit_output_exists/);
  writeFileSync(f.log.path, readFileSync(f.log.path, "utf8").replace("fake reviewer", "altered reviewer"));
  const broken = cli("attest", "--log", f.log.path, "--decision", f.decision.id, "--verdict", "approved", "--private-key", f.privatePath, "--output", join(f.directory, "broken.json"));
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /audit_invalid_evidence_chain/);
});
