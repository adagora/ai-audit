import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog, report, stats } from "../src/audit.js";
import { extract } from "../src/extract.js";

const sse = (...es: object[]) => es.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";

test("openai chat stream without include_usage: usage is unknown, not zero", () => {
  const o = extract("openai-chat", sse({ model: "m", choices: [{ delta: { content: "hi" } }] }, { model: "m", choices: [{ delta: {}, finish_reason: "stop" }] }), true);
  assert.equal(o.usage, undefined);
  const w = extract("openai-chat", sse({ model: "m", choices: [{ delta: { content: "hi" } }] }, { model: "m", choices: [], usage: { prompt_tokens: 7, completion_tokens: 3 } }), true);
  assert.deepEqual([w.usage?.input, w.usage?.output], [7, 3]);
});

test("openai responses stream without a final event: usage unknown", () => {
  const o = extract("openai-responses", sse({ type: "response.output_text.delta", delta: "hi" }), true);
  assert.equal(o.usage, undefined);
});

test("aborted anthropic stream: message_start placeholder is not reported as output usage", () => {
  const start = { type: "message_start", message: { model: "c", usage: { input_tokens: 12, output_tokens: 1 } } };
  const block = { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
  const aborted = extract("anthropic-messages", sse(start, block, { type: "content_block_delta", index: 0, delta: { text: "Hel" } }), true);
  assert.equal(aborted.usage?.input, 12); assert.equal(aborted.usage?.output, undefined);
  const done = extract("anthropic-messages", sse(start, block, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 9 } }), true);
  assert.deepEqual([done.usage?.input, done.usage?.output], [12, 9]);
});

test("stats and report: unknown usage counted separately, sums exclude it, totals flagged as lower bound", () => {
  const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "usage-")), "log.jsonl"));
  const call = (usage: object | undefined, extra: object = {}) => log.append({ kind: "llm-call", id: "x", ts: "2026-10-20T10:00:00Z", provider: "openai", model: "m", virtualKey: "k", upstreamStatus: 200, decision: { action: "forward", findings: [] }, usage, ...extra } as any);
  call({ input: 10, output: 5 });
  call(undefined);
  call({ input: 4 });
  call(undefined, { upstreamStatus: 500 });
  call(undefined, { decision: { action: "block", findings: [] }, upstreamStatus: undefined });
  const [s] = stats(log, "key");
  assert.equal(s.inputTokens, 14); assert.equal(s.outputTokens, 5);
  assert.equal(s.unknownInputUsage, 1); assert.equal(s.unknownOutputUsage, 2); assert.equal(s.unknownUsage, 2); assert.equal(s.tokensComplete, false);
  const r = report(log, "", "~");
  assert.equal(r.llm.unknownUsage, 2); assert.equal(r.llm.tokensComplete, false); assert.match(r.md, /lower bound: 2 call/);
  const log2 = new AuditLog(join(mkdtempSync(join(tmpdir(), "usage-")), "log.jsonl"));
  log2.append({ kind: "llm-call", id: "y", ts: "2026-10-20T10:00:00Z", provider: "openai", upstreamStatus: 200, decision: { action: "forward", findings: [] }, usage: { input: 1, output: 2 } } as any);
  assert.equal(stats(log2, "key")[0].tokensComplete, true); assert.doesNotMatch(report(log2, "", "~").md, /lower bound/);
});

test("found by fuzzing: extract skips events that are not objects, returns string tool calls and never writes to Object.prototype", () => {
  const chat = extract("openai-chat", "data: null\n\n" + sse({ choices: [{ delta: { content: "a", tool_calls: [{ index: "__proto__", function: { name: "f", arguments: "{}" } }] } }] }), true);
  assert.deepEqual([chat.text, chat.toolCalls], ["a", [{ name: "f", args: "{}" }]]);
  extract("anthropic-messages", sse({ type: "content_block_delta", index: "__proto__", delta: { text: "x" } }), true);
  assert.deepEqual(extract("openai-responses", JSON.stringify({ output: [{ type: "function_call", name: 7, arguments: { q: 1 } }] }), false).toolCalls, [{ name: "7", args: '{"q":1}' }]);
  const probe: Record<string, unknown> = {};
  assert.deepEqual([probe.name, probe.args, probe.text], [undefined, undefined, undefined]);
});

test("found by fuzzing: a model, stop reason or token count of the wrong type is unknown, not copied into the log (ADR 0012)", () => {
  const o = extract("openai-responses", JSON.stringify({ model: { echo: "prompt" }, status: ["completed"], usage: { input_tokens: "5", output_tokens: -1 } }), false);
  assert.deepEqual([o.model, o.stop, o.usage], [undefined, undefined, { input: undefined, output: undefined, cached: undefined }]);
  assert.deepEqual(extract("anthropic-messages", '{"model":"m","stop_reason":"end_turn","usage":{"input_tokens":6,"output_tokens":1e400}}', false).usage,
    { input: 6, output: undefined, cached: undefined, cacheWrite: undefined });
});
