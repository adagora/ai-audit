import http from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AuditLog } from "../../dist/src/audit.js";
import { recordQdl, replayQdl } from "../../dist/src/qdl.js";
import { firstDisagreement, governorIntent, governorSnapshots, labView, renderLab, withReported } from "../../dist/src/lab.js";
import { createProxy } from "../../dist/src/proxy.js";

const script = [
  { user: "Job check A", status: 200, usage: [12, 4], assistant: "Noted." },
  { user: "Job check B", status: 500, assistant: "No result." },
  { user: "Job check C", status: 200, usage: [40, 8], assistant: "Continued." },
  { user: "Job check D", status: 500, usage: [80, 10], assistant: "Failed." },
];

function providerBody(step) {
  if (!step.usage) return JSON.stringify({ error: { message: "upstream failed", type: "server_error" } });
  return JSON.stringify({
    model: "mock-1",
    choices: [{ message: { role: "assistant", content: step.assistant }, finish_reason: "stop" }],
    usage: { prompt_tokens: step.usage[0], completion_tokens: step.usage[1] },
    ...(step.status !== 200 && { error: { message: "upstream failed", type: "server_error" } }),
  });
}

const upstream = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  Buffer.concat(chunks);
  const step = script[seen++];
  res.writeHead(step?.status ?? 500, { "content-type": "application/json" });
  res.end(step ? providerBody(step) : "{}");
});
let seen = 0;
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
const dir = mkdtempSync(join(tmpdir(), "policy-lab-"));
const logPath = join(dir, "audit.jsonl");
const log = new AuditLog(logPath);
const proxy = createProxy({ upstreamOpenai: `http://127.0.0.1:${upstream.address().port}`, upstreamAnthropic: `http://127.0.0.1:${upstream.address().port}`, mode: "redact", log, quiet: true });
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;

async function waitCalls(n) {
  const deadline = Date.now() + 2000;
  let recs = log.read();
  while (recs.filter((r) => r.kind === "llm-call").length < n && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
    recs = log.read();
  }
  return recs;
}

