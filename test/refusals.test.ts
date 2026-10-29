import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog, report, sha256, stats } from "../src/audit.js";
import { createProxy, metrics } from "../src/proxy.js";
import { mockUpstream } from "./helpers.js";

const KEYS = [{ name: "claude-code", sha256: sha256("vk-A"), providers: ["anthropic" as const] }, { name: "quote-agent", sha256: sha256("vk-B"), models: ["gpt-x"], providers: ["openai" as const] }];

async function proxy(upstream: string, refusalsPerMinute?: number) {
  const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "refusals-")), "audit.jsonl"));
  const server = createProxy({ upstreamOpenai: upstream, upstreamAnthropic: upstream, mode: "redact", log, quiet: true, keys: KEYS, adminKeySha256: sha256("admin-1"), refusalsPerMinute });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const close = async () => { const closed = once(server, "close"); server.closeAllConnections(); server.close(); await closed; };
  return { log, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close };
}

test("refusals before inspection leave one content-free record each, linked by x-request-id", async () => {
  const up = await mockUpstream(), p = await proxy(up.url);
  const send = (path: string, key: string, body: string) => fetch(p.url + path, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body });
  const chat = (model: string) => JSON.stringify({ model, messages: [{ role: "user", content: "hi" }] });
  try {
    const responses = [
      await send("/v1/chat/completions", "vk-guessed-SECRET", chat("gpt-x")),
      await send("/v1/chat/completions", "vk-A", chat("gpt-x")),
      await send("/v1/chat/completions", "vk-B", chat("gpt-4o")),
      await send("/v1/secret-path-AKIAIOSFODNN7EXAMPLQ", "vk-B", chat("gpt-x")),
      await send("/v1/chat/completions", "vk-B", "{"),
      await fetch(p.url + "/audit/stats", { headers: { "x-admin-key": "admin-guess" } }),
    ];
    for (const r of responses) await r.text();
    assert.deepEqual(responses.map((r) => r.status), [401, 403, 403, 404, 400, 401]);
    const records = p.log.read() as any[];
    assert.deepEqual(records.map((r) => r.id), responses.map((r) => r.headers.get("x-request-id")));
    assert.deepEqual(records.map((r) => [r.kind, r.status, r.code, r.route, r.virtualKey ?? null, r.provider ?? null]), [
      ["refusal", 401, "audit_client_unauthorized", "/v1/chat/completions", null, "openai"],
      ["refusal", 403, "audit_provider_not_allowed", "/v1/chat/completions", "claude-code", "openai"],
      ["refusal", 403, "audit_model_not_allowed", "/v1/chat/completions", "quote-agent", "openai"],
      ["refusal", 404, "audit_unsupported_route", "other", "quote-agent", null],
      ["refusal", 400, "audit_malformed_json", "/v1/chat/completions", "quote-agent", "openai"],
      ["refusal", 401, "audit_admin_unauthorized", "/audit/stats", null, null],
    ]);
    assert.equal(records[2].model, "gpt-4o");
    assert.ok(records.every((r) => r.method && r.remoteAddress));
    const raw = readFileSync(p.log.path, "utf8");
    for (const secret of ["vk-guessed-SECRET", sha256("vk-guessed-SECRET"), "admin-guess", sha256("admin-guess"), "secret-path", "AKIA"]) assert.ok(!raw.includes(secret), secret);
    assert.deepEqual(p.log.verifyChain(), { ok: true });
    assert.equal(up.seen.length, 0);
    assert.deepEqual(stats(p.log, "key"), []);
    const rep = report(p.log, "1970", "9999");
    assert.deepEqual(rep.refusals, { recorded: 6, suppressed: 0 }); assert.equal(rep.llm.calls, 0);
    assert.match(rep.md, /- 401 audit_client_unauthorized: 1/); assert.match(rep.md, /- 403 audit_model_not_allowed: 1/);
  } finally { await p.close(); up.close(); }
});

test("a refusal flood keeps details of the first refusals in a minute and one summary with the rest", async () => {
  if (Date.now() % 60_000 > 58_000) await new Promise((resolve) => setTimeout(resolve, 2_500));
  const up = await mockUpstream(), p = await proxy(up.url, 3), before = metrics.refusalsSuppressed.total();
  try {
    for (let i = 0; i < 5; i++) await (await fetch(p.url + "/v1/chat/completions", { method: "POST", headers: { authorization: "Bearer vk-wrong" }, body: "{}" })).text();
    assert.equal(p.log.read().length, 3);
    assert.equal(metrics.refusalsSuppressed.total() - before, 2);
  } finally { await p.close(); up.close(); }
  const records = p.log.read() as any[];
  assert.equal(records.length, 4);
  const summary = records[3];
  assert.equal(summary.kind, "refusal"); assert.equal(summary.suppressed, 2);
  assert.ok(summary.from <= records[0].ts && summary.to >= records[2].ts);
  assert.deepEqual(report(p.log, "1970", "9999").refusals, { recorded: 3, suppressed: 2 });
  assert.match(report(p.log, "1970", "9999").md, /limit na minutę\): 2/);
  assert.deepEqual(p.log.verifyChain(), { ok: true });
});

test("an exception before forwarding answers 500 and leaves one content-free refusal record, upstream not called", async () => {
  const up = await mockUpstream(), log = new AuditLog(join(mkdtempSync(join(tmpdir(), "refusals-")), "audit.jsonl"));
  const server = createProxy({ upstreamOpenai: up.url, upstreamAnthropic: up.url, mode: "redact", log, quiet: true, sessionKey: {} as Buffer });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "mail ada@example.com" }] }) });
    assert.equal(res.status, 500); assert.equal((await res.json()).error.code, "audit_internal_error");
    assert.equal(up.seen.length, 0);
    const records = log.read() as any[];
    assert.equal(records.length, 1);
    assert.deepEqual({ kind: records[0].kind, id: records[0].id, status: records[0].status, code: records[0].code, reason: records[0].reason },
      { kind: "refusal", id: res.headers.get("x-request-id"), status: 500, code: "audit_internal_error", reason: "ERR_INVALID_ARG_TYPE" });
    const raw = readFileSync(log.path, "utf8");
    assert.ok(!raw.includes("ada@example.com") && !raw.includes("argument"));
    assert.match(report(log, "1970", "9999").md, /- 500 audit_internal_error: 1/);
  } finally { const closed = once(server, "close"); server.closeAllConnections(); server.close(); await closed; up.close(); }
});
