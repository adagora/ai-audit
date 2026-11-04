import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "../dist/src/audit.js";
import { exportIncident } from "./incident-regression.mjs";

test("export binds independent fixtures to evidence and refuses unsafe or changed inputs", () => {
  const dir = mkdtempSync(join(tmpdir(), "incident-regression-"));
  const log = new AuditLog(join(dir, "log.jsonl"));
  const record = log.record({ systemId: "synthetic", useCase: "refund", input: "not exported", output: 342 });
  const args = { logPath: log.path, recordId: record.id, fixture: { sanitized: true, input: { question: "Refund CW-1002?" }, observation: { answer: "342 EUR" } }, expectations: { assertions: [{ id: "amount", type: "contains", value: "340 EUR" }] }, output: join(dir, "export") };
  const result = exportIncident(args);
  assert.equal(result.provenance.recordHash, record.hash);
  assert.equal(result.provenance.fixtureOrigin, "operator-supplied");
  assert.deepEqual(result.suite.cases[0].input, args.fixture.input);
  assert.deepEqual(result.suite.cases[0].assertions, args.expectations.assertions);
  assert.equal(Object.hasOwn(result.suite.cases[0], "observation"), false);
  assert.equal(readFileSync(join(args.output, "observations.json"), "utf8").includes("342 EUR"), true);
  assert.throws(() => exportIncident(args));
  assert.throws(() => exportIncident({ ...args, fixture: { ...args.fixture, sanitized: false } }), /sanitized/);
  assert.throws(() => exportIncident({ ...args, recordId: "missing" }), /existing/);
  writeFileSync(log.path, readFileSync(log.path, "utf8").replace("342", "999"));
  assert.throws(() => exportIncident({ ...args, output: join(dir, "tampered") }), /verification failed/);
});
