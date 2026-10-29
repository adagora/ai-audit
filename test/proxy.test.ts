import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { AuditLog, report, sha256 } from "../src/audit.js";
import { createProxy } from "../src/proxy.js";
import { hasDuplicateKeys, inspect, MAX_JSON_DEPTH, scanText } from "../src/scan.js";
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
  assert.equal(rec.content, "hash"); assert.equal(rec.output, undefined);
  assert.equal(rec.outputHash, sha256(name === "openai chat" && stream ? "Hello world, mail me at jan@firma.pl" : "Hello world"));
  for (const t of rec.toolCalls) { assert.equal(t.args, undefined); assert.match(t.argsHash, /^[0-9a-f]{64}$/); }
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

test("x-request-id names the llm-call record even when the provider sends its own, which comes back as x-upstream-request-id", async () => {
  for (const stream of [false, true]) {
    const r = await post(proxies.redact.url, "/v1/chat/completions", { model: "gpt-x", stream, messages: [{ role: "user", content: "hi" }] });
    assert.equal(r.status, 200); await r.text();
    const id = r.headers.get("x-request-id")!;
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-/); assert.match(r.headers.get("x-upstream-request-id") ?? "", /^req_upstream_\d+$/);
    await new Promise((done) => setTimeout(done, 20));
    assert.equal(proxies.redact.log.read().filter((rec) => rec.kind === "llm-call" && rec.id === id).length, 1);
  }
});

test("a request nested deeper than MAX_JSON_DEPTH is refused with 400 before inspection, where it used to overflow the stack into a 500", async () => {
  const nested = (depth: number) => `{"model":"gpt-x","messages":[{"role":"user","content":"${"[{".repeat(5000)}"}],"metadata":${"[".repeat(depth - 1)}${"]".repeat(depth - 1)}}`;
  const calls = () => proxies.redact.log.read().filter((r) => r.kind === "llm-call").length;
  const sent = up.seen.length, logged = calls(), records = proxies.redact.log.read().length;
  for (const depth of [MAX_JSON_DEPTH + 1, 3000, 100_000]) {
    const r = await post(proxies.redact.url, "/v1/chat/completions", nested(depth));
    assert.equal(r.status, 400); assert.equal((await r.json()).error.code, "audit_json_too_deep");
  }
  assert.equal(up.seen.length, sent); assert.equal(calls(), logged);
  assert.deepEqual(proxies.redact.log.read().slice(records).map((r: any) => [r.kind, r.status, r.code]), Array(3).fill(["refusal", 400, "audit_json_too_deep"]));
  const atLimit = await post(proxies.redact.url, "/v1/chat/completions", nested(MAX_JSON_DEPTH));
  assert.equal(atLimit.status, 200); await atLimit.text();
  assert.equal(up.seen.length, sent + 1); assert.equal(calls(), logged + 1);
});

test("JSON inside a string counts toward MAX_JSON_DEPTH across every hop; deeper JSON is an unmaskable deep-json finding, never an overflow", () => {
  const arrays = (depth: number) => "[".repeat(depth) + "]".repeat(depth);
  const rules = (v: unknown) => inspect(v).findings.map((f) => `${f.rule} ${f.path} ${f.unredactable === true}`);
  assert.deepEqual(rules({ a: arrays(MAX_JSON_DEPTH - 1) }), []);
  assert.deepEqual(rules({ a: arrays(MAX_JSON_DEPTH) }), ["deep-json $.a true"]);
  const hop = (outer: number, inner: number) => ({ a: `${"[".repeat(outer)}${JSON.stringify(arrays(inner))}${"]".repeat(outer)}` });
  assert.deepEqual(rules(hop(50, MAX_JSON_DEPTH - 51)), []);
  assert.deepEqual(rules(hop(50, MAX_JSON_DEPTH - 50)), [`deep-json $.a#json${"[0]".repeat(50)} true`]);
  for (const depth of [1000, 100_000]) {
    assert.deepEqual(rules({ a: arrays(depth) }), ["deep-json $.a true"]);
    const parsed = JSON.parse(arrays(depth)), result = inspect({ a: parsed });
    assert.deepEqual(result.findings.map((f) => f.rule), ["deep-json"]);
  }
});

test("a request with too deep JSON inside a string is blocked and recorded in redact mode, and forwarded as it is in advisory mode", async () => {
  const body = { model: "gpt-x", messages: [{ role: "user", content: "hi" }, { role: "tool", tool_call_id: "t1", content: "[".repeat(5000) + "]".repeat(5000) }] };
  const sent = up.seen.length;
  const blocked = await post(proxies.redact.url, "/v1/chat/completions", body);
  assert.equal(blocked.status, 409); assert.equal((await blocked.json()).error.code, "audit_unredactable_finding");
  assert.equal(up.seen.length, sent);
  const rec = proxies.redact.log.read().at(-1) as any;
  assert.equal(rec.decision.action, "block"); assert.deepEqual(rec.decision.findings, [{ rule: "deep-json", path: "$.messages[1].content" }]);
  const advisory = await post(proxies.advisory.url, "/v1/chat/completions", body);
  assert.equal(advisory.status, 200); await advisory.text();
  assert.equal(last().body.toString(), JSON.stringify(body));
});

test("report summarises proxy calls", () => {
  const { llm, md } = report(proxies.redact.log, "2000-01-01", "2100-01-01");
  assert.ok(llm.calls >= 8); assert.equal(llm.redacted, 1); assert.match(md, /aws-access-token: 2/);
});

test("scanner: checksums avoid false positives, keys detected", () => {
  assert.equal(scanText("order 12345678901 ok").length, 0);
  assert.deepEqual(scanText("IBAN PL61 1090 1014 0000 0712 1981 2874, tel +48 601 234 567").map((s) => s.rule), ["pii-iban", "pii-phone"]);
  assert.equal(scanText("ver 1.2.3 build 2026-10-20 cost 123 456 789.00").length, 0);
  assert.ok(hasDuplicateKeys('{"a":{"b":1,"\\u0062":2}}')); assert.ok(!hasDuplicateKeys('{"a":{"b":1},"c":{"b":2}}'));
});

test("found by fuzzing: an upstream tool call with non-string arguments still gets its record", async () => {
  const srv = http.createServer((_req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ model: "m", status: "completed", output: [{ type: "function_call", name: "f", arguments: { q: 1 } }] })); });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const px = await startProxy(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`, "redact");
  try {
    const r = await post(px.url, "/v1/responses", { model: "m", input: "hi" });
    assert.equal(r.status, 200); await r.text();
    assert.deepEqual(px.log.read().map((x) => x.toolCalls), [[{ name: "f", argsHash: sha256('{"q":1}') }]]);
  } finally { srv.close(); px.close(); }
});
