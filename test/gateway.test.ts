import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mockUpstream, startProxy } from "./helpers.js";
import { report, sha256, stats } from "../src/audit.js";

const up = await mockUpstream(), other = await mockUpstream();
const p = await startProxy(up.url, "redact", {
  keys: [{ name: "claude-code", sha256: sha256("vk-A"), providers: ["anthropic"] }, { name: "quote-agent", sha256: sha256("vk-B"), models: ["fast", "gpt-x"], providers: ["openai"], logContent: true }],
  upstreamKeys: { openai: "sk-REAL-openai", anthropic: "sk-REAL-anthropic" },
  aliases: { fast: { model: "mock-1" }, local: { model: "qwen-local", upstream: other.url } },
  adminKeySha256: sha256("admin-1"),
});
after(() => { up.close(); other.close(); p.close(); });
const call = (key: string, path: string, body: object, ua = "test-agent/1.0") => fetch(p.url + path, { method: "POST", headers: { authorization: `Bearer ${key}`, "user-agent": ua, "content-type": "application/json" }, body: JSON.stringify(body) });
const oa = (model: string) => ({ model, messages: [{ role: "user", content: "hi" }] });
const an = { model: "claude-x", max_tokens: 5, messages: [{ role: "user", content: "hi" }] };

test("virtual keys: per-key provider/model allow-lists; real key injected; key + client logged", async () => {
  assert.equal((await call("vk-unknown", "/v1/chat/completions", oa("gpt-x"))).status, 401);
  assert.equal((await call("vk-A", "/v1/chat/completions", oa("gpt-x"))).status, 403);
  assert.equal((await call("vk-B", "/v1/chat/completions", oa("gpt-4o"))).status, 403);
  const r = await call("vk-A", "/v1/messages", an, "claude-cli/2.1"); assert.equal(r.status, 200); await r.text();
  assert.equal(up.seen.at(-1)!.headers["x-api-key"], "sk-REAL-anthropic"); assert.equal(up.seen.at(-1)!.headers.authorization, undefined);
  const rec = p.log.read().at(-1) as any;
  assert.equal(rec.virtualKey, "claude-code"); assert.equal(rec.client, "claude-cli/2.1"); assert.equal(rec.upstreamStatus, 200);
  assert.deepEqual(rec.usage, { input: 6, output: 2, cached: 4, cacheWrite: 1 });
  const log = readFileSync(p.log.path, "utf8"); assert.ok(!log.includes("REAL") && !log.includes("vk-A"));
});

test("aliases: client asks for 'fast'/'local', proxy routes model (and upstream) without client change", async () => {
  await (await call("vk-B", "/v1/chat/completions", oa("fast"))).text();
  assert.equal(JSON.parse(up.seen.at(-1)!.body.toString()).model, "mock-1");
  const rec = p.log.read().at(-1) as any; assert.equal(rec.model, "mock-1"); assert.equal(rec.requestedModel, "fast");
  assert.equal(rec.usage.cached, 3);
  const p2 = await startProxy(up.url, "redact", { aliases: { local: { model: "qwen-local", upstream: other.url } } });
  await (await fetch(p2.url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(oa("local")) })).text();
  assert.equal(JSON.parse(other.seen.at(-1)!.body.toString()).model, "qwen-local"); p2.close();
});

test("usage time series: /audit/stats needs admin key; groups by key/model/hour; CLI stats", async () => {
  assert.equal((await fetch(p.url + "/audit/stats?by=key")).status, 401);
  assert.equal((await fetch(p.url + "/audit/stats?by=key", { headers: { "x-admin-key": "nope" } })).status, 401);
  const byKey = await (await fetch(p.url + "/audit/stats?by=key", { headers: { "x-admin-key": "admin-1" } })).json();
  assert.deepEqual(byKey.map((r: any) => [r.group, r.requests, r.inputTokens, r.cachedTokens, r.cacheWriteTokens]), [["claude-code", 1, 6, 4, 1], ["quote-agent", 1, 5, 3, 0]]);
  const byHour = stats(p.log, "hour"); assert.equal(byHour.length, 1); assert.match(byHour[0].group, /^\d{4}-\d\d-\d\dT\d\d:00Z$/); assert.ok(byHour[0].latencyP95Ms >= 0);
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
  const out = execFileSync(process.execPath, [cli, "stats", "--log", p.log.path, "--by", "model"]).toString();
  console.log(out); assert.match(out, /anthropic\/claude-x/); assert.match(out, /openai\/mock-1/);
});

test("content logging per key (ADR 0011): default key hashes only, logContent key logs redacted text", async () => {
  const r1 = await call("vk-A", "/v1/messages", an); await r1.text();
  const a = p.log.read().at(-1) as any;
  assert.equal(a.virtualKey, "claude-code"); assert.equal(a.content, "hash"); assert.equal(a.output, undefined);
  assert.equal(a.outputHash, sha256("Hello world"));
  const r2 = await call("vk-B", "/v1/chat/completions", { ...oa("gpt-x"), stream: true }); await r2.text();
  const b = p.log.read().at(-1) as any;
  assert.equal(b.virtualKey, "quote-agent"); assert.equal(b.content, "redacted");
  assert.equal(b.output, "Hello world, mail me at [REDACTED:pii-email]"); assert.equal(b.outputHash, sha256("Hello world, mail me at jan@firma.pl"));
  const raw = readFileSync(p.log.path, "utf8"); assert.ok(!raw.includes("jan@firma.pl"));
  assert.deepEqual(p.log.verifyChain(), { ok: true });
  const rep = report(p.log, "1970", "9999"); assert.ok(rep.llm.contentLogged >= 1); assert.match(rep.md, /contentLogged/);
});
