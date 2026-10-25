import http from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { AuditLog, canon, sha256 } from "../../dist/src/audit.js";
import { recordQdl, replayQdl, verifyDecision } from "../../dist/src/qdl.js";
import { decisionReceipt, renderReceipt } from "../../dist/src/receipt.js";
import { policyHistories } from "../../dist/src/policies.js";
import { createProxy } from "../../dist/src/proxy.js";

const intent = JSON.parse(readFileSync(new URL("./policy.json", import.meta.url), "utf8"));
const revised = structuredClone(intent);
revised.name = "Floor quote v2";
revised.inputs.find((i) => i.id === "floor").value = 200;

const upstream = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  JSON.parse(Buffer.concat(chunks).toString() || "{}");
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ model: "mock-1", choices: [{ message: { role: "assistant", content: "Proposed price 100 PLN" }, finish_reason: "stop" }], usage: { prompt_tokens: 8, completion_tokens: 4 } }));
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
const dir = mkdtempSync(join(tmpdir(), "decision-receipt-"));
const logPath = join(dir, "audit.jsonl");
const log = new AuditLog(logPath);
const proxy = createProxy({ upstreamOpenai: upstreamUrl, upstreamAnthropic: upstreamUrl, mode: "redact", log, quiet: true });
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;

try {
  const response = await fetch(proxyUrl + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", "x-audit-system-id": "shop-floor", "x-audit-use-case": "floor-quote" },
    body: JSON.stringify({ model: "mock-1", messages: [{ role: "user", content: "Quote 42 minutes. The model proposes 100 PLN." }] }) });
  if (response.status !== 200) throw new Error(`proxy ${response.status}`);
  await response.text();
  const requestId = response.headers.get("x-request-id");
  const first = await recordQdl(log, { systemId: "shop-floor", useCase: "floor-quote", llmCallId: requestId, input: "42 min at 4.50 PLN, proposed 100", params: { note: "model estimate" } },
    { intent }, { minutes: 42, rate: 4.5, proposed: 100 });
  if (first.step.qdl.status !== "completed" || first.decision.output[0] !== 189) throw new Error(`decision ${first.step.qdl.status} ${first.decision.output}`);
  console.log("proposal: 100");
  console.log("corrected: 189");
  console.log("review: pending");
  const review = log.approve(first.decision.id, "Ada Quote", "approved", "synthetic approval");
  console.log("approval: approved");
  const second = await recordQdl(log, { systemId: "shop-floor", useCase: "floor-quote", input: "10 min at 4.50 PLN, proposed 100" }, { intent: revised }, { minutes: 10, rate: 4.5, proposed: 100 });
  if (second.decision.output[0] !== 200) throw new Error(`revision output ${second.decision.output}`);
  const [history] = policyHistories(log.read());
  const v1 = history.versions.find((v) => v.version === 1);
  const v2 = history.versions.find((v) => v.version === 2);
  if (!v1 || !v2 || v1.sourceHash === v2.sourceHash) throw new Error("versions");
  console.log(`policy: ${v1.sourceHash} version ${v1.version}`);
  console.log(`revision: ${v2.sourceHash} version ${v2.version}`);
  const again = await replayQdl(log, first.decision.id);
  if (!again.reproduced || again.output[0] !== 189 || again.sourceHash !== v1.sourceHash) throw new Error(`replay ${again.reproduced} ${again.output} ${again.sourceHash}`);
  console.log("replay: 189");
  console.log(`replay-source: ${again.sourceHash}`);
  const lines = readFileSync(logPath, "utf8").trim().split("\n");
  const at = lines.findIndex((l) => JSON.parse(l).id === first.decision.id);
  const forged = JSON.parse(lines[at]);
  forged.output = ["FORGED"];
  lines[at] = JSON.stringify(forged);
  const tamperedPath = join(dir, "tampered.jsonl");
  writeFileSync(tamperedPath, lines.join("\n") + "\n");
  const tampered = new AuditLog(tamperedPath);
  const check = await verifyDecision(tampered, first.decision.id);
  if (check.ok || !check.replay.reproduced || check.chain.ok) throw new Error(`altered ok=${check.ok} replay=${check.replay.reproduced} chain=${check.chain.ok}`);
  if (sha256(canon(forged.output)) === first.step.qdl.outputsHash) throw new Error("forge matched");
  console.log("altered: detected");
  const receipt = await decisionReceipt(log, first.decision.id);
  const html = renderReceipt(receipt);
  const page = join(dir, "receipt.html");
  writeFileSync(page, html);
  console.log(`request: ${requestId}`);
  console.log(`decision: ${first.decision.id}`);
  console.log(`review-id: ${review.id}`);
  console.log(`receipt: ${pathToFileURL(page).href}`);
} finally {
  await new Promise((r) => proxy.close(r));
  await new Promise((r) => upstream.close(r));
}
