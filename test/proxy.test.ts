import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { AuditLog, report } from "../src/audit.js";
import { createProxy } from "../src/proxy.js";
import { hasDuplicateKeys, scanText } from "../src/scan.js";
import { mockUpstream, startProxy, AWS, PESEL, AUTH } from "./helpers.js";
import type { Mode } from "../src/scan.js";

const up = await mockUpstream();
const proxies = { redact: await startProxy(up.url, "redact"), "no-go": await startProxy(up.url, "no-go"), advisory: await startProxy(up.url, "advisory") };
after(() => { up.close(); Object.values(proxies).forEach((p) => p.close()); });
const post = (base: string, path: string, body: string | object, extra: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", authorization: AUTH, "x-api-key": "sk-ant-test-NEVER-LOGGED", ...extra }, body: typeof body === "string" ? body : JSON.stringify(body) });
const secretChat = { model: "gpt-x", messages: [{ role: "user", content: `key ${AWS} pesel ${PESEL}` },
  { role: "tool", tool_call_id: "t1", content: JSON.stringify({ env: `AWS_KEY=${AWS}` }) }] };
const last = () => up.seen[up.seen.length - 1];

test("redact: secret + PII replaced (incl. tool results) before upstream sees them; auth passed through", async () => {
  const r = await post(proxies.redact.url, "/v1/chat/completions", secretChat, { "x-audit-use-case": "quote-qa", "x-audit-system-id": "rag-1" });
  assert.equal(r.status, 200); assert.equal(r.headers.get("x-audit-finding-count"), "3"); await r.text();
  const sent = last().body.toString();
  assert.ok(!sent.includes(AWS) && !sent.includes(PESEL), sent);
  assert.match(sent, /\[REDACTED:aws-access-token\][\s\S]*\[REDACTED:pii-pesel\][\s\S]*AWS_KEY=\[REDACTED:aws-access-token\]/);
  assert.equal(last().headers.authorization, AUTH);
  const rec = proxies.redact.log.read().at(-1)!;
  assert.equal((rec as any).decision.action, "forward-redacted"); assert.equal(rec.useCase, "quote-qa"); assert.equal(rec.systemId, "rag-1");
  assert.deepEqual((rec as any).toolCalls.map((t: any) => t.name), ["get_price"]);
});

test("no-go: 409 with rule IDs only, upstream never called, blocked call still logged", async () => {
  const before = up.seen.length;
  const r = await post(proxies["no-go"].url, "/v1/messages", { model: "claude", max_tokens: 5, messages: [{ role: "user", content: `x ${AWS}` }] });
  assert.equal(r.status, 409); const t = await r.text();
  assert.ok(!t.includes(AWS)); assert.deepEqual(JSON.parse(t).error.findings, ["aws-access-token"]);
  assert.equal(up.seen.length, before);
  assert.equal((proxies["no-go"].log.read().at(-1) as any).decision.action, "block");
});

test("advisory: forwards original bytes but records findings", async () => {
  const raw = JSON.stringify(secretChat);
  await (await post(proxies.advisory.url, "/v1/chat/completions", raw)).text();
  assert.equal(last().body.toString(), raw);
  assert.equal((proxies.advisory.log.read().at(-1) as any).decision.findings.length, 3);
});

test("clean request forwarded byte-identical (odd whitespace, key order, unicode kept)", async () => {
  const raw = '{ "model":"gpt-x",\n  "messages":[{"content":"Zażółć gęślą jaźń \\u00e9","role":"user"}] , "temperature":0.70 }';
  await (await post(proxies.redact.url, "/v1/chat/completions", raw)).text();
  assert.equal(last().body.toString(), raw);
});

test("auth headers never in the log; chain verifies; tamper detected", async () => {
  const p = proxies.redact, txt = readFileSync(p.log.path, "utf8");
  assert.ok(!txt.includes("NEVER") && !txt.includes("NEVER-BE-LOGGED") && !txt.includes(AWS) && !txt.includes(PESEL));
  assert.deepEqual(p.log.verifyChain(), { ok: true });
  const lines = txt.trim().split("\n"); const r = JSON.parse(lines[0]); r.output = "edited"; lines[0] = JSON.stringify(r);
  const copy = new AuditLog(p.log.path + ".tampered"); writeFileSync(copy.path, lines.join("\n") + "\n");
  assert.deepEqual(copy.verifyChain(), { ok: false, badLine: 1, reason: "hash mismatch" });
});

for (const [name, path, body] of [
  ["openai chat", "/v1/chat/completions", { model: "gpt-x", messages: [{ role: "user", content: "hi" }] }],
  ["openai responses", "/v1/responses", { model: "gpt-x", input: "hi" }],
  ["anthropic messages", "/v1/messages", { model: "claude", max_tokens: 9, messages: [{ role: "user", content: "hi" }] }],
] as const) for (const stream of [false, true]) test(`${name} ${stream ? "stream" : "json"}: passthrough + assembled output logged`, async () => {
  const r = await post(proxies.redact.url, path, { ...body, stream });
  assert.equal(r.status, 200); const t = await r.text();
  if (stream) assert.match(t, /^(event|data):/); else assert.match(t, /Hello world/);
  const rec = proxies.redact.log.read().at(-1) as any;
  assert.equal(rec.upstreamStatus, 200); assert.ok(rec.usage.output >= 2);
  if (name === "openai chat" && stream) assert.equal(rec.output, "Hello world, mail me at [REDACTED:pii-email]"); // output PII redacted in log only
  else assert.equal(rec.output, "Hello world");
  assert.equal(rec.provider, name.startsWith("anthropic") ? "anthropic" : "openai");
});

test("count_tokens + models passthrough, routing errors use static codes", async () => {
  assert.deepEqual(await (await post(proxies.redact.url, "/v1/messages/count_tokens", { model: "c", messages: [] })).json(), { input_tokens: 7 });
  assert.deepEqual(await (await fetch(proxies.redact.url + "/v1/models", { headers: { authorization: AUTH } })).json(), { data: [{ id: "mock-1" }] });
  assert.equal((await post(proxies.redact.url, "/v1/chat/completions", "{bad")).status, 400);
  const dup = await post(proxies.redact.url, "/v1/chat/completions", '{"model":"a","model":"b"}');
  assert.equal(dup.status, 400); assert.equal((await dup.json()).error.code, "audit_duplicate_keys");
  assert.equal((await post(proxies.redact.url, "/v1/nope", {})).status, 404);
});

test("report summarises proxy calls", () => {
  const { llm, md } = report(proxies.redact.log, "2000-01-01", "2100-01-01");
  assert.ok(llm.calls >= 8); assert.equal(llm.redacted, 1); assert.match(md, /aws-access-token: 2/);
});

test("scanner: checksums avoid false positives, keys detected", () => {
  assert.equal(scanText("order 12345678901 ok").length, 0); // invalid PESEL checksum
  assert.deepEqual(scanText("IBAN PL61 1090 1014 0000 0712 1981 2874, tel +48 601 234 567").map((s) => s.rule), ["pii-iban", "pii-phone"]);
  assert.equal(scanText("ver 1.2.3 build 2026-10-20 cost 123 456 789.00").length, 0);
  assert.ok(hasDuplicateKeys('{"a":{"b":1,"\\u0062":2}}')); assert.ok(!hasDuplicateKeys('{"a":{"b":1},"c":{"b":2}}'));
});
