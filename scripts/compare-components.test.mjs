import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assessControlledPair, compareComponents } from "./compare-components.mjs";
import { evidenceDigest } from "../dist/src/qualification.js";
import { AuditLog } from "../dist/src/audit.js";

const evaluatorRoot = process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../evalLOL/", import.meta.url));
const pythonRoot = process.env.CITYWHEELS_PYTHON_ROOT ?? fileURLToPath(new URL("../../EternalChat copy/help-desk-agent/help-desk-agent/", import.meta.url));
test("controlled pair validation refuses changed models, prompts, schemas, fixtures, missing trials and reversed arms", () => {
  const suite = { cases: [{ id: "one" }] }, options = { repetitions: 1 };
  const output = { answer: "Quote", data: { bookingFixtureHash: evidenceDigest("bookings"), knowledgeFixtureHash: evidenceDigest("knowledge"), initialModelInputHash: evidenceDigest("messages"), toolContractHash: evidenceDigest("tools"), clock: "2026-06-10T07:00:00Z", model: "fixed", evidenceDirectory: "/synthetic/evidence", audit: { chainVerified: true }, refundTool: "native" } };
  const native = { suite: { hash: evidenceDigest(suite) }, options, results: [{ caseId: "one", repetition: 0, status: "pass", output }] };
  const qdl = structuredClone(native); qdl.results[0].output.data.refundTool = "qdl";
  assert.equal(assessControlledPair(suite, native, qdl).valid, true);
  for (const field of ["model", "initialModelInputHash", "toolContractHash", "bookingFixtureHash", "knowledgeFixtureHash", "clock"]) {
    const changed = structuredClone(qdl); changed.results[0].output.data[field] = "changed";
    assert.equal(assessControlledPair(suite, native, changed).valid, false, field);
  }
  assert.equal(assessControlledPair(suite, native, native).valid, false);
  assert.equal(assessControlledPair(suite, native, { ...qdl, results: [] }).valid, false);
  assert.equal(assessControlledPair(suite, {}, {}).valid, false);
  const missing = structuredClone(qdl); delete missing.results[0].output.data;
  assert.equal(assessControlledPair(suite, native, missing).valid, false);
});

test("same Python application executes both refund tools under the same proxy and retains verified fixed-component evidence", { skip: !existsSync(join(evaluatorRoot, "dist/src/index.js")) || !existsSync(join(pythonRoot, "citywheels/agent.py")) }, async () => {
  const root = mkdtempSync(join(tmpdir(), "component-comparison-"));
  const raw = JSON.parse(readFileSync(join(evaluatorRoot, "integrations/citywheels/suite.json"), "utf8"));
  raw.cases = raw.cases.filter((c) => c.id === "refund-1002"); raw.relations = [];
  const suitePath = join(root, "suite.json"); writeFileSync(suitePath, JSON.stringify(raw));
  const output = join(root, "comparison");
  const result = await compareComponents({ evaluatorRoot, pythonRoot, suitePath, output, repetitions: 2 });
  assert.equal(result.manifest.status, "completed", JSON.stringify(result.assessment.issues));
  assert.equal(result.assessment.valid, true);
  assert.equal(result.assessment.independentCases, 1);
  assert.equal(result.assessment.repeatedTrialsPerArm, 2);
  assert.equal(result.assessment.populationEstimate, false);
  for (const arm of ["native", "qdl"]) {
    assert.equal(result.reports[arm].results.length, 2);
    for (const row of result.reports[arm].results) {
      assert.equal(row.output.data.refund.total_refund_eur, 340);
      assert.equal(row.output.data.refundTool, arm);
      assert.equal(row.output.data.bookingsUnchanged, true);
      const log = new AuditLog(row.output.data.audit.logPath);
      assert.equal(log.verifyChain().ok, true);
      assert.equal(log.read().some((record) => record.kind === "decision"), arm === "qdl");
    }
  }
  const reopened = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
  assert.equal(reopened.fixedDigest, evidenceDigest(JSON.parse(readFileSync(join(output, "fixed.json"), "utf8"))));
  assert.equal(existsSync(join(output, "comparison.json")), true);
  assert.equal(existsSync(join(output, "index.html")), true);
  await assert.rejects(() => compareComponents({ evaluatorRoot, pythonRoot, suitePath, output }), /EEXIST/);
});
