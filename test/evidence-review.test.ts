import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anchor, AuditLog, canon, report, sha256 } from "../src/audit.js";
import { PESEL } from "./helpers.js";

const skip = Number(process.versions.node.split(".")[0]) < 22 ? "Quinelings SDK needs Node >= 22" : false;
const policy = JSON.parse(readFileSync(new URL("../../examples/decision-receipt/policy.json", import.meta.url), "utf8"));
const inputs = { minutes: 42, rate: 4.5, proposed: 100 };
const entry = { systemId: "shop-floor", useCase: "floor-quote", input: "42 min" };
const fresh = (now?: () => string) => new AuditLog(join(mkdtempSync(join(tmpdir(), "evidence-")), "audit.jsonl"), now);

function reseal(lines: string[]) {
  let prev = "0".repeat(64);
  return lines.map((line) => {
    const rec = JSON.parse(line);
    delete rec.hash;
    rec.prevHash = prev;
    rec.hash = sha256(canon(rec));
    prev = rec.hash;
    return JSON.stringify(rec);
  });
}

test("forged main output is not an overall success, and a valid chain is not an external anchor", { skip, timeout: 60_000 }, async () => {
  const { recordQdl, verifyDecision } = await import("../src/qdl.js");
  const log = fresh();
  const { decision } = await recordQdl(log, entry, { intent: policy }, inputs);
  const anchors = log.path + ".anchors";
  anchor(log, anchors);
  const healthy = await verifyDecision(log, decision.id, { anchorsPath: anchors });
  assert.equal(healthy.ok, true);
  assert.equal(healthy.replay.reproduced, true);
  assert.equal(healthy.chain.ok, true);
  assert.equal(healthy.consistency.ok, true);
  assert.equal(healthy.anchor, "verified");
  const lines = readFileSync(log.path, "utf8").trim().split("\n");
  const i = lines.findIndex((l) => JSON.parse(l).id === decision.id);
  const forged = JSON.parse(lines[i]);
  forged.output = ["FORGED"];
  lines[i] = JSON.stringify(forged);
  writeFileSync(log.path, lines.join("\n") + "\n");
  const broken = await verifyDecision(log, decision.id);
  assert.equal(broken.ok, false);
  assert.equal(broken.replay.reproduced, true);
  assert.equal(broken.chain.ok, false);
  assert.equal(broken.consistency.reason, "output-mismatch");
  assert.equal(broken.anchor, "not-anchored");
  writeFileSync(log.path, reseal(lines).join("\n") + "\n");
  const resealed = await verifyDecision(log, decision.id);
  assert.equal(resealed.ok, false);
  assert.equal(resealed.replay.reproduced, true);
  assert.equal(resealed.chain.ok, true);
  assert.equal(resealed.consistency.ok, false);
  assert.equal(resealed.consistency.reason, "output-mismatch");
  assert.equal(resealed.anchor, "not-anchored");
  assert.equal(JSON.stringify(resealed).includes("authenticated"), false);
});

test("a later occurrence keeps the SDK diagnostic and replays as that diagnostic", { skip, timeout: 120_000 }, async () => {
  const { recordQdl, replayQdl } = await import("../src/qdl.js");
  const steps = [];
  let prev = "blob";
  for (let n = 0; n < 48; n++) { steps.push({ id: "n" + n, op: "dedupe", inputs: [prev], params: {} }); prev = "n" + n; }
  const intent = { format: "qdl-intent", version: 1, name: "trace budget", thought: "chain dedupe until the trace budget",
    inputs: [{ id: "blob", name: "blob", type: { kind: "array", element: { kind: "string" }, minLength: 1, maxLength: 1 } }],
    steps, outputs: ["n47"], repeats: 8 };
  const log = fresh();
  const { step } = await recordQdl(log, { systemId: "budget", useCase: "trace", input: "blob" }, { intent }, { blob: ["x".repeat(12000)] });
  assert.equal(step.qdl.status, "failed");
  assert.deepEqual(step.qdl.error, { code: "limit", path: "$.nodes.n35", nodeId: "n35", occurrence: 1 });
  const again = await replayQdl(log, step.refId!);
  assert.equal(again.reproduced, true);
  assert.deepEqual(again.error, step.qdl.error);
});

