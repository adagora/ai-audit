import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { AuditLog } from "../src/audit.js";
import { createConsole } from "../src/console.js";
import { awaitVerdict, effectAuthorized } from "../src/verdict.js";

const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const proposal = [394, { status: "skipped", action: "send-quote-to-customer", payload: 394 }, { status: "simulated", action: "route-to-estimator", payload: { priceAbove5000: true } }];
const fresh = () => new AuditLog(join(mkdtempSync(join(tmpdir(), "verdict-")), "audit.jsonl"));
const decide = (log: AuditLog, output: unknown = proposal) => log.record({ systemId: "shop", useCase: "quote", input: "order 12", output });

test("awaitVerdict returns the latest review at once, waits for one that comes later, and times out without one", async () => {
  const log = fresh(), d = decide(log);
  await assert.rejects(awaitVerdict(log, "nope", { timeoutMs: 10 }), /audit_unknown_decision/);
  const started = Date.now();
  assert.deepEqual(await awaitVerdict(log, d.id, { timeoutMs: 120, pollMs: 20 }), { state: "timeout" });
  assert.ok(Date.now() - started >= 100);
  setTimeout(() => log.approve(d.id, "ada", "approved", "price checked"), 80);
  const later = await awaitVerdict(log, d.id, { timeoutMs: 5000, pollMs: 20 });
  assert.equal(later.state, "approved");
  assert.deepEqual(later.state === "approved" && [later.reviewer, later.note], ["ada", "price checked"]);
  log.approve(d.id, "bo", "rejected");
  assert.equal((await awaitVerdict(log, d.id, { timeoutMs: 10 })).state, "rejected");
});

test("an effect is checked when written and is authorized only by the rule's own action or an earlier approval", () => {
  const log = fresh(), d = decide(log), other = decide(log);
  for (const bad of [{ action: "send quote", status: "done" }, { action: "send", status: "sent" }, { action: "send", status: "done", code: "Bad Code" }, { action: "x".repeat(129), status: "done" }])
    assert.throws(() => log.effect(d.id, bad as any), /^Error: audit_effect_invalid$/);
  assert.throws(() => log.effect("nope", { action: "send", status: "done" }), /audit_unknown_decision/);
  const otherReview = log.approve(other.id, "ada", "approved");
  assert.throws(() => log.effect(d.id, { action: "send", status: "done", review: otherReview.id }), /audit_unknown_review/);
  const routed = log.effect(d.id, { action: "route-to-estimator", status: "done" });
  const early = log.effect(d.id, { action: "send-quote-to-customer", status: "done" });
  const skipped = log.effect(d.id, { action: "send-quote-to-customer", status: "skipped", code: "waiting" });
  const review = log.approve(d.id, "ada", "approved");
  const sent = log.effect(d.id, { action: "send-quote-to-customer", status: "done", review: review.id });
  log.approve(d.id, "bo", "overridden");
  const afterOverride = log.effect(d.id, { action: "route-to-estimator", status: "done" });
  const records = log.read();
  assert.deepEqual([routed, early, skipped, sent, afterOverride].map((e) => effectAuthorized(records, e.id)), [true, false, true, true, false]);
  const stored = records.find((r) => r.id === sent.id)!;
  assert.deepEqual(Object.keys(stored).sort(), ["effect", "hash", "id", "kind", "prevHash", "refId", "ts"]);
  assert.deepEqual(stored.effect, { action: "send-quote-to-customer", status: "done", review: review.id });
  assert.deepEqual(log.verifyChain(), { ok: true });
});

