import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { BudgetStore, type TokenBudget } from "../src/budget.js";
import { AuditLog, sha256 } from "../src/audit.js";
import { createProxy } from "../src/proxy.js";

const limits: TokenBudget = { period: "month", inputTokens: 12, outputTokens: 8, maxOutputTokens: 4 };
const hash = sha256("aia-fake-budget-client");
const directory = () => mkdtempSync(join(tmpdir(), "audit-budget-"));

test("reservations survive store restart, preserve unknown usage, and roll over by UTC admission period", () => {
  const dir = directory();
  let now = new Date("2026-01-31T23:59:59Z");
  const store = new BudgetStore(dir, () => now);
  const pending = store.reserve(hash, limits, 8, 4);
  const restarted = new BudgetStore(dir, () => now);
  assert.throws(() => restarted.reserve(hash, limits, 8, 4), /audit_token_budget_exceeded/);
  assert.deepEqual(restarted.status(hash, limits).reserved, { input: 8, output: 4 });
  restarted.settle(pending, { input: 6 });
  assert.deepEqual(restarted.status(hash, limits).spent, { input: 6, output: 4 });
  const lastJanuary = store.reserve(hash, limits, 6, 4);
  now = new Date("2026-02-01T00:00:00Z");
  assert.deepEqual(store.status(hash, limits).spent, { input: 0, output: 0 });
  store.settle(lastJanuary, { input: 5, output: 1 });
  assert.deepEqual(store.status(hash, limits).spent, { input: 0, output: 0 });
});

test("provider overruns freeze a key; corrupt or locked accounting never grants a reservation", () => {
  const dir = directory(), store = new BudgetStore(dir);
  const reservation = store.reserve(hash, limits, 2, 4);
  assert.equal(store.settle(reservation, { input: 3, output: 2 }).overrun, true);
  assert.throws(() => store.reserve(hash, limits, 1, 1), /audit_budget_usage_overrun/);
  writeFileSync(reservation.file, "broken");
  assert.throws(() => store.reserve(hash, limits, 1, 1), /audit_budget_unavailable/);
  const other = sha256("other-fake-client");
  const held = store.reserve(other, limits, 1, 1);
  writeFileSync(held.file + ".lock", "");
  assert.throws(() => store.reserve(other, limits, 1, 1), /audit_budget_unavailable/);
});

test("separate writer processes cannot reserve the same remaining tokens", async () => {
  const dir = directory();
  const module = new URL("../src/budget.js", import.meta.url).href;
  const code = `import {BudgetStore} from ${JSON.stringify(module)}; try {new BudgetStore(${JSON.stringify(dir)}).reserve(${JSON.stringify(hash)},${JSON.stringify(limits)},8,4);process.stdout.write("reserved")}catch(e){process.stdout.write(e.message)}`;
  const results = await Promise.all(Array.from({ length: 8 }, () => new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code]);
    let output = ""; child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject); child.on("exit", (status) => status === 0 ? resolve(output) : reject(new Error("writer failed")));
  })));
  assert.equal(results.filter((r) => r === "reserved").length, 1);
  assert.deepEqual(new BudgetStore(dir).status(hash, limits).reserved, { input: 8, output: 4 });
});

