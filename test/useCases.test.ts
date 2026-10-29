import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { report, sha256 } from "../src/audit.js";
import { readEvidenceRecords } from "../src/evidence.js";
import { metrics } from "../src/proxy.js";
import { resolveUseCase, validateUseCases } from "../src/useCases.js";
import { renderWorkbench } from "../src/workbench.js";
import { mockUpstream, startProxy } from "./helpers.js";

const TABLE = {
  summarize: { tier: "assist", models: ["gpt-small"] },
  refund: { tier: "shadow", tools: { mode: "observe", allow: ["propose_refund"] } },
  intake: { tier: "contain" },
  retired: { tier: "off" },
};
const KEYS = [
  { name: "support", sha256: sha256("vk-support"), useCases: ["summarize", "refund", "retired"] },
  { name: "intake-bot", sha256: sha256("vk-intake"), useCases: ["intake"] },
  { name: "ops", sha256: sha256("vk-ops") },
];

test("a use-case table is checked at start, and a row's digest changes with its meaning, not with list order", () => {
  const table = validateUseCases(TABLE, KEYS)!;
  assert.deepEqual([...table.keys()], ["intake", "refund", "retired", "summarize"]);
  assert.equal(validateUseCases(undefined, [{}]), undefined);
  const digest = (row: object) => validateUseCases({ refund: row }, [])!.get("refund")!.digest;
  assert.equal(digest({ tier: "shadow", models: ["a", "b"], tools: { mode: "observe", allow: ["x", "y"] } }), digest({ tier: "shadow", models: ["b", "a"], tools: { mode: "observe", allow: ["y", "x"] } }));
  assert.notEqual(digest({ tier: "shadow" }), digest({ tier: "assist" }));
  assert.notEqual(digest({ tier: "shadow" }), validateUseCases({ other: { tier: "shadow" } }, [])!.get("other")!.digest);
  for (const [table, keys] of [
    [{}, []], [[], []], [{ "Bad Name": { tier: "assist" } }, []], [{ a: { tier: "auto" } }, []], [{ a: { tier: "assist", extra: 1 } }, []],
    [{ a: { tier: "assist", models: [] } }, []], [{ a: { tier: "assist", tools: { mode: "observe", allow: ["*"] } } }, []],
    [{ a: { tier: "assist" } }, [{ useCases: ["b"] }]], [{ a: { tier: "assist" } }, [{ useCases: [] }]], [undefined, [{ useCases: ["a"] }]],
  ] as [unknown, { useCases?: unknown }[]][]) assert.throws(() => validateUseCases(table, keys), /^Error: audit_use_cases_invalid$/);
});

test("a request resolves to a row by its header, or by the key's only row; nothing else names a row", () => {
  const table = validateUseCases(TABLE, KEYS)!;
  const name = (r: ReturnType<typeof resolveUseCase>) => "code" in r ? [r.status, r.code, r.name] : r.name;
  assert.equal(name(resolveUseCase(table, ["summarize", "refund"], "refund")), "refund");
  assert.equal(name(resolveUseCase(table, ["intake"], undefined)), "intake");
  assert.equal(name(resolveUseCase(table, undefined, "summarize")), "summarize");
  assert.deepEqual(name(resolveUseCase(table, ["summarize", "refund"], undefined)), [400, "audit_use_case_required", undefined]);
  assert.deepEqual(name(resolveUseCase(table, undefined, undefined)), [400, "audit_use_case_required", undefined]);
  assert.deepEqual(name(resolveUseCase(table, undefined, "toString")), [403, "audit_use_case_not_allowed", undefined]);
  assert.deepEqual(name(resolveUseCase(table, ["intake"], "refund")), [403, "audit_use_case_not_allowed", "refund"]);
  assert.deepEqual(name(resolveUseCase(table, undefined, "retired")), [403, "audit_use_case_off", "retired"]);
});