test("the await and effect commands give any language the same loop, with exit codes for each verdict", () => {
  const log = fresh(), d = decide(log);
  const cli = (...args: string[]) => spawnSync(process.execPath, [cliPath, ...args, "--log", log.path], { encoding: "utf8" });
  const timeout = cli("await", "--decision", d.id, "--timeout-s", "0");
  assert.deepEqual([timeout.status, JSON.parse(timeout.stdout).state], [3, "timeout"]);
  assert.equal(cli("await", "--decision", "nope", "--timeout-s", "0").status, 2);
  const review = log.approve(d.id, "ada", "approved");
  const approved = cli("await", "--decision", d.id);
  assert.deepEqual([approved.status, JSON.parse(approved.stdout).state, JSON.parse(approved.stdout).review], [0, "approved", review.id]);
  const effect = cli("effect", "--decision", d.id, "--action", "send-quote-to-customer", "--status", "done", "--review", review.id);
  assert.equal(effect.status, 0, effect.stderr);
  assert.deepEqual([JSON.parse(effect.stdout).authorized, JSON.parse(effect.stdout).status], [true, "done"]);
  assert.equal(cli("effect", "--decision", d.id, "--action", "send", "--status", "maybe").status, 2);
  log.approve(d.id, "bo", "rejected");
  assert.equal(cli("await", "--decision", d.id).status, 1);
});

test("the console announces each new waiting decision and each overdue one once, without inputs or outputs, and flags actions without approval", async () => {
  const events: any[] = [];
  const receiver = http.createServer(async (req, res) => { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c); events.push(JSON.parse(Buffer.concat(chunks).toString())); res.end("ok"); });
  await new Promise<void>((r) => receiver.listen(0, "127.0.0.1", r));
  const log = fresh(), before = decide(log);
  assert.throws(() => createConsole({ log, notifyUrl: "file:///etc/passwd" }), /audit_console_notify_url_invalid/);
  const hook = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;
  const app = createConsole({ log, notifyUrl: hook, notifyEveryMs: 3_600_000, overdueMinutes: 60, announceAfterMs: 0 });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  try {
    await app.notifyTick();
    assert.equal(events.length, 0);
    const handled = decide(log, [1, { status: "simulated", action: "send-quote-to-customer", payload: 1 }]);
    log.effect(handled.id, { action: "send-quote-to-customer", status: "done" });
    const after = decide(log, [1200, { status: "simulated", action: "send-quote-to-customer", payload: 1200 }]);
    await app.notifyTick(); await app.notifyTick();
    assert.deepEqual(events.map((e) => [e.event, e.decisionId, e.proposedActions]), [["decision_waiting", after.id, ["send-quote-to-customer"]]]);
    assert.ok(!JSON.stringify(events).includes("1200") && !JSON.stringify(events).includes("order 12"));
    assert.match(events[0].console, /^http:\/\/127\.0\.0\.1:\d+\/#\/decisions\//);
    assert.ok(!events[0].console.includes(app.token));
    log.effect(before.id, { action: "send-quote-to-customer", status: "done" });
    const overview = await (await fetch(app.url().replace(/#.*/, "") + "api/overview?hours=0", { headers: { authorization: `Bearer ${app.token}` } })).json() as any;
    assert.equal(overview.attention[0].severity, "critical");
    assert.match(overview.attention[0].title, /1 action ran without approval/);
    const patient = createConsole({ log, notifyUrl: hook, notifyEveryMs: 3_600_000, announceAfterMs: 3_600_000 });
    await new Promise<void>((r) => patient.server.listen(0, "127.0.0.1", r));
    try { await patient.notifyTick(); decide(log); await patient.notifyTick(); } finally { patient.server.close(); }
    assert.equal(events.length, 1);
    const old = createConsole({ log, notifyUrl: hook, notifyEveryMs: 3_600_000, overdueMinutes: 0.000001 });
    await new Promise<void>((r) => old.server.listen(0, "127.0.0.1", r));
    try { await old.notifyTick(); await old.notifyTick(); } finally { old.server.close(); }
    assert.deepEqual(events.slice(1).map((e) => e.event).sort(), ["decision_overdue", "decision_overdue"]);
  } finally { app.server.close(); receiver.close(); }
  assert.ok(readFileSync(log.path, "utf8").includes('"kind":"effect"'));
});
