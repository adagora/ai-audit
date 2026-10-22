import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AuditLog, report } from "../src/audit.js";

const skip = Number(process.versions.node.split(".")[0]) < 22 ? "Quinelings SDK needs Node >= 22" : false;
const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const v1 = JSON.parse(readFileSync(new URL("../../examples/quineling-quote/policy.json", import.meta.url), "utf8"));
const v2 = structuredClone(v1);
v2.name = "CAD machining quote policy v2";
v2.inputs.find((i: any) => i.id === "floor").value = 160;
v2.inputs.find((i: any) => i.id === "tolerance").value = 0.03;
const unitPrice = { format: "qdl-intent", version: 1, name: "Unit price", thought: "unit price = total / pieces",
  inputs: [{ id: "total", name: "total", type: { kind: "number", unit: "PLN", min: 0 } }, { id: "pieces", name: "pieces", type: { kind: "number", unit: "one", min: 0 } }],
  steps: [{ id: "unit", op: "arithmetic", inputs: ["total", "pieces"], params: { kind: "div" } }], outputs: ["unit"] };
const inputs = { minutes: 42, rate: 4.5, setup: 120, material: 85, llmPrice: 274 };
const quote = { systemId: "cad-quote", useCase: "machining-quote", input: "part" };

async function history() {
  const { recordQdl } = await import("../src/qdl.js");
  const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "policies-")), "audit.jsonl"));
  for (const intent of [v1, v1, v2, v2, v1]) await recordQdl(log, quote, { intent }, inputs);
  await recordQdl(log, { ...quote, useCase: "unit-price" }, { intent: unitPrice }, { total: 100, pieces: 4 });
  await recordQdl(log, quote, { intent: v1 }, { ...inputs, customer: "jan.kowalski@example.com" });
  return log;
}

test("versions per use case in order of first use; a rollback is the current version, not a new one; changes against the predecessor", { skip }, async () => {
  const { policyHistories, withChanges } = await import("../src/policies.js");
  const log = await history(), records = log.read() as any[];
  const [machining, unit] = policyHistories(records);
  assert.deepEqual([machining.systemId, machining.useCase, unit.useCase], ["cad-quote", "machining-quote", "unit-price"]);
  assert.deepEqual(machining.versions.map((v) => [v.version, v.name, v.decisions, v.current]),
    [[1, "CAD machining quote policy v1", 3, true], [2, "CAD machining quote policy v2", 2, false]]);
  assert.ok(machining.versions[0].lastUsed > machining.versions[1].lastUsed);
  assert.equal(unit.versions.length, 1);
  assert.deepEqual(policyHistories(records, { useCase: "unit-price" }).map((h) => h.useCase), ["unit-price"]);
  const [diffed] = await withChanges([machining], records);
  assert.equal(diffed.versions[0].changes, undefined);
  assert.deepEqual(diffed.versions[1].changes, [
    { path: "name", from: "CAD machining quote policy v1", to: "CAD machining quote policy v2" },
    { path: "nodes.floor.params.value", from: 150, to: 160 },
    { path: "nodes.tolerance.params.value", from: 0.05, to: 0.03 },
  ]);
  const [noPrograms] = await withChanges([machining], records.filter((r) => r.kind !== "program"));
  assert.equal(noPrograms.versions[1].changes, null);
  const { md, policies } = report(log, "2000", "2100");
  assert.equal(policies.length, 2); assert.match(md, /## Wersje polityk QDL/); assert.match(md, /- v1 \(aktualna\) ql_[0-9a-f]{12}… „CAD machining quote policy v1”: decyzje 3/);
});

test("ai-audit policies prints one JSON line per use case with versions and changes", { skip }, async () => {
  const log = await history();
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, "policies", "--log", log.path, ...args], { encoding: "utf8" });
  const all = run();
  assert.equal(all.status, 0, all.stderr);
  const lines = all.stdout.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((h) => [h.useCase, h.versions.length]), [["machining-quote", 2], ["unit-price", 1]]);
  assert.deepEqual(lines[0].versions[1].changes.map((c: any) => c.path), ["name", "nodes.floor.params.value", "nodes.tolerance.params.value"]);
  const one = run("--system-id", "cad-quote", "--use-case", "unit-price");
  assert.deepEqual(one.stdout.trim().split("\n").map((l) => JSON.parse(l).useCase), ["unit-price"]);
});
