import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "../src/audit.js";

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

test("QDL step: logged, replayed in a fresh session, tamper refused", { skip }, async () => {
  const { recordQdl, replayQdl } = await import("../src/qdl.js");
  const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "qdl-")), "log.jsonl"));
  const rec = await recordQdl(log, { systemId: "quote", useCase: "price", input: "part-42.step" }, { intent: quoteIntent }, { minutes: 42, rate: 4.5, budget: 200 });
  const r = await replayQdl(log, rec.id);
  console.log("replay:", JSON.stringify(r).slice(0, 200));
  assert.equal(r.reproduced, true); assert.deepEqual(r.output.slice(0, 2), [189, true]);
  assert.deepEqual(log.verifyChain(), { ok: true });
  // edit the floor literal inside the stored quine (and fix up nothing else): fresh admission must refuse it
  const lines = readFileSync(log.path, "utf8").trim().split("\n"); const q = JSON.parse(lines[1]);
  q.qdl.source = q.qdl.source.replace("150", "1"); lines[1] = JSON.stringify(q); writeFileSync(log.path, lines.join("\n") + "\n");
  assert.equal(log.verifyChain().ok, false);
  await assert.rejects(replayQdl(log, rec.id), (e: any) => e.code === "identity");
});
