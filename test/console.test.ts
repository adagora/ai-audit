import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { AuditLog, sha256 } from "../src/audit.js";
import { createConsole } from "../src/console.js";
import { decisionViews, flow, requestPath, STAGES, suggestions } from "../src/consoleModel.js";
import { AWS, mockUpstream, startProxy } from "./helpers.js";

const chat = (key: string, body: object, headers: Record<string, string> = {}) => ({ method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("each record maps to one path through the request state machine", () => {
  assert.equal(requestPath({ kind: "decision", id: "d", ts: "t" }), undefined);
  assert.equal(requestPath({ kind: "refusal", id: "r", ts: "t", code: "audit_admin_unauthorized", status: 401 }), undefined);
  const refused = requestPath({ kind: "refusal", id: "r", ts: "t", code: "audit_use_case_off", status: 403 })!;
  assert.deepEqual([refused.stoppedAt, refused.outcome, refused.code, refused.stages.key, refused.stages.model], ["useCase", "refused", "audit_use_case_off", "pass", undefined]);
  const call = (extra: object) => requestPath({ kind: "llm-call", id: "c", ts: "t", decision: { action: "forward-original", findings: [] }, upstreamStatus: 200, ...extra })!;
  assert.deepEqual([call({}).outcome, call({}).stages.useCase, call({}).stages.gate, call({}).stages.recorded], ["delivered", "skip", "skip", "pass"]);
  assert.deepEqual([call({ decision: { action: "reject", findings: [] }, error: "audit_inspection_timeout", upstreamStatus: null }).stoppedAt, call({ decision: { action: "reject", findings: [] }, upstreamStatus: null }).outcome], ["inspect", "rejected"]);
  const blocked = call({ decision: { action: "block", findings: [{ rule: "aws-access-token", path: "$.messages[0].content" }] }, upstreamStatus: null });
  assert.deepEqual([blocked.stoppedAt, blocked.outcome, blocked.code], ["decide", "blocked", "aws-access-token"]);
  assert.deepEqual([call({ decision: { action: "block", findings: [] }, error: "audit_token_budget_exceeded", upstreamStatus: null }).stoppedAt], ["budget"]);
  const redacted = call({ decision: { action: "forward-redacted", findings: [{ rule: "pii-email", path: "$", count: 2 }] }, useCase: "summarize", useCasePolicy: { tier: "assist", digest: "x" } });
  assert.deepEqual([redacted.stages.decide, redacted.notes.decide, redacted.notes.inspect, redacted.stages.useCase, redacted.notes.useCase], ["flag", "redacted", "2 findings", "pass", "summarize · assist"]);
  assert.deepEqual([call({ upstreamStatus: null, error: "audit_deadline_exceeded" }).outcome, call({ upstreamStatus: 503 }).outcome], ["upstream-failed", "upstream-error"]);
  assert.equal(call({ actionGate: { calls: [{ result: "hold" }] } }).outcome, "held");
  assert.equal(call({ actionGate: { calls: [{ result: "hold" }], rewritten: true } }).outcome, "rewritten");
  const f = flow([{ kind: "refusal", suppressed: 3 }, { kind: "refusal", code: "audit_internal_error" }, { kind: "refusal", id: "r", ts: "t", code: "audit_model_not_allowed", status: 403 },
    { kind: "llm-call", id: "a", ts: "t", decision: { action: "forward-redacted", findings: [] }, upstreamStatus: 200 }, { kind: "llm-call", id: "b", ts: "t", decision: { action: "forward-original", findings: [] }, upstreamStatus: 200, actionGate: { calls: [{ result: "hold" }] } }]);
  const stage = (id: string) => f.stages.find((s) => s.stage === id)!;
  assert.deepEqual([f.total, f.offPath, f.outcomes], [3, 4, { refused: 1, delivered: 1, held: 1 }]);
  assert.deepEqual([stage("received").reached, stage("model").stopped, stage("model").stops, stage("decide").flags, stage("gate").flags, stage("recorded").reached], [3, 1, { audit_model_not_allowed: 1 }, { redacted: 1 }, { held: 1 }, 2]);
});

test("decisions show their state, simulated actions, program and review history; suggestions show their evidence", () => {
  const records: any[] = [
    { kind: "program", id: "ql_x", ts: "1", name: "Quote v1" },
    { kind: "decision", id: "d1", ts: "2", systemId: "shop", useCase: "quote", output: [394, { status: "simulated", action: "route-to-human-review", payload: 394 }, { status: "skipped", action: "auto-approve" }] },
    { kind: "decision", id: "d1:qdl", ts: "2", refId: "d1", qdl: { status: "completed", sourceHash: "ql_x", inputs: { minutes: 42 } } },
    { kind: "decision", id: "d2", ts: "3", systemId: "shop", useCase: "quote", output: 1 },
    { kind: "review", id: "r1", ts: "4", refId: "d2", review: { reviewer: "ada", decision: "approved", at: "4" } },
    { kind: "review", id: "r2", ts: "5", refId: "d2", review: { reviewer: "bo", decision: "overridden", at: "5", note: "too low" } },
  ];
  const [d2, d1] = decisionViews(records);
  assert.deepEqual([d1.state, d1.actions, d1.qdl?.program, d1.qdl?.inputs], ["waiting", [{ action: "route-to-human-review", status: "simulated" }, { action: "auto-approve", status: "skipped" }], "Quote v1", { minutes: 42 }]);
  assert.deepEqual([d2.state, d2.reviews.map((r) => r.verdict), d2.reviews[1].note, d2.qdl], ["overridden", ["approved", "overridden"], "too low", undefined]);
  const row = (overrides: number, reviewed: number) => ({ useCase: "refund", tiers: ["shadow"], versions: 1, calls: 0, forwarded: 0, redacted: 0, blocked: 0, rejected: 0, refused: 0, gateHolds: 0,
    inputTokens: 0, outputTokens: 0, unknownUsage: 0, decisions: reviewed, reviewed, overridden: overrides, overrideRatePct: Math.round((overrides / reviewed) * 1000) / 10 });
  const held = Array.from({ length: 3 }, (_, i) => ({ kind: "llm-call", id: `c${i}`, virtualKey: "agent", useCase: "refund", upstreamStatus: 200, usage: { input: 1, output: 1 },
    actionGate: { calls: [{ tool: "crm_write", mode: "observe", result: "hold", useCaseToolAllowed: false, atoms: [] }] } }));
  const config = { useCases: { refund: { tier: "shadow", tools: { mode: "observe", allow: ["crm_lookup"] } } } };
  const found = suggestions(held, [row(0, 25)], config);
  assert.deepEqual(found.map((s) => s.id), ["promote:refund", "held:use case:refund:crm_write"]);
  assert.deepEqual(JSON.parse(found[0].snippet!), { refund: { tier: "assist", tools: { mode: "observe", allow: ["crm_lookup"] } } });
  assert.deepEqual(JSON.parse(found[1].snippet!), { allow: ["crm_lookup", "crm_write"] });
  assert.deepEqual(suggestions([], [row(2, 6)], config).map((s) => s.id), ["overrides:refund"]);
  const labels = suggestions([{ kind: "llm-call", useCase: "summarize", upstreamStatus: 200 }, { kind: "llm-call", useCase: "Not A Name", upstreamStatus: 200 }], [], {});
  assert.deepEqual(labels.map((s) => s.id), ["use-case-table", "unknown-usage"]);
  assert.deepEqual(JSON.parse(labels[0].snippet!), { useCases: { summarize: { tier: "shadow" } } });
});

test("the console needs its token and its own host, serves no data without them, and records reviews only with a reviewer", async () => {
  const directory = mkdtempSync(join(tmpdir(), "console-"));
  const log = new AuditLog(join(directory, "audit.jsonl"));
  const decision = log.record({ systemId: "shop", useCase: "quote", input: "order", output: [394] });
  assert.throws(() => createConsole({ log, host: "0.0.0.0" }), /audit_console_not_loopback/);
  const start = async (reviewer?: string) => {
    const app = createConsole({ log, reviewer });
    await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
    return { ...app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
  };
  const reader = await start(), writer = await start("ada");
  try {
    const page = await fetch(reader.base + "/");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy")!, /default-src 'none'; script-src 'self'/);
    assert.match(await page.text(), /<script src="\/console.js" defer>/);
    assert.equal((await fetch(reader.base + "/api/overview")).status, 401);
    assert.equal((await fetch(reader.base + "/api/overview", { headers: { authorization: "Bearer wrong" } })).status, 401);
    const auth = { authorization: `Bearer ${reader.token}` };
    const port = (reader.server.address() as AddressInfo).port;
    const rebound = await new Promise<number>((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/overview", headers: { ...auth, host: `evil.example:${port}` } }, (res) => { res.resume(); resolve(res.statusCode!); }).on("error", reject);
    });
    assert.equal(rebound, 403);
    const overview = await (await fetch(reader.base + "/api/overview?hours=0", { headers: auth })).json() as any;
    assert.deepEqual([overview.log.chain.ok, overview.kpis.waiting, overview.reviewer], [true, 1, null]);
    assert.match(reader.url(), /^http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43}$/);
    const review = (app: typeof reader, body: object) => fetch(`${app.base}/api/decisions/${decision.id}/review`, { method: "POST", headers: { authorization: `Bearer ${app.token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await review(reader, { verdict: "approved" })).status, 403);
    assert.equal((await review(writer, { verdict: "maybe" })).status, 400);
    assert.deepEqual([(await review(writer, { verdict: "approved", note: `key ${AWS}` })).status, (await review(writer, { verdict: "approved", note: "x".repeat(501) })).status], [422, 400]);
    assert.ok(!readFileSync(log.path, "utf8").includes(AWS));
    assert.equal((await fetch(`${writer.base}/api/decisions/nope/review`, { method: "POST", headers: { authorization: `Bearer ${writer.token}`, "content-type": "application/json" }, body: JSON.stringify({ verdict: "approved" }) })).status, 404);
    const saved = await review(writer, { verdict: "overridden", note: "price too low" });
    assert.equal(saved.status, 201);
    const [view] = await (await fetch(writer.base + "/api/decisions", { headers: { authorization: `Bearer ${writer.token}` } })).json() as any[];
    assert.deepEqual([view.state, view.reviews[0].reviewer, view.reviews[0].note], ["overridden", "ada", "price too low"]);
    assert.deepEqual(log.verifyChain(), { ok: true });
  } finally { reader.server.close(); writer.server.close(); }
});

test("over real proxy traffic the console shows paths, context blocks, use cases, keys and integrity without values", async () => {
  const up = await mockUpstream();
  const keys = [{ name: "support", sha256: sha256("vk-s"), useCases: ["summarize"] },
    { name: "batch", sha256: sha256("vk-b"), tokenBudget: { period: "day" as const, inputTokens: 1000, outputTokens: 1000, maxOutputTokens: 16 } }];
  const gateway = { keys, useCases: { summarize: { tier: "assist" } } };
  const proxy = await startProxy(up.url, "redact", { ...gateway });
  const configPath = join(mkdtempSync(join(tmpdir(), "console-config-")), "gateway.json");
  writeFileSync(configPath, JSON.stringify(gateway));
  const app = createConsole({ log: proxy.log, configPath });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`, auth = { authorization: `Bearer ${app.token}` };
  const get = async (path: string) => { const r = await fetch(base + path, { headers: auth }); assert.equal(r.status, 200, path); return r.json() as Promise<any>; };
  try {
    const first = [{ role: "system", content: "Be brief." }, { role: "user", content: `Mail jan@firma.pl about key ${AWS}` }];
    assert.equal((await fetch(proxy.url + "/v1/chat/completions", chat("vk-s", { model: "m", messages: first }))).status, 200);
    assert.equal((await fetch(proxy.url + "/v1/chat/completions", chat("vk-s", { model: "m", messages: [...first, { role: "assistant", content: "Hello world" }, { role: "user", content: "Again" }] }))).status, 200);
    assert.equal((await fetch(proxy.url + "/v1/chat/completions", chat("vk-nope", { model: "m", messages: first }))).status, 401);
    const requests = await get("/api/requests?hours=0");
    assert.deepEqual(requests.map((r: any) => r.outcome), ["refused", "delivered", "delivered"]);
    const detail = await get(`/api/requests/${requests[1].id}`);
    assert.deepEqual([detail.path.stages.decide, detail.path.notes.useCase, detail.record.session.turn, detail.record.prevHash, detail.record.remoteAddress], ["flag", "summarize · assist", 2, undefined, undefined]);
    assert.ok(Array.isArray(detail.record.context.blocks) && detail.record.context.blocks.length > 1);
    const session = await get(`/api/sessions/${detail.record.session.id}`);
    assert.deepEqual(session.turns.map((t: any) => t.call.session.turn), [1, 2]);
    const [useCase] = await get("/api/use-cases?hours=0");
    assert.deepEqual([useCase.name, useCase.configured, useCase.changedSinceSeen, useCase.stats.calls, useCase.stats.redacted], ["summarize", true, false, 2, 2]);
    const [support, batch] = await get("/api/keys");
    assert.deepEqual([support.name, support.calls, support.useCases, support.budget, support.sha256], ["support", 2, ["summarize"], null, undefined]);
    assert.deepEqual([batch.name, batch.calls, batch.budget.limits.input, batch.budget.spent.input], ["batch", 0, 1000, 0]);
    assert.ok(!existsSync(proxy.log.path + ".budgets") || readdirSync(proxy.log.path + ".budgets").length === 0);
    const integrity = await get("/api/integrity");
    assert.deepEqual([integrity.chain.ok, integrity.files.length, integrity.anchors, integrity.profiles.length], [true, 1, null, 1]);
    const overview = await get("/api/overview?hours=0");
    assert.deepEqual([overview.kpis.requests, overview.kpis.refused, overview.flow.outcomes.delivered], [3, 1, 2]);
    assert.deepEqual(await get("/api/live"), { configured: false });
    const everything = JSON.stringify([requests, detail, session, overview, await get("/api/decisions")]);
    for (const secret of [AWS, "jan@firma.pl", "Be brief.", sha256("vk-s")]) assert.ok(!everything.includes(secret), `${secret} reached the console`);
  } finally { app.server.close(); proxy.close(); up.close(); }
});

test("the README state machine has the console's states, labels and order, and every README image exists", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const readme = readFileSync(join(root, "README.md"), "utf8"), ui = readFileSync(join(root, "console/console.js"), "utf8");
  const labels = Object.fromEntries([...ui.matchAll(/\["(\w+)", "([^"]+)", "[^"]+"\]/g)].map((m) => [m[1], m[2]]));
  const block = readme.split("```mermaid").find((b) => b.includes("received : Request received"))!.split("```")[0];
  const declared = Object.fromEntries([...block.matchAll(/^ {2}(\w+) : (.+)$/gm)].map((m) => [m[1], m[2]]));
  for (const stage of STAGES) assert.equal(declared[stage], labels[stage], stage);
  const next = new Map([...block.matchAll(/^ {2}(\w+) --> (\w+)$/gm)].map((m) => [m[1], m[2]]));
  const chain = ["received"];
  while (next.has(chain[chain.length - 1]) && chain.length <= STAGES.length) chain.push(next.get(chain[chain.length - 1])!);
  assert.deepEqual(chain, [...STAGES]);
  const images = [...readme.matchAll(/!\[[^\]]*\]\((docs\/images\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(images.length >= 7, String(images.length));
  for (const image of images) assert.ok(existsSync(join(root, image)), image);
});