try {
  const messages = [];
  for (const step of script) {
    messages.push({ role: "user", content: step.user });
    const response = await fetch(proxyUrl + "/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", "x-audit-system-id": "policy-lab", "x-audit-use-case": "session-governor" },
      body: JSON.stringify({ model: "mock-1", messages }),
    });
    if (response.status !== step.status) throw new Error(`proxy ${response.status} for ${step.user}`);
    await response.text();
    messages.push({ role: "assistant", content: step.assistant });
  }
  const recorded = await waitCalls(script.length);
  const calls = recorded.filter((r) => r.kind === "llm-call");
  if (calls.length !== script.length) throw new Error(`logged ${calls.length} calls`);
  if (recorded.some((r) => r.kind === "decision" || r.kind === "program")) throw new Error("forwarding wrote a decision");
  const sessionIds = new Set(calls.map((c) => c.session?.id));
  if (sessionIds.size !== 1) throw new Error(`sessions ${sessionIds.size}`);
  const raw = readFileSync(logPath, "utf8");
  for (const step of script) if (raw.includes(step.user)) throw new Error("message text entered the log");
  console.log("forwarding: llm-calls only");

  const snaps = withReported(governorSnapshots(log.read()));
  const strictIntent = governorIntent(2);
  const looseIntent = governorIntent(3);
  async function govern(intent, policy, snap) {
    const inputs = { failures: snap.failures, reported: snap.reported };
    const result = await recordQdl(log, { systemId: "policy-lab", useCase: "session-governor", llmCallId: snap.callId, input: `turn ${snap.turn}`, params: { policy } }, { intent }, inputs);
    if (result.step.qdl.status !== "completed") throw new Error(`${policy} ${result.step.qdl.status} ${result.step.qdl.error?.code}`);
    return { decisionId: result.decision.id, output: result.decision.output, sourceHash: result.step.qdl.sourceHash };
  }
  const rows = [];
  for (const snap of snaps) rows.push({ snapshot: snap, strict: await govern(strictIntent, "strict", snap), loose: await govern(looseIntent, "loose", snap) });
  const found = firstDisagreement(rows);
  if (!found) throw new Error("no disagreement");
  if (found.agreed.snapshot.turn >= found.split.snapshot.turn) throw new Error("agreement is not earlier");
  if (found.split.strict.sourceHash === found.split.loose.sourceHash) throw new Error("policies share a source hash");
  if (found.agreed.strict.sourceHash !== found.split.strict.sourceHash || found.agreed.loose.sourceHash !== found.split.loose.sourceHash) throw new Error("policies changed before the disagreement");
  const revisedIntent = governorIntent(1);
  const revisedInputs = { failures: found.split.snapshot.failures, reported: found.split.snapshot.reported };
  const revised = await recordQdl(log, { systemId: "policy-lab", useCase: "session-governor", llmCallId: found.split.snapshot.callId, input: `turn ${found.split.snapshot.turn}`, params: { policy: "revised" } }, { intent: revisedIntent }, revisedInputs);
  if (revised.step.qdl.status !== "completed") throw new Error(`revised ${revised.step.qdl.status}`);
  if (revised.step.qdl.sourceHash === found.split.loose.sourceHash) throw new Error("revision kept the loose source");
  if (JSON.stringify(revised.decision.output) === JSON.stringify(found.split.loose.output)) throw new Error("revision kept the loose output");

  const sourceOf = (hash) => {
    const rec = log.read().find((r) => r.kind === "program" && r.id === hash);
    if (!rec || typeof rec.source !== "string") throw new Error(`missing program ${hash}`);
    return rec.source;
  };
  const revisedPath = join(dir, "revised.qdl");
  const loosePath = join(dir, "loose.qdl");
  const inputsPath = join(dir, "inputs.json");
  writeFileSync(revisedPath, sourceOf(revised.step.qdl.sourceHash));
  writeFileSync(loosePath, sourceOf(found.split.loose.sourceHash));
  writeFileSync(inputsPath, JSON.stringify(revisedInputs));
  const fresh = (file) => {
    const run = spawnSync(process.execPath, [fileURLToPath(new URL("./fresh.mjs", import.meta.url)), file, inputsPath], { encoding: "utf8" });
    if (run.status !== 0) throw new Error(run.stderr || "fresh process failed");
    return JSON.parse(run.stdout);
  };
  const revisedFresh = fresh(revisedPath);
  const looseFresh = fresh(loosePath);
  if (revisedFresh.source !== revised.step.qdl.sourceHash || JSON.stringify(revisedFresh.output) !== JSON.stringify(revised.decision.output)) throw new Error("fresh revision diverged");
  if (looseFresh.source !== found.split.loose.sourceHash || JSON.stringify(looseFresh.output) !== JSON.stringify(found.split.loose.output)) throw new Error("fresh original diverged");
  const again = await replayQdl(log, revised.decision.id);
  if (!again.reproduced || JSON.stringify(again.output) !== JSON.stringify(revised.decision.output) || again.sourceHash !== revised.step.qdl.sourceHash) throw new Error("replay diverged");

  const view = await labView(log, found.split.strict.decisionId, found.split.loose.decisionId);
  const page = join(dir, "lab.html");
  writeFileSync(page, renderLab(view));
  const reportedCalls = calls.filter((c) => typeof c.usage?.input === "number");
  const unknown = calls.find((c) => c.usage == null);
  if (!unknown || reportedCalls.length < 2 || !(reportedCalls.at(-1).usage.input > reportedCalls[0].usage.input)) throw new Error("usage shape");
  const halt = (output) => Array.isArray(output) ? output[0] : output;
  console.log(`failures: ${found.split.snapshot.failures}`);
  console.log(`usage-early: ${reportedCalls[0].usage.input}`);
  console.log(`usage-later: ${reportedCalls.at(-1).usage.input}`);
  console.log("unknown-usage: absent");
  console.log(`agree-turn: ${found.agreed.snapshot.turn}`);
  console.log(`agree-halt: ${halt(found.agreed.strict.output)}`);
  console.log(`disagree-turn: ${found.split.snapshot.turn}`);
  console.log(`disagree-strict: ${halt(found.split.strict.output)}`);
  console.log(`disagree-loose: ${halt(found.split.loose.output)}`);
  console.log(`strict: ${found.split.strict.sourceHash}`);
  console.log(`loose: ${found.split.loose.sourceHash}`);
  console.log(`revised: ${revised.step.qdl.sourceHash}`);
  console.log(`revised-halt: ${halt(revised.decision.output)}`);
  console.log(`fresh-halt: ${halt(revisedFresh.output)}`);
  console.log(`fresh-source: ${revisedFresh.source}`);
  console.log(`unrevised-halt: ${halt(looseFresh.output)}`);
  console.log(`unrevised-source: ${looseFresh.source}`);
  console.log("replay: true");
  console.log(`creature: ${view.body ? "yes" : "no"}`);
  console.log(`log: ${logPath}`);
  console.log(`page: ${pathToFileURL(page).href}`);
  console.log(`export: ${revisedPath}`);
  console.log(`unrevised-export: ${loosePath}`);
  console.log(`inputs: ${inputsPath}`);
  console.log(`strict-decision: ${found.split.strict.decisionId}`);
  console.log(`loose-decision: ${found.split.loose.decisionId}`);
  console.log(`revised-decision: ${revised.decision.id}`);
} finally {
  await new Promise((r) => proxy.close(r));
  await new Promise((r) => upstream.close(r));
}
