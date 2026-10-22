import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog, report, sha256 } from "../src/audit.js";

const major = Number(process.versions.node.split(".")[0]);
const skip = major < 22 ? "Quinelings SDK needs Node >= 22" : false;
const n = (unit: string, x = {}) => ({ kind: "number", unit, min: 0, ...x });
export const quoteIntent = {
  format: "qdl-intent", version: 1, name: "CAD quote with floor",
  thought: "price = max(machining minutes x rate, floor); propose approval only if price <= budget",
  inputs: [{ id: "minutes", name: "minutes", type: n("min") }, { id: "rate", name: "rate", type: n("PLN*min^-1") },
    { id: "budget", name: "budget", type: n("PLN") }, { id: "floor", value: 150, type: n("PLN") }],
  steps: [{ id: "raw", op: "arithmetic", inputs: ["minutes", "rate"], params: { kind: "mul" } },
    { id: "price", op: "arithmetic", inputs: ["raw", "floor"], params: { kind: "max" } },
    { id: "ok", op: "compareValues", inputs: ["price", "budget"], params: { operator: "lte" } },
    { id: "approve", op: "action", inputs: ["ok", "price"], params: { allowed: true, action: "approve-quote" } }],
  outputs: ["price", "ok", "approve"],
};
const perPiece = { format: "qdl-intent", version: 1, name: "Unit price", thought: "unit price = total / pieces",
  inputs: [{ id: "total", name: "total", type: n("PLN") }, { id: "pieces", name: "pieces", type: n("one") }],
  steps: [{ id: "unit", op: "arithmetic", inputs: ["total", "pieces"], params: { kind: "div" } }], outputs: ["unit"] };
const quote = { minutes: 42, rate: 4.5, budget: 200 };
const entry = { systemId: "quote", useCase: "price", input: "part-42.step" };
const fresh = () => new AuditLog(join(mkdtempSync(join(tmpdir(), "qdl-")), "log.jsonl"));

test("QDL step: logged, replayed in a fresh session, tamper refused", { skip }, async () => {
  const { recordQdl, replayQdl } = await import("../src/qdl.js");
  const log = fresh();
  const { decision, step } = await recordQdl(log, entry, { intent: quoteIntent }, quote);
  assert.equal(step.qdl.status, "completed"); assert.equal(step.refId, decision.id);
  const r = await replayQdl(log, step.id);
  assert.equal(r.reproduced, true); assert.deepEqual(r.output!.slice(0, 2), [189, true]);
  assert.deepEqual(log.verifyChain(), { ok: true });
  const lines = readFileSync(log.path, "utf8").trim().split("\n"); const q = JSON.parse(lines[1]);
  q.qdl.source = q.qdl.source.replace("150", "1"); lines[1] = JSON.stringify(q); writeFileSync(log.path, lines.join("\n") + "\n");
  assert.equal(log.verifyChain().ok, false);
  await assert.rejects(replayQdl(log, step.id), (e: any) => e.message === "audit_qdl_source_invalid" && e.code === "identity");
});

test("refused, failed and invalid programs are recorded and replay as the same outcome", { skip }, async () => {
  const { recordQdl, replayQdl } = await import("../src/qdl.js");
  const log = fresh();
  const refused = await recordQdl(log, entry, { intent: quoteIntent }, { ...quote, minutes: -5 });
  assert.equal(refused.decision.output, undefined);
  assert.equal(refused.step.qdl.status, "refused"); assert.deepEqual(refused.step.qdl.error, { code: "refinement", path: "$.bindings.minutes" });
  const failed = await recordQdl(log, entry, { intent: perPiece }, { total: 100, pieces: 0 });
  assert.equal(failed.step.qdl.status, "failed"); assert.equal(failed.step.qdl.error!.code, "division-zero"); assert.match(failed.step.qdl.inputHash!, /^qi_/);
  const invented = { ...quoteIntent, steps: [...quoteIntent.steps, { id: "leak", op: "fetch", inputs: [], params: { url: "https://example.invalid" } }] };
  const invalid = await recordQdl(log, entry, { intent: invented }, quote);
  assert.equal(invalid.step.qdl.status, "refused"); assert.equal(invalid.step.qdl.error!.code, "invalid-input");
  assert.equal(invalid.step.qdl.sourceHash, undefined); assert.deepEqual(invalid.step.qdl.intent, invented); assert.match(invalid.step.qdl.intentHash!, /^[0-9a-f]{64}$/);
  for (const x of [refused, failed, invalid]) {
    const r = await replayQdl(log, x.decision.id);
    assert.equal(r.status, x.step.qdl.status); assert.equal(r.reproduced, true, x.step.qdl.status);
  }
  assert.deepEqual(log.verifyChain(), { ok: true });
});

