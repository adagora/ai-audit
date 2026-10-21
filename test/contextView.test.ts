import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bustSignals, listSessions, renderSessionHtml, sessionView, turnTokens, type SessionCall } from "../src/contextView.js";
import { mockUpstream, startProxy } from "./helpers.js";

const sys = { role: "system", content: "You are a quoting agent." };
async function agentSession() {
  const up = await mockUpstream(), px = await startProxy(up.url, "redact");
  const post = (messages: unknown[]) => fetch(px.url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "m", tools: [{ type: "function", function: { name: "lookup", parameters: {} } }], messages }) }).then((r) => r.text());
  const m1 = [sys, { role: "user", content: "Quote part A" }];
  const m2 = [...m1, { role: "assistant", content: null, tool_calls: [{ id: "1", type: "function", function: { name: "lookup", arguments: "{}" } }] }, { role: "tool", tool_call_id: "1", content: "x".repeat(800) }];
  await post(m1); await post(m2); await post(m2);
  await post([...m1, { role: "assistant", content: "Need drawing" }, { role: "user", content: "here" }]);
  px.close(); up.close();
  return px.log;
}
const call = (over: Partial<SessionCall> & { usage?: SessionCall["usage"] }): SessionCall => ({ id: "x", ts: "t", provider: "anthropic",
  session: { id: "s", turn: 2, digest: "d2", parent: "d1", messages: 3, firstChanged: null }, context: { bytes: {} as any, totalBytes: 0, tokenBasis: "unknown" }, ...over });

test("turnTokens: provider split; OpenAI cached is part of input; unknown stays unknown", () => {
  assert.deepEqual(turnTokens({ provider: "anthropic", usage: { input: 50, cached: 900, cacheWrite: 100, output: 20 } }), { cacheRead: 900, cacheWrite: 100, input: 50, output: 20, prompt: 1050 });
  assert.deepEqual(turnTokens({ provider: "openai", usage: { input: 1000, cached: 768, output: 5 } }), { cacheRead: 768, cacheWrite: null, input: 232, output: 5, prompt: 1000 });
  assert.deepEqual(turnTokens({ provider: "openai", usage: { output: 5 } }), { cacheRead: null, cacheWrite: null, input: null, output: 5, prompt: null });
});

test("bustSignals: prefix rewrite and provider cache drop are reported separately", () => {
  const prev = call({ usage: { input: 50, cached: 4000, cacheWrite: 500, output: 10 } });
  assert.deepEqual(bustSignals(call({ usage: { input: 50, cached: 4400, cacheWrite: 300 } }), prev), []);
  assert.deepEqual(bustSignals(call({ usage: { input: 50, cached: 0, cacheWrite: 4800 } }), prev), ["provider-cache-drop"]);
  assert.deepEqual(bustSignals(call({ session: { id: "s", turn: 2, digest: "d2", parent: "d1", messages: 3, firstChanged: { block: 1, offset: 900 } }, usage: { input: 50, cached: 1200, cacheWrite: 3000 } }), prev), ["prefix-rewrite", "provider-cache-drop"]);
  assert.deepEqual(bustSignals(call({ usage: { output: 3 } }), prev), []);
  assert.deepEqual(bustSignals(call({ usage: { input: 10, cached: 0 } }), call({ usage: { input: 50, cached: 300, cacheWrite: 200 } })), []);
});

test("listSessions and sessionView: retry, branch, cache hit, preamble share", async () => {
  const log = await agentSession(), [s] = listSessions(log.read());
  assert.equal(s.requests, 4); assert.equal(s.turns, 2); assert.equal(s.branches, 1);
  const v = sessionView(log.read(), s.id);
  assert.deepEqual(v.turns.map((t) => t.kind), ["", "", "retry", "branch"]);
  assert.ok(v.preambleShare > 0 && v.preambleShare < 1);
  assert.equal(v.unknownUsage, 0);
});

test("renderSessionHtml: self-contained, timeline and arena, no content", async () => {
  const log = await agentSession(), [s] = listSessions(log.read()), html = renderSessionHtml(log.read(), s.id);
  assert.match(html, /^<!doctype html>/); assert.ok(!/<script|src=|href=|@import/.test(html));
  assert.ok(html.includes("Token timeline") && html.includes("Context arena") && html.includes("t2 ↻") && html.includes("t2′"));
  assert.ok(!html.includes("Quote part A") && !html.includes("quoting agent") && !html.includes("xxxx"));
  assert.throws(() => renderSessionHtml(log.read(), "nope"), /audit_unknown_session/);
});

test("cli: context lists sessions and writes the HTML for one", async () => {
  const log = await agentSession(), [s] = listSessions(log.read());
  const cli = join(fileURLToPath(new URL(".", import.meta.url)), "../src/cli.js"), out = join(mkdtempSync(join(tmpdir(), "ctx-")), "s.html");
  assert.match(execFileSync(process.execPath, [cli, "context", "--log", log.path], { encoding: "utf8" }), new RegExp(s.id));
  execFileSync(process.execPath, [cli, "context", "--log", log.path, "--session", s.id, "--output", out]);
  assert.match(readFileSync(out, "utf8"), /<svg/);
});
