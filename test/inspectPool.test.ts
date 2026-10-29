import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "../src/audit.js";
import { createInspectionPool, InspectionBusy, InspectionStopped, scannedCharsAbove } from "../src/inspectPool.js";
import { createProxy, metrics, type ProxyOpts } from "../src/proxy.js";
import { inspect } from "../src/scan.js";
import { AWS, gen, mockUpstream, PESEL } from "./helpers.js";

const PIECES = ["AKIA", "password=", "@", " ", "\n", "PL", "+48 ", "ghp_", "😀", "[REDACTED:jwt]", ":", "/", AWS, PESEL, "client_secret = ", "postgres://", "jan@firma.pl", "data:image/png;base64,QUJD"];
const textOf = (g: ReturnType<typeof gen>) => Array.from({ length: g.int(30) }, () => (g.int(3) ? g.pick(PIECES) : g.chars(1 + g.int(12), "abcXYZ0129"))).join("");
const slowText = (mib: number) => "a:".repeat(mib * 512 * 1024) + "@tcp(";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

test("a worker inspects a body exactly as the main thread does, own __proto__ keys and the allowlist included", async () => {
  const allowed = "AKIA" + "IOSFODNN7ALLOWED";
  const pool = createInspectionPool({ allowHashes: [sha(allowed)], timeoutMs: 10_000, size: 2, queueLimit: 1_000 });
  const carnet = { has: (v: string) => v === sha(allowed) };
  try {
    const g = gen(50), bodies: unknown[] = [
      JSON.parse(`{"__proto__":{"text":"mail ${"ada"}@example.com"},"messages":[{"role":"user","content":"key ${allowed} and ${AWS}"}]}`),
    ];
    for (let i = 0; i < 200; i++) bodies.push({ messages: [{ role: "user", content: Array.from({ length: 1 + g.int(3) }, () => (g.int(2) ? textOf(g) : { type: "text", text: textOf(g) })) },
      { role: "tool", content: JSON.stringify({ note: textOf(g), [textOf(g).slice(0, 8) || "k"]: textOf(g) }) }] });
    const results = await Promise.all(bodies.map((b) => pool.run(b)));
    results.forEach((r, i) => assert.deepEqual(r, inspect(bodies[i], carnet), JSON.stringify(bodies[i])));
    assert.ok(Object.hasOwn(results[0].value as object, "__proto__"));
    assert.ok(JSON.stringify(results[0].value).includes(allowed) && !JSON.stringify(results[0].value).includes(AWS));
  } finally { pool.close(); }
});

test("the pool stops a job at its deadline, replaces the worker, refuses past its queue and reports an unsendable body as failed", async () => {
  const pool = createInspectionPool({ allowHashes: [], timeoutMs: 150, size: 1, queueLimit: 0 });
  try {
    const slow = pool.run(slowText(4));
    await assert.rejects(pool.run({ text: "x" }), InspectionBusy);
    await assert.rejects(slow, (e: unknown) => e instanceof InspectionStopped && e.code === "audit_inspection_timeout");
    assert.deepEqual(await pool.run("mail jan@firma.pl"), { value: "mail [REDACTED:pii-email]", findings: [{ rule: "pii-email", path: "$" }] });
    await assert.rejects(pool.run({ f: () => 1 }), (e: unknown) => e instanceof InspectionStopped && e.code === "audit_inspection_failed");
    assert.equal((await pool.run("clean")).value, "clean");
  } finally { pool.close(); }
  await assert.rejects(pool.run("after close"), InspectionBusy);
});

test("only text counts toward the worker threshold: keys and strings, not base64 payloads", () => {
  assert.equal(scannedCharsAbove({ image: "data:image/png;base64," + "A".repeat(10_000) }, 100), false);
  assert.equal(scannedCharsAbove({ text: "a".repeat(101) }, 100), true);
  assert.equal(scannedCharsAbove({ ["k".repeat(60)]: "v".repeat(41) }, 100), true);
  assert.equal(scannedCharsAbove([["a".repeat(50)], { b: "c".repeat(40) }], 100), false);
});

async function proxy(upstream: string, extra: Partial<ProxyOpts>) {
  const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "inspect-pool-")), "audit.jsonl"));
  const server = createProxy({ upstreamOpenai: upstream, upstreamAnthropic: upstream, mode: "redact", log, quiet: true, ...extra });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const chat = (content: string) => fetch(url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "m", messages: [{ role: "user", content }] }) });
  const close = async () => { const closed = once(server, "close"); server.closeAllConnections(); server.close(); await closed; };
  return { log, url, chat, close };
}

test("through the proxy a large text is masked in a worker, and a text past the deadline is refused with 422 while other requests are served", async () => {
  const up = await mockUpstream(), p = await proxy(up.url, { inspectOffloadChars: 1024, inspectTimeoutMs: 300 });
  try {
    const before = metrics.inspectionsOffloaded.get({ result: "ok" });
    const masked = await p.chat("x".repeat(2000) + " mail jan@firma.pl");
    assert.equal(masked.status, 200); await masked.text();
    assert.ok(up.seen[0].body.toString().includes("[REDACTED:pii-email]") && !up.seen[0].body.toString().includes("jan@firma.pl"));
    assert.equal(metrics.inspectionsOffloaded.get({ result: "ok" }), before + 1);
    const slow = p.chat(slowText(4)), t0 = Date.now();
    const health = await fetch(p.url + "/healthz");
    assert.equal(health.status, 200); assert.ok(Date.now() - t0 < 250, `healthz took ${Date.now() - t0} ms`);
    const refused = await slow;
    assert.equal(refused.status, 422); assert.equal((await refused.json()).error.code, "audit_inspection_timeout");
    assert.equal(up.seen.length, 1);
    const record = p.log.read().at(-1) as any;
    assert.deepEqual([record.kind, record.decision.action, record.error, record.upstreamStatus], ["llm-call", "reject", "audit_inspection_timeout", null]);
    const after = await p.chat("y".repeat(2000));
    assert.equal(after.status, 200); await after.text();
  } finally { await p.close(); up.close(); }
});

test("through the proxy a full inspection queue answers 503 audit_inspection_busy with a refusal record", async () => {
  const up = await mockUpstream(), p = await proxy(up.url, { inspectOffloadChars: 1024, inspectTimeoutMs: 1_500, inspectWorkers: 1, inspectQueue: 0 });
  try {
    const slow = p.chat(slowText(8));
    await new Promise((r) => setTimeout(r, 300));
    const busy = await p.chat("z".repeat(2000));
    assert.equal(busy.status, 503); assert.equal((await busy.json()).error.code, "audit_inspection_busy");
    assert.equal((await slow).status, 422);
    const refusal = p.log.read().find((r) => r.kind === "refusal") as any;
    assert.deepEqual([refusal.status, refusal.code], [503, "audit_inspection_busy"]);
    assert.equal(up.seen.length, 0);
  } finally { await p.close(); up.close(); }
});
