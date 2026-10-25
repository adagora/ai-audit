import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anchor, AuditLog, canon, sha256 } from "../src/audit.js";
import { mockUpstream, startProxy } from "./helpers.js";

const skip = Number(process.versions.node.split(".")[0]) < 22 ? "Quinelings SDK needs Node >= 22" : false;
const policy = JSON.parse(readFileSync(new URL("../../examples/decision-receipt/policy.json", import.meta.url), "utf8"));
const inputs = { minutes: 42, rate: 4.5, proposed: 100 };
const fresh = () => new AuditLog(join(mkdtempSync(join(tmpdir(), "receipt-")), "audit.jsonl"));

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

function plain(name: string, floor: number) {
  const intent = structuredClone(policy);
  intent.name = name;
  intent.thought = "price = max(minutes x rate, floor)";
  intent.inputs.find((i: any) => i.id === "floor").value = floor;
  return intent;
}

test("a floor receipt and a confirmed-or-estimated receipt keep the same step values", { skip, timeout: 90_000 }, async () => {
  const { recordQdl } = await import("../src/qdl.js");
  const { decisionReceipt, renderReceipt, stepForRegion } = await import("../src/receipt.js");
  const up = await mockUpstream();
  const px = await startProxy(up.url, "redact");
  const email = "ada.quote@example.com";
  try {
    const sent = await fetch(px.url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-x", messages: [
      { role: "user", content: `Quote this job for ${email}` },
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "quineling_v1_run", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: JSON.stringify({ error: { code: "refinement", path: "$.bindings.minutes", message: "below minimum" } }) },
    ] }) });
    assert.equal(sent.status, 200);
    await sent.text();
    const llmCallId = sent.headers.get("x-request-id");
    assert.ok(llmCallId);
    const log = px.log;
    const first = await recordQdl(log, { systemId: "shop-floor", useCase: "floor-quote", llmCallId, input: "42 min", params: { note: "caller note" } }, { intent: plain("Floor quote plain", 150) }, inputs);
    log.approve(first.decision.id, "Ada Quote", "approved", "synthetic approval");
    const similar = await recordQdl(log, { systemId: "shop-floor", useCase: "floor-quote", input: "42 min" }, { intent: plain("Floor quote plain 151", 151) }, inputs);
    assert.notEqual(first.step.qdl.sourceHash, similar.step.qdl.sourceHash);
    const anchors = log.path + ".anchors";
    anchor(log, anchors);
    const floor = await decisionReceipt(log, first.decision.id, { anchorsPath: anchors });
    const html = renderReceipt(floor);
    for (const heading of ["LLM call", "Input snapshot", "Policy", "Calculation", "Review", "Verification"]) assert.match(html, new RegExp(`<h2>${heading}</h2>`));
    assert.equal(floor.llm.id, llmCallId);
    assert.ok(floor.llm.findings.some((f) => f.rule === "pii-email"));
    assert.ok(floor.llm.tools.some((t) => t.op === "run"));
    assert.match(floor.llm.retained, /rule ids and paths/);
    assert.equal(html.includes(email), false);
    assert.equal(floor.policy.sourceHash, first.step.qdl.sourceHash);
    assert.equal(floor.policy.version, 1);
    assert.equal(floor.policy.registry, "qdl-kernels-1");
    assert.match(floor.policy.registryDigest ?? "", /^43c66b70/);
    assert.match(html, /Source hash is the program identity/);
    assert.equal(floor.calculation.final, 189);
    assert.equal(stepForRegion(floor, "price")?.value, 189);
    assert.equal(stepForRegion(floor, "machining")?.value, 189);
    assert.match(html, /data-step-row="price"[^>]*data-step-label="price = 189"/);
    assert.match(html, /data-step="price"/);
    assert.equal(floor.review.state, "explicit");
    assert.equal(floor.review.reviewer, "Ada Quote");
    assert.match(html, /explicit human decision/);
    assert.match(html, /The reviewer name is not an identity check/);
    assert.match(html, /simulated action was not sent/);
    assert.equal(floor.verification.ok, true);
    assert.equal(floor.verification.replay.reproduced, true);
    assert.equal(floor.verification.chain.ok, true);
    assert.equal(floor.verification.consistency.ok, true);
    assert.equal(floor.verification.anchor, "verified");
    assert.match(html, /Anchor status is verified/);
    const script = html.slice(html.indexOf("<script>"), html.indexOf("</script>"));
    assert.match(script, /window/);
    assert.doesNotMatch(script, /\brequire\b/);
    assert.doesNotMatch(script, /\bmodule\b/);
    assert.doesNotMatch(html, /type="module"/);
    assert.doesNotMatch(html, /authenticated/);
    assert.doesNotMatch(html, /was performed/);
    const revised = await decisionReceipt(log, similar.decision.id);
    assert.equal(revised.policy.version, 2);
    assert.notEqual(revised.policy.sourceHash, floor.policy.sourceHash);
    assert.ok(revised.policy.changes?.some((c) => c.from === 150 && c.to === 151));
    const recordedAt = html.indexOf("Recorded inputs");
    const callerAt = html.indexOf("Caller assertions");
    assert.ok(recordedAt >= 0 && recordedAt < callerAt);
    assert.match(html.slice(callerAt), /caller note/);
    assert.doesNotMatch(html.slice(recordedAt, callerAt), /caller note/);

    const mixed = fresh();
    const structured = await recordQdl(mixed, { systemId: "shop-floor", useCase: "floor-quote", input: "42 min", params: { note: "model estimate" } }, { intent: policy }, inputs);
    const orphan = mixed.record({ systemId: "shop-floor", useCase: "floor-quote", input: "missing", output: 1, qdlDecision: true });
    const doomed = await recordQdl(mixed, { systemId: "shop-floor", useCase: "spare", input: "spare" }, { intent: plain("Spare", 150) }, inputs);
    const lines = readFileSync(mixed.path, "utf8").trim().split("\n");
    const at = lines.findIndex((l) => JSON.parse(l).id === doomed.decision.id);
    const forged = JSON.parse(lines[at]);
    forged.output = ["FORGED"];
    lines[at] = JSON.stringify(forged);
    writeFileSync(mixed.path, reseal(lines).join("\n") + "\n");
    const quote = await decisionReceipt(mixed, structured.decision.id);
    const quoteHtml = renderReceipt(quote);
    assert.equal(quote.inputs.recorded.find((f) => f.name === "minutes")?.basis, "confirmed");
    assert.equal(quote.inputs.recorded.find((f) => f.name === "rate")?.basis, "confirmed");
    assert.equal(quote.inputs.recorded.find((f) => f.name === "proposed")?.basis, "suspected");
    assert.equal(quote.inputs.recorded.find((f) => f.name === "proposed")?.value, 100);
    assert.deepEqual(quote.inputs.assertions, [{ name: "note", value: "model estimate" }]);
    assert.equal(stepForRegion(quote, "proposed")?.value, 100);
    assert.match(quoteHtml, /confirmed/);
    assert.match(quoteHtml, /suspected/);
    assert.match(quoteHtml, /model estimate/);
    assert.equal(quote.verification.replay.reproduced, true);
    assert.equal(quote.verification.chain.ok, true);
    assert.equal(quote.verification.consistency.ok, true);
    assert.equal(quote.verification.anchor, "not-anchored");
    assert.match(quoteHtml, /not-anchored/);
    const gap = await decisionReceipt(mixed, orphan.id);
    assert.equal(gap.verification.ok, false);
    assert.equal(gap.verification.consistency.reason, "companion-missing");
    assert.equal(gap.review.state, "pending");
    const forgedReceipt = await decisionReceipt(mixed, doomed.decision.id);
    const forgedHtml = renderReceipt(forgedReceipt);
    assert.equal(forgedReceipt.verification.ok, false);
    assert.equal(forgedReceipt.verification.replay.reproduced, true);
    assert.equal(forgedReceipt.verification.chain.ok, true);
    assert.equal(forgedReceipt.verification.consistency.reason, "output-mismatch");
    assert.equal(forgedReceipt.verification.anchor, "not-anchored");
    assert.match(forgedHtml, /output-mismatch/);
    assert.match(forgedHtml, /not success/);
    for (const page of [html, quoteHtml, forgedHtml, renderReceipt(gap)]) {
      assert.doesNotMatch(page, /authenticated/);
      assert.doesNotMatch(page, /was performed/);
    }
  } finally { px.close(); await up.close(); }
});