test("October keeps the full-log version number and counts only October", { skip, timeout: 60_000 }, async () => {
  const { recordQdl } = await import("../src/qdl.js");
  const stamps = ["2026-09-15T12:00:00.000Z", "2026-10-15T12:00:00.000Z", "2026-11-15T12:00:00.000Z"];
  let n = 0;
  const log = fresh(() => stamps[Math.min(n++, stamps.length - 1)]);
  const october = structuredClone(policy);
  october.name = "Floor quote October";
  october.inputs.find((i: any) => i.id === "floor").value = 200;
  const november = structuredClone(policy);
  november.name = "Floor quote November";
  november.inputs.find((i: any) => i.id === "floor").value = 180;
  await recordQdl(log, entry, { intent: policy }, inputs);
  await recordQdl(log, entry, { intent: october }, inputs);
  await recordQdl(log, entry, { intent: november }, inputs);
  const full = report(log, "2000-01-01", "2100-01-01");
  const period = report(log, "2026-10-01", "2026-11-01");
  const fullV2 = full.policies[0].versions.find((v) => v.name === "Floor quote October");
  const periodV2 = period.policies[0].versions.find((v) => v.name === "Floor quote October");
  assert.equal(fullV2?.version, 2);
  assert.equal(periodV2?.version, 2);
  assert.equal(periodV2?.decisions, 1);
  assert.equal(periodV2?.firstUsed, stamps[1]);
  assert.equal(periodV2?.lastUsed, stamps[1]);
  assert.equal(period.policies[0].versions.length, 1);
  assert.equal(periodV2?.current, false);
  assert.equal(full.policies[0].versions.find((v) => v.name === "Floor quote November")?.current, true);
  assert.match(period.md, /Wersje są numerowane z całego dziennika/);
  assert.match(period.md, /„aktualna” oznacza wersję ostatniej decyzji w całym dzienniku, nie ostatnią w tym oknie/);
  assert.doesNotMatch(period.md, /v2 \(aktualna\)/);
});

test("a sensitive refusal, a missing companion and a missing program are not reconstructible", { skip, timeout: 60_000 }, async () => {
  const { recordQdl, verifyDecision } = await import("../src/qdl.js");
  const { replayableQdl } = await import("../src/audit.js");
  const log = fresh();
  const good = await recordQdl(log, entry, { intent: policy }, inputs);
  const refused = await recordQdl(log, entry, { intent: policy }, { ...inputs, customer: PESEL });
  assert.equal(refused.step.qdl.status, "refused");
  assert.equal(refused.step.qdl.inputs, undefined);
  const orphan = log.record({ ...entry, input: "no companion", output: 1, qdlDecision: true });
  const other = structuredClone(policy);
  other.name = "Floor quote other";
  other.inputs.find((i: any) => i.id === "floor").value = 151;
  const dropped = await recordQdl(log, { ...entry, useCase: "other" }, { intent: other }, inputs);
  const kept = readFileSync(log.path, "utf8").trim().split("\n").filter((l) => JSON.parse(l).kind !== "program" || JSON.parse(l).id !== dropped.step.qdl.sourceHash);
  writeFileSync(log.path, reseal(kept).join("\n") + "\n");
  const recs = log.read();
  const view = report(log, "2000-01-01", "2100-01-01");
  assert.equal(replayableQdl(recs, refused.decision.id), false);
  assert.equal(replayableQdl(recs, orphan.id), false);
  assert.equal(replayableQdl(recs, dropped.decision.id), false);
  assert.equal(replayableQdl(recs, good.decision.id), true);
  assert.equal(view.stats.withReplayableStep, 1);
  assert.deepEqual(view.evidence.map((g) => g.reason).sort(), ["companion-missing", "not-reconstructible", "program-missing"]);
  assert.match(view.md, /## Niepełne dowody decyzji/);
  const missingProgram = await verifyDecision(log, dropped.decision.id);
  assert.equal(missingProgram.ok, false);
  assert.equal(missingProgram.consistency.reason, "program-missing");
  assert.equal(missingProgram.replay.reason, "audit_qdl_source_missing");
  assert.equal(missingProgram.anchor, "not-anchored");
  const missingCompanion = await verifyDecision(log, orphan.id);
  assert.equal(missingCompanion.ok, false);
  assert.equal(missingCompanion.consistency.reason, "companion-missing");
  assert.equal(missingCompanion.replay.reproduced, false);
});
