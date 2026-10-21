import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { listSessions, renderSessionHtml } from "../src/contextView.js";
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

test("listSessions summarises requests, turns and branches", async () => {
  const log = await agentSession(), [s] = listSessions(log.read());
  assert.equal(s.requests, 4); assert.equal(s.turns, 2); assert.equal(s.branches, 1);
});

test("renderSessionHtml: self-contained SVG, one block per non-empty segment, hover titles, no content", async () => {
  const log = await agentSession(), [s] = listSessions(log.read()), html = renderSessionHtml(log.read(), s.id);
  assert.match(html, /^<!doctype html>/); assert.ok(!/<script|src=|href=/.test(html));
  assert.ok(html.includes("tool results:") && html.includes("(retry)") && html.includes("(branch)"));
  assert.ok(!html.includes("Quote part A") && !html.includes("quoting agent") && !html.includes("xxxx"));
  assert.ok((html.match(/<rect /g) ?? []).length >= 4 * 2);
  assert.throws(() => renderSessionHtml(log.read(), "nope"), /audit_unknown_session/);
});

test("cli: context lists sessions and writes the HTML for one", async () => {
  const log = await agentSession(), [s] = listSessions(log.read());
  const cli = join(fileURLToPath(new URL(".", import.meta.url)), "../src/cli.js"), out = join(mkdtempSync(join(tmpdir(), "ctx-")), "s.html");
  assert.match(execFileSync(process.execPath, [cli, "context", "--log", log.path], { encoding: "utf8" }), new RegExp(s.id));
  execFileSync(process.execPath, [cli, "context", "--log", log.path, "--session", s.id, "--output", out]);
  assert.match(readFileSync(out, "utf8"), /<svg/);
  writeFileSync(out, "");
});