async function fixture(options: { unknown?: boolean; overrun?: boolean; countError?: boolean; hold?: Promise<void>; budget?: TokenBudget; settleFailure?: boolean } = {}) {
  const dir = directory(), log = new AuditLog(join(dir, "audit.jsonl"));
  const seen: { path: string; body: any; auth?: string }[] = [];
  const source = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    seen.push({ path: req.url!, body, auth: req.headers.authorization });
    if (req.url?.endsWith("input_tokens") || req.url?.endsWith("count_tokens")) {
      res.writeHead(options.countError ? 500 : 200, { "content-type": "application/json" });
      res.end(JSON.stringify({ input_tokens: 5 })); return;
    }
    await options.hold;
    if (options.settleFailure) {
      const ledger = join(dir, "audit.jsonl.budgets");
      const state = readdirSync(ledger).find((name) => name.endsWith(".json"))!;
      writeFileSync(join(ledger, state + ".lock"), "");
    }
    if (req.url === "/v1/messages") {
      res.end(JSON.stringify({ model: "mock", content: [], stop_reason: "end_turn", usage: { input_tokens: 2, cache_read_input_tokens: 2, cache_creation_input_tokens: 1, output_tokens: 2 } })); return;
    }
    if (options.unknown) { res.writeHead(200, { "content-type": "text/event-stream" }); res.end('data: {"type":"response.output_text.delta","delta":"ok"}\n\n'); return; }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ model: "mock", status: "completed", output: [], usage: { input_tokens: 5, output_tokens: options.overrun ? 6 : 2 } }));
  });
  await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
  const upstream = `http://127.0.0.1:${(source.address() as AddressInfo).port}`;
  const opts = { upstreamOpenai: upstream, upstreamAnthropic: upstream, mode: "redact" as const, log, quiet: true,
    keys: [{ name: "employee", sha256: hash, tokenBudget: options.budget ?? limits }], upstreamKeys: { openai: "sk-fake-upstream", anthropic: "sk-fake-upstream" }, adminKeySha256: sha256("fake-admin") };
  const proxy = createProxy(opts);
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  const call = (body: any = {}, path = "/v1/responses") => fetch(url + path, { method: "POST", headers: { authorization: "Bearer aia-fake-budget-client", "content-type": "application/json" }, body: JSON.stringify({ model: "mock", input: "hello", ...body }) });
  return { dir, log, seen, url, upstream, call, close: () => { proxy.closeAllConnections(); proxy.close(); source.closeAllConnections(); source.close(); } };
}

test("proxy caps output, settles reported tokens, audits refusals, and protects budget status", async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 2; i++) { const response = await f.call({ max_output_tokens: 999 }); assert.equal(response.status, 200); await response.text(); }
    const rejected = await f.call(); assert.equal(rejected.status, 429); await rejected.text();
    const generation = f.seen.filter((r) => r.path === "/v1/responses");
    assert.equal(generation.length, 2);
    assert.ok(generation.every((r) => r.body.max_output_tokens === 4 && r.auth === "Bearer sk-fake-upstream"));
    assert.equal(f.log.read().length, 3);
    assert.equal((f.log.read().at(-1)!.decision as any).action, "block");
    assert.equal(f.log.verifyChain().ok, true);
    assert.equal((await fetch(f.url + "/audit/budgets")).status, 401);
    const status = await (await fetch(f.url + "/audit/budgets", { headers: { "x-admin-key": "fake-admin" } })).json();
    assert.deepEqual(status[0].spent, { input: 10, output: 4 });
    assert.deepEqual(status[0].remaining, { input: 2, output: 4 });
  } finally { f.close(); }
});

test("simultaneous HTTP requests cannot use the same balance while the provider is still running", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const f = await fixture({ hold, budget: { ...limits, inputTokens: 6 } });
  try {
    const one = f.call(), two = f.call();
    const firstTwo = await Promise.race([one, two]);
    assert.equal(firstTwo.status, 429);
    release();
    const responses = await Promise.all([one, two]);
    await Promise.all(responses.map((r) => r.text()));
    assert.equal(f.seen.filter((r) => r.path === "/v1/responses").length, 1);
  } finally { release(); f.close(); }
});

test("Anthropic budget accounting includes cached input and clamps max_tokens", async () => {
  const f = await fixture();
  try {
    const response = await f.call({ messages: [{ role: "user", content: "hello" }], max_tokens: 30 }, "/v1/messages");
    assert.equal(response.status, 200); await response.text();
    assert.equal(f.seen.at(-1)!.body.max_tokens, 4);
    assert.deepEqual((f.log.read()[0].tokenBudget as any).charged, { input: 5, output: 2 });
  } finally { f.close(); }
});

test("unknown streaming usage retains the full reservation and an overrun blocks later requests", async () => {
  for (const overrun of [false, true]) {
    const f = await fixture(overrun ? { overrun } : { unknown: true });
    try {
      const response = await f.call({ stream: !overrun }); await response.text();
      const status = await (await fetch(f.url + "/audit/budgets", { headers: { "x-admin-key": "fake-admin" } })).json();
      assert.equal(status[0].spent.output, overrun ? 6 : 4);
      if (overrun) { const next = await f.call(); assert.equal(next.status, 503); await next.text(); }
      else assert.equal((f.log.read()[0].tokenBudget as any).outputKnown, false);
    } finally { f.close(); }
  }
});

