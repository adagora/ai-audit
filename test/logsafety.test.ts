import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AuditLog, AuditLogUnavailable } from "../src/audit.js";
import { createProxy, metrics } from "../src/proxy.js";
import { mockUpstream } from "./helpers.js";
import type { AddressInfo } from "node:net";

const self = fileURLToPath(import.meta.url);
if (process.argv[2] === "append-child") {
  const log = new AuditLog(process.argv[3]);
  for (let i = 0; i < Number(process.argv[4]); i++) log.append({ kind: "llm-call", id: `${process.pid}-${i}`, ts: "t" } as any);
  process.exit(0);
} else {

test("appends from several processes keep one intact chain", async () => {
  const p = join(mkdtempSync(join(tmpdir(), "audit-mp-")), "log.jsonl"), N = 200, W = 3;
  await Promise.all(Array.from({ length: W }, () => new Promise((r, j) =>
    fork(self, ["append-child", p, String(N)]).on("exit", (c) => (c === 0 ? r(c) : j(new Error(`child exit ${c}`)))))));
  const log = new AuditLog(p);
  assert.equal(log.read().length, N * W);
  assert.deepEqual(log.verifyChain(), { ok: true });
});

test("torn last line: append throws AuditLogUnavailable, nothing written", () => {
  const p = join(mkdtempSync(join(tmpdir(), "audit-torn-")), "log.jsonl");
  writeFileSync(p, '{"kind":"llm-call","id":"x","prevHash":"0');
  assert.throws(() => new AuditLog(p).append({ kind: "llm-call", id: "y", ts: "t" } as any), AuditLogUnavailable);
  assert.equal(readFileSync(p, "utf8"), '{"kind":"llm-call","id":"x","prevHash":"0');
});

test("torn last line: proxy fails closed with 503, upstream never called, process survives", async () => {
  const p = join(mkdtempSync(join(tmpdir(), "audit-torn-")), "log.jsonl");
  writeFileSync(p, '{"kind":"llm-call","id":"x","prevHash":"0');
  const up = await mockUpstream();
  const px = createProxy({ log: new AuditLog(p), mode: "redact", upstreamOpenai: up.url, upstreamAnthropic: up.url, quiet: true }).listen(0);
  await new Promise((r) => px.once("listening", r));
  const crashed: unknown[] = []; const onErr = (e: unknown) => crashed.push(e); process.on("uncaughtException", onErr);
  try {
    const r = await fetch(`http://127.0.0.1:${(px.address() as AddressInfo).port}/v1/chat/completions`, { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] }) });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.code, "audit_log_unavailable");
    assert.equal(up.seen.length, 0);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(crashed, []);
  } finally { process.off("uncaughtException", onErr); px.close(); up.close(); }
});

test("append failing after the response was streamed: no write-after-end crash, failure counted", async () => {
  const p = join(mkdtempSync(join(tmpdir(), "audit-late-")), "log.jsonl");
  const log = new AuditLog(p); log.append = () => { throw new AuditLogUnavailable("disk full"); };
  const up = await mockUpstream(), before = metrics.logWriteFailures.total();
  const px = createProxy({ log, mode: "redact", upstreamOpenai: up.url, upstreamAnthropic: up.url, quiet: true }).listen(0);
  await new Promise((r) => px.once("listening", r));
  const crashed: unknown[] = []; const onErr = (e: unknown) => crashed.push(e); process.on("uncaughtException", onErr);
  try {
    const r = await fetch(`http://127.0.0.1:${(px.address() as AddressInfo).port}/v1/chat/completions`, { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] }) });
    assert.equal(r.status, 200); await r.text();
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(crashed, []);
    assert.equal(metrics.logWriteFailures.total(), before + 1);
  } finally { process.off("uncaughtException", onErr); px.close(); up.close(); }
});
}