test("llmCallId links the decision; approve and report treat the :qdl companion as a step; edited inputs do not reproduce", { skip }, async () => {
  const { recordQdl, replayQdl } = await import("../src/qdl.js");
  const log = fresh();
  const { decision, step } = await recordQdl(log, { ...entry, llmCallId: "llm-call-1" }, { intent: quoteIntent }, quote);
  assert.equal(decision.llmCallId, "llm-call-1"); assert.equal(step.llmCallId, undefined);
  assert.throws(() => log.approve(step.id, "r", "approved"), /audit_unknown_decision/);
  log.approve(decision.id, "r", "approved");
  await recordQdl(log, entry, { intent: quoteIntent }, { ...quote, minutes: -5 });
  const { stats, qdl, md } = report(log, "2000", "2100");
  assert.deepEqual([stats.decisions, stats.reviewed, stats.unreviewed, stats.withReplayableStep], [2, 1, 1, 2]);
  assert.deepEqual(qdl, { completed: 1, refused: 1, failed: 0 }); assert.match(md, /## Kroki QDL/);
  const lines = readFileSync(log.path, "utf8").trim().split("\n"), i = lines.findIndex((l) => l.includes('"qdl"'));
  const edited = JSON.parse(lines[i]); edited.qdl.inputs.rate = 3.5; lines[i] = JSON.stringify(edited);
  const copy = new AuditLog(log.path + ".edited"); writeFileSync(copy.path, lines.join("\n") + "\n");
  assert.equal(copy.verifyChain().ok, false);
  assert.equal((await replayQdl(copy, decision.id)).reproduced, false);
});

test("secrets and personal data in inputs, program or params are refused before evaluation and never stored", { skip }, async () => {
  const { recordQdl, replayQdl } = await import("../src/qdl.js");
  const log = fresh();
  const email = "jan.kowalski@example.com", key = "AKIA" + "IOSFODNN7EXAMPLQ";
  const echo = { format: "qdl-intent", version: 1, name: "Echo contact", thought: "returns the routing contact",
    inputs: [{ id: "contact", name: "contact", type: { kind: "string" } }], steps: [], outputs: ["contact"] };
  const inInputs = await recordQdl(log, { ...entry, llmCallId: "llm-call-7" }, { intent: echo }, { contact: email });
  assert.equal(inInputs.step.qdl.status, "refused"); assert.deepEqual(inInputs.step.qdl.error, { code: "audit-sensitive-input", path: "$.inputs.contact" });
  assert.deepEqual(inInputs.step.qdl.findings, [{ rule: "pii-email", path: "$.inputs.contact" }]);
  assert.deepEqual([inInputs.step.qdl.inputs, inInputs.step.qdl.intent, inInputs.decision.output, inInputs.decision.llmCallId], [undefined, undefined, undefined, "llm-call-7"]);
  const inProgram = await recordQdl(log, entry, { intent: { ...quoteIntent, thought: `use ${key} to fetch rates` } }, quote);
  assert.deepEqual(inProgram.step.qdl.findings, [{ rule: "aws-access-token", path: "$.program.thought" }]);
  const inParams = await recordQdl(log, { ...entry, params: { customer: "PESEL 44051401359" } }, { intent: quoteIntent }, quote);
  assert.deepEqual(inParams.step.qdl.findings, [{ rule: "pii-pesel", path: "$.params.customer" }]); assert.equal(inParams.decision.params, undefined);
  const raw = readFileSync(log.path, "utf8");
  for (const value of [email, key, "44051401359", "returns the routing contact"]) assert.ok(!raw.includes(value), value);
  await assert.rejects(replayQdl(log, inInputs.decision.id), /audit_qdl_not_replayable/);
  assert.deepEqual(report(log, "2000", "2100").qdl, { completed: 0, refused: 3, failed: 0 });
  const allowed = await recordQdl(log, entry, { intent: echo }, { contact: email }, new Set([sha256(email)]));
  assert.equal(allowed.step.qdl.status, "completed"); assert.deepEqual(allowed.decision.output, [email]);
  assert.equal((await replayQdl(log, allowed.decision.id)).reproduced, true);
  assert.deepEqual(log.verifyChain(), { ok: true });
});