test("unsupported requests, invalid output limits and failed counts never generate a response", async () => {
  const f = await fixture({ countError: true });
  try {
    for (const body of [{ previous_response_id: "resp_fake" }, { background: true }, { mcp_servers: [] }, { context_management: [] }, { tools: [{ type: "web_search" }] }, { max_output_tokens: -1 }]) {
      const response = await f.call(body); assert.equal(response.status, 422); await response.text();
    }
    const chat = await f.call({ messages: [] }, "/v1/chat/completions"); assert.equal(chat.status, 422); await chat.text();
    const count = await f.call(); assert.equal(count.status, 503); await count.text();
    assert.equal(f.seen.filter((r) => r.path === "/v1/responses").length, 0);
    assert.equal(readdirSync(f.dir).filter((name) => name.endsWith(".jsonl")).length, 1);
  } finally { f.close(); }
});

test("a failed settlement retains liability and still writes the request audit record", async () => {
  const f = await fixture({ settleFailure: true });
  try {
    const response = await f.call(); assert.equal(response.status, 200); await response.text();
    assert.equal(f.log.read().length, 1);
    assert.equal((f.log.read()[0].tokenBudget as any).status, "unavailable");
    assert.equal(f.log.verifyChain().ok, true);
    const next = await f.call(); assert.equal(next.status, 503); await next.text();
    assert.equal(f.seen.filter((r) => r.path === "/v1/responses").length, 1);
  } finally { f.close(); }
});

test("provider preflight and generation receive the same redacted input", async () => {
  const f = await fixture();
  try {
    const response = await f.call({ input: "synthetic.person@example.com" }); assert.equal(response.status, 200); await response.text();
    assert.equal(f.seen.length, 2);
    assert.equal(f.seen[0].body.input, "[REDACTED:pii-email]");
    assert.equal(f.seen[1].body.input, f.seen[0].body.input);
  } finally { f.close(); }
});

test("real CLI loads configured quotas and keeps an employee's spend after process restart", async () => {
  const f = await fixture();
  const config = join(f.dir, "gateway.json"), log = join(f.dir, "cli-audit.jsonl");
  writeFileSync(config, JSON.stringify({ budgetDirectory: join(f.dir, "employee-ledger"), keys: [{ name: "employee", sha256: hash, tokenBudget: limits }] }));
  const children: ReturnType<typeof spawn>[] = [];
  const launch = () => new Promise<{ child: ReturnType<typeof spawn>; url: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("../src/cli.js", import.meta.url).pathname, "serve", "--host", "127.0.0.1", "--port", "0", "--log", log, "--config", config,
      "--upstream-openai", f.upstream, "--upstream-anthropic", f.upstream], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, AI_AUDIT_UPSTREAM_OPENAI_KEY: "sk-fake-cli-only", AI_AUDIT_ADMIN_KEY: "fake-admin" }, stdio: ["ignore", "ignore", "pipe"],
    });
    children.push(child);
    const timer = setTimeout(() => { child.kill(); reject(new Error("CLI startup timeout")); }, 10000);
    let stderr = "";
    child.stderr!.on("data", (chunk) => {
      stderr += chunk;
      for (const line of stderr.split("\n").filter(Boolean)) {
        try { const event = JSON.parse(line); if (event.event === "listening") { clearTimeout(timer); resolve({ child, url: event.url }); } } catch { }
      }
    });
    child.once("error", (e) => { clearTimeout(timer); reject(e); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("CLI stopped")); });
  });
  const request = (url: string) => fetch(url + "/v1/responses", { method: "POST", headers: { authorization: "Bearer aia-fake-budget-client", "content-type": "application/json" }, body: JSON.stringify({ model: "mock", input: "hello" }) });
  try {
    const first = await launch();
    for (let i = 0; i < 2; i++) { const response = await request(first.url); assert.equal(response.status, 200); await response.text(); }
    const deadline = Date.now() + 3000;
    while (new AuditLog(log).read().length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(new AuditLog(log).read().length, 2);
    await new Promise<void>((resolve) => { first.child.once("exit", () => resolve()); first.child.kill(); });
    const second = await launch();
    const refused = await request(second.url); assert.equal(refused.status, 429); await refused.text();
    const status = await (await fetch(second.url + "/audit/budgets", { headers: { "x-admin-key": "fake-admin" } })).json();
    assert.deepEqual(status[0].spent, { input: 10, output: 4 });
    assert.equal(new AuditLog(log).read().length, 3);
    assert.equal(new AuditLog(log).verifyChain().ok, true);
  } finally { children.forEach((child) => child.kill()); f.close(); }
});
