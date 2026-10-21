import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { composeContext, promptTokens, scaleToProvider, SEGMENTS } from "../src/context.js";
import { mockUpstream, startProxy } from "./helpers.js";

const bytesOf = (body: object) => Buffer.byteLength(JSON.stringify(body));
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

test("openai chat: segments by role, tool calls, tool results, attachments; totals equal request bytes", () => {
  const body = { model: "m", tools: [{ type: "function", function: { name: "get_price", parameters: {} } }], messages: [
    { role: "system", content: "You are terse." }, { role: "user", content: [{ type: "text", text: "Price?" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] },
    { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_price", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "c1", content: "12 PLN" }] };
  const c = composeContext("openai-chat", body, bytesOf(body));
  assert.equal(c.bytes.system, "You are terse.".length);
  assert.equal(c.bytes.toolResults, "12 PLN".length);
  assert.ok(c.bytes.tools > 0 && c.bytes.user > 0 && c.bytes.assistant > 0 && c.bytes.attachments > 0);
  assert.equal(c.totalBytes, bytesOf(body));
  assert.equal(c.tokenBasis, "unknown"); assert.equal(c.tokens, undefined);
});

test("openai responses: instructions, string input, function_call_output", () => {
  const a = { model: "m", instructions: "Be brief.", input: "Hi" };
  assert.deepEqual([composeContext("openai-responses", a, bytesOf(a)).bytes.system, composeContext("openai-responses", a, bytesOf(a)).bytes.user], [9, 2]);
  const b = { model: "m", input: [{ role: "user", content: [{ type: "input_text", text: "x" }] }, { type: "function_call", name: "f", arguments: "{}", call_id: "1" }, { type: "function_call_output", call_id: "1", output: "result" }] };
  const c = composeContext("openai-responses", b, bytesOf(b));
  assert.equal(c.bytes.toolResults, 6); assert.ok(c.bytes.assistant > 0 && c.bytes.user > 0);
});

test("anthropic: system blocks, tool_result inside user turn, documents as attachments", () => {
  const body = { model: "c", max_tokens: 5, system: [{ type: "text", text: "sys" }], tools: [{ name: "t", input_schema: {} }], messages: [
    { role: "user", content: [{ type: "text", text: "q" }, { type: "document", source: { type: "base64", media_type: "application/pdf", data: "QUJD" } }] },
    { role: "assistant", content: [{ type: "tool_use", id: "u1", name: "t", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "u1", content: [{ type: "text", text: "done" }] }] }] };
  const c = composeContext("anthropic-messages", body, bytesOf(body));
  assert.ok(c.bytes.system > 0 && c.bytes.tools > 0 && c.bytes.attachments > 0 && c.bytes.assistant > 0 && c.bytes.toolResults > 0);
  assert.equal(c.totalBytes, bytesOf(body));
});

test("scaling: tokens sum to provider prompt tokens; 'other' gets none; unknown usage and attachments stay unknown", () => {
  const body = { model: "m", messages: [{ role: "system", content: "a".repeat(300) }, { role: "user", content: "b".repeat(100) }] };
  const c = composeContext("openai-chat", body, bytesOf(body));
  const s = scaleToProvider(c, 401);
  assert.equal(s.tokenBasis, "provider-scaled"); assert.equal(sum(s.tokens!), 401); assert.equal(s.tokens!.other, 0);
  assert.ok(s.tokens!.system > s.tokens!.user * 2);
  assert.equal(scaleToProvider(c, undefined).tokens, undefined);
  const withImage = { ...c, bytes: { ...c.bytes, attachments: 10 } };
  assert.equal(scaleToProvider(withImage, 500).tokenBasis, "unknown");
  assert.deepEqual(SEGMENTS.length, 7);
});

test("anthropic prompt tokens include cache reads and writes; missing input stays unknown", () => {
  assert.equal(promptTokens("anthropic-messages", { input: 6, cached: 4, cacheWrite: 1 }), 11);
  assert.equal(promptTokens("openai-chat", { input: 5, cached: 3 }), 5);
  assert.equal(promptTokens("openai-chat", { output: 2 }), undefined);
});

test("proxy logs content-free composition, scaled to reported usage", async () => {
  const up = await mockUpstream(), px = await startProxy(up.url, "redact");
  try {
    const secret = "Kowalski-private-note";
    await fetch(px.url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "m", messages: [{ role: "system", content: "sys" }, { role: "user", content: secret }] }) }).then((r) => r.text());
    await fetch(px.url + "/v1/messages", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "c", max_tokens: 5, messages: [{ role: "user", content: "hi" }] }) }).then((r) => r.text());
    const lines = readFileSync(px.log.path, "utf8"), recs = lines.trim().split("\n").map((l) => JSON.parse(l));
    assert.ok(!lines.includes(secret));
    assert.equal(recs[0].context.bytes.user, secret.length);
    assert.equal(recs[0].context.tokenBasis, "provider-scaled"); assert.equal(sum(recs[0].context.tokens), 5);
    assert.equal(sum(recs[1].context.tokens), 11);
  } finally { px.close(); up.close(); }
});