test("the proxy refuses requests outside the table, applies each row's models and tools, and reports per use case", async () => {
  const up = await mockUpstream();
  const proxy = await startProxy(up.url, "redact", { keys: KEYS, useCases: TABLE });
  const chat = async (key: string, model: string, useCase?: string) => {
    const response = await fetch(proxy.url + "/v1/chat/completions", { method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(useCase !== undefined && { "x-audit-use-case": useCase }) },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Help with order 12." }] }) });
    return [response.status, (await response.json() as any).error?.code ?? "ok"];
  };
  const requests = (labels: Record<string, string>) => metrics.requests.get({ route: "/v1/chat/completions", ...labels });
  const before = { required: requests({ decision: "none", status: "400", use_case: "none" }), off: requests({ decision: "none", status: "403", use_case: "retired" }),
    intake: requests({ decision: "forward-original", status: "200", use_case: "intake" }), held: metrics.actionGate.get({ mode: "observe", result: "hold", use_case: "refund" }) };
  try {
    assert.deepEqual(await chat("vk-support", "m"), [400, "audit_use_case_required"]);
    assert.deepEqual(await chat("vk-support", "m", "invented-row-name"), [403, "audit_use_case_not_allowed"]);
    assert.deepEqual(await chat("vk-support", "m", "intake"), [403, "audit_use_case_not_allowed"]);
    assert.deepEqual(await chat("vk-ops", "m", "retired"), [403, "audit_use_case_off"]);
    assert.deepEqual(await chat("vk-support", "m", "summarize"), [403, "audit_model_not_allowed"]);
    assert.deepEqual(await chat("vk-support", "gpt-small", "summarize"), [200, "ok"]);
    assert.deepEqual(await chat("vk-intake", "m"), [200, "ok"]);
    assert.deepEqual(await chat("vk-support", "m", "refund"), [200, "ok"]);
    assert.equal(up.seen.filter((s) => s.path === "/v1/chat/completions").length, 3);
    assert.ok(up.seen.every((s) => s.headers["x-audit-use-case"] === undefined));

    const records = proxy.log.read() as any[];
    const refusals = records.filter((r) => r.kind === "refusal"), calls = records.filter((r) => r.kind === "llm-call");
    assert.deepEqual(refusals.map((r) => [r.status, r.code, r.useCase]), [[400, "audit_use_case_required", undefined], [403, "audit_use_case_not_allowed", undefined],
      [403, "audit_use_case_not_allowed", "intake"], [403, "audit_use_case_off", "retired"], [403, "audit_model_not_allowed", "summarize"]]);
    const table = validateUseCases(TABLE, KEYS)!;
    assert.deepEqual(calls.map((c) => [c.useCase, c.useCasePolicy]), ["summarize", "intake", "refund"].map((n) => [n, { tier: table.get(n)!.tier, digest: table.get(n)!.digest }]));
    assert.deepEqual(calls[2].actionGate, { calls: [{ tool: "get_price", index: 0, mode: "observe", result: "hold", useCaseToolAllowed: false, atoms: [] }] });
    assert.equal(calls[0].actionGate, undefined);
    assert.ok(!readFileSync(proxy.log.path, "utf8").includes("invented-row-name"));

    assert.equal(requests({ decision: "none", status: "400", use_case: "none" }) - before.required, 1);
    assert.equal(requests({ decision: "none", status: "403", use_case: "retired" }) - before.off, 1);
    assert.equal(requests({ decision: "forward-original", status: "200", use_case: "intake" }) - before.intake, 1);
    assert.equal(metrics.actionGate.get({ mode: "observe", result: "hold", use_case: "refund" }) - before.held, 1);
    const exposition = await (await fetch(proxy.url + "/metrics")).text();
    assert.ok(!exposition.includes("invented-row-name"));

    const decision = proxy.log.record({ systemId: "support", useCase: "refund", input: "order 12", output: { refund: 40 } });
    proxy.log.approve(decision.id, "reviewer", "overridden");
    const { md, useCases } = report(proxy.log, "1970", "9999");
    assert.deepEqual(useCases.map((u) => [u.useCase, u.tiers, u.calls, u.refused, u.gateHolds, u.decisions, u.reviewed, u.overridden, u.overrideRatePct]), [
      ["intake", ["contain"], 1, 1, 0, 0, 0, 0, null], ["refund", ["shadow"], 1, 0, 1, 1, 1, 1, 100], ["retired", [], 0, 1, 0, 0, 0, 0, null],
      ["summarize", ["assist"], 1, 1, 0, 0, 0, 0, null], [null, [], 0, 2, 0, 0, 0, 0, null]]);
    assert.match(md, /## Przypadki użycia \(ADR 0053\)/);
    assert.match(md, /\| refund \| shadow \| 1 \| 1 \| 1 \| 0 \| 0 \| 0 \| 0 \| 1 \| 5 \/ 2 \| 1 \| 1 \| 1 \(100 %\) \|/);
    assert.match(md, /- observe get_price \(poza listą przypadku użycia\): 1/);

    const snapshot = readEvidenceRecords(proxy.log);
    const html = renderWorkbench(snapshot.records, snapshot.digest, { from: "1970-01-01T00:00:00Z", to: "9999-12-31T00:00:00Z" }).html;
    assert.match(html, /id="use-cases"/);
    assert.match(html, /<td>refund<\/td><td><span class="chip blue">shadow<\/span><\/td>/);
    assert.deepEqual(proxy.log.verifyChain(), { ok: true });
  } finally { proxy.close(); up.close(); }
});

test("without a table the use-case header stays a free label and adds no metric label", async () => {
  const up = await mockUpstream();
  const proxy = await startProxy(up.url, "redact");
  const before = metrics.requests.get({ route: "/v1/chat/completions", decision: "forward-original", status: "200" });
  try {
    const response = await fetch(proxy.url + "/v1/chat/completions", { method: "POST", headers: { authorization: "Bearer x", "content-type": "application/json", "x-audit-use-case": "Anything Goes" },
      body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] }) });
    assert.equal(response.status, 200);
    const [call] = proxy.log.read() as any[];
    assert.equal(call.useCase, "Anything Goes"); assert.equal(call.useCasePolicy, undefined);
    assert.equal(metrics.requests.get({ route: "/v1/chat/completions", decision: "forward-original", status: "200" }) - before, 1);
    await assert.rejects(startProxy(up.url, "redact", { keys: [{ name: "k", sha256: sha256("vk"), useCases: ["a"] }] }), /audit_use_cases_invalid/);
  } finally { proxy.close(); up.close(); }
});
