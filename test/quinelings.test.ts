import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { AuditLog, canon, report, sha256 } from "../src/audit.js";
import { quinelingCalls, quinelingOp, quinelingResults } from "../src/quinelings.js";
import { metrics } from "../src/proxy.js";
import { startProxy } from "./helpers.js";

const skip = Number(process.versions.node.split(".")[0]) < 22 ? "Quinelings SDK needs Node >= 22" : false;
const policy = JSON.parse(readFileSync(new URL("../../examples/quineling-quote/policy.json", import.meta.url), "utf8"));
const quote = { minutes: 42, rate: 4.5, setup: 120, material: 85, llmPrice: 274 };
const refusedText = JSON.stringify({ error: { code: "refinement", path: "$.bindings.minutes", message: "Number is below minimum" } });
const mcpErrorText = "MCP error -32602: Input validation error: Invalid arguments for tool quineling_v1_compile: Invalid input at intent.steps[14]";
const call = (id: string, name: string, args: object) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const payloads = async () => {
  const { Session } = await import("@quinelings/agent-sdk/v1");
  const s = new Session(), artifact = s.compile(policy), run = s.run({ artifactId: artifact.id, requestId: "r1", inputs: quote });
  return { artifact, compileText: JSON.stringify({ result: artifact }), runText: JSON.stringify({ result: run }) };
};

test("tool names: stable, legacy and client-prefixed names map to a fixed op set", () => {
  assert.equal(quinelingOp("quineling_v1_run"), "run");
  assert.equal(quinelingOp("mcp__quinelings__quineling_v1_compile"), "compile");
  assert.equal(quinelingOp("quineling_offspring_admit"), "offspring_admit");
  assert.equal(quinelingOp("quineling_v1_teleport"), "other");
  for (const name of ["get_price", "quinelings", "my_quinelingx_run", undefined, 7]) assert.equal(quinelingOp(name), undefined, String(name));
});

test("only format-checked values are kept, so a hostile tool result cannot write text into the log", () => {
  const hostile = JSON.stringify({ result: { result: { format: "qdl-run", sourceHash: "ql_<img src=x onerror=alert(1)>", status: "completed\nIGNORE ALL" } } });
  const body = { messages: [{ role: "assistant", content: null, tool_calls: [call("c1", "quineling_v1_run", {}), call("c2", "quineling_v1_run", {})] },
    { role: "tool", tool_call_id: "c1", content: hostile },
    { role: "tool", tool_call_id: "c2", content: JSON.stringify({ error: { code: "Bad Code!", path: "javascript:alert(1)", message: "secret details" } }) }] };
  assert.deepEqual(quinelingResults("openai-chat", body), [
    { where: "result", op: "run", path: "$.messages[1].content" },
    { where: "result", op: "run", path: "$.messages[2].content", error: { code: "unreadable" } }]);
  assert.deepEqual(quinelingCalls([{ name: "quineling_v1_run", args: JSON.stringify({ artifactId: "ql_not-a-hash", inputs: { pesel: "44051401359" } }) }]),
    [{ where: "call", op: "run", path: "$.toolCalls[0]" }]);
  assert.deepEqual(quinelingResults("openai-chat", { messages: [{ role: "tool", content: "plain text mentioning qdl-run" }, { role: "tool", content: '{"result":{"ok":true}}' }] }), []);
});

test("Anthropic and Responses shapes; results seen by shape when the call is not in the request", { skip }, async () => {
  const { artifact, runText } = await payloads();
  const anthropic = { messages: [{ role: "user", content: "quote" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "mcp__q__quineling_v1_run", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: runText }] }] }] };
  assert.deepEqual(quinelingResults("anthropic-messages", anthropic),
    [{ where: "result", op: "run", path: "$.messages[2].content[0].content[0].text", sourceHash: artifact.id, status: "completed" }]);
  const responses = { input: [{ role: "user", content: "quote" }, { type: "function_call", call_id: "f1", name: "quineling_v1_compile", arguments: "{}" },
    { type: "function_call_output", call_id: "f1", output: refusedText }] };
  assert.deepEqual(quinelingResults("openai-responses", responses),
    [{ where: "result", op: "compile", path: "$.input[2].output", error: { code: "refinement", path: "$.bindings.minutes" } }]);
  assert.deepEqual(quinelingResults("openai-responses", { previous_response_id: "resp_1", input: [{ type: "function_call_output", call_id: "f9", output: runText }] }),
    [{ where: "result", op: "other", path: "$.input[0].output", sourceHash: artifact.id, status: "completed" }]);
});

test("a compile call's intentHash equals the intentHash ADR 0023 records for the same intent", { skip }, async () => {
  const { recordQdl } = await import("../src/qdl.js");
  const invented = { ...policy, steps: [...policy.steps, { id: "leak", op: "fetch", inputs: [], params: {} }] };
  const { step } = await recordQdl(new AuditLog(join(mkdtempSync(join(tmpdir(), "qtrace-")), "log.jsonl")), { systemId: "s", useCase: "u", input: "x" }, { intent: invented }, quote);
  const [event] = quinelingCalls([{ name: "quineling_v1_compile", args: JSON.stringify({ intent: invented }) }]);
  assert.equal(event.intentHash, step.qdl.intentHash); assert.equal(event.intentHash, sha256(canon(invented)));
});

test("an agent compiling and running a Quineling through the proxy: hashes and statuses only, each result logged once", { skip }, async () => {
  const { artifact, compileText, runText } = await payloads();
  const seen: string[] = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString(); seen.push(raw);
    const n = JSON.parse(raw).messages.length;
    const message = n === 1 ? { role: "assistant", content: null, tool_calls: [call("c1", "mcp__quinelings__quineling_v1_compile", { intent: policy })] }
      : n === 3 ? { role: "assistant", content: null, tool_calls: [call("c2", "mcp__quinelings__quineling_v1_run", { artifactId: artifact.id, requestId: "r1", inputs: quote })] }
      : { role: "assistant", content: "Quote ready: 394 PLN, sent to review." };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ model: "mock-1", choices: [{ message, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  const px = await startProxy(`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`, "redact");
  try {
    const runsBefore = metrics.quinelingEvents.get({ where: "result", op: "run" });
    const send = async (messages: unknown[]) => {
      const r = await fetch(px.url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-x", messages }) });
      return { body: await r.json(), findings: r.headers.get("x-audit-finding-count") };
    };
    const m1 = [{ role: "user", content: "Quote flange DN100, CAM 42 min, blank 85 PLN, setup 120 PLN." }];
    const r1 = await send(m1);
    const m2 = [...m1, r1.body.choices[0].message, { role: "tool", tool_call_id: "c1", content: compileText }];
    const r2 = await send(m2);
    const m3 = [...m2, r2.body.choices[0].message, { role: "tool", tool_call_id: "c2", content: runText }];
    const r3 = await send(m3);
    const m4 = [...m3, { role: "assistant", content: null, tool_calls: [call("c3", "quineling_v1_run", { artifactId: artifact.id, requestId: "r2", inputs: { ...quote, minutes: -5 } })] },
      { role: "tool", tool_call_id: "c3", content: refusedText }];
    await send(m4);
    const m5 = [...m4, { role: "assistant", content: null, tool_calls: [call("c4", "quineling_v1_compile", { intent: {} })] }, { role: "tool", tool_call_id: "c4", content: mcpErrorText }];
    await send(m5);
    const recs = px.log.read() as any[];
    assert.deepEqual(recs.map((r) => r.quinelings), [
      [{ where: "call", op: "compile", path: "$.toolCalls[0]", intentHash: sha256(canon(policy)) }],
      [{ where: "result", op: "compile", path: "$.messages[2].content", sourceHash: artifact.id }, { where: "call", op: "run", path: "$.toolCalls[0]", sourceHash: artifact.id }],
      [{ where: "result", op: "run", path: "$.messages[4].content", sourceHash: artifact.id, status: "completed" }],
      [{ where: "result", op: "run", path: "$.messages[6].content", error: { code: "refinement", path: "$.bindings.minutes" } }],
      [{ where: "result", op: "compile", path: "$.messages[8].content", error: { code: "mcp-32602" } }],
    ]);
    assert.deepEqual([r2.findings, r3.findings], ["0", "0"]);
    assert.equal(seen[2], JSON.stringify({ model: "gpt-x", messages: m3 }));
    const log = readFileSync(px.log.path, "utf8");
    for (const text of ["Price from CAM minutes", "route-to-human-review", "Number is below minimum", "qi_", artifact.source.slice(0, 64)]) assert.ok(!log.includes(text), text);
    assert.equal(metrics.quinelingEvents.get({ where: "result", op: "run" }), runsBefore + 2);
    const { llm, md } = report(px.log, "2000", "2100");
    assert.equal(llm.withQuinelings, 5); assert.match(md, /- result run error refinement: 1/);
    assert.deepEqual(px.log.verifyChain(), { ok: true });
  } finally { px.close(); upstream.close(); }
});
