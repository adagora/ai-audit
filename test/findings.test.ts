import { test } from "node:test";
import assert from "node:assert/strict";
import { report } from "../src/audit.js";
import { findingTotal, findingTotals, MAX_STORED_FINDINGS, storedFindings } from "../src/scan.js";
import { renderWorkbench } from "../src/workbench.js";
import { mockUpstream, startProxy } from "./helpers.js";

test("stored findings keep each rule and path once, in first-seen order, with a count above one and an overflow per rule past 1,000", () => {
  assert.deepEqual(storedFindings([{ rule: "pii-email", path: "$.a" }, { rule: "pii-phone", path: "$.a" }, { rule: "pii-email", path: "$.a", unredactable: true }, { rule: "pii-email", path: "$.b" }]),
    { findings: [{ rule: "pii-email", path: "$.a", count: 2 }, { rule: "pii-phone", path: "$.a" }, { rule: "pii-email", path: "$.b" }] });
  const many = Array.from({ length: MAX_STORED_FINDINGS + 3 }, (_, i) => ({ rule: i % 2 ? "pii-email" : "jwt", path: `$[${i}]` }));
  const stored = storedFindings([...many, { rule: "jwt", path: "$[0]" }]);
  assert.equal(stored.findings.length, MAX_STORED_FINDINGS);
  assert.deepEqual(stored.findings[0], { rule: "jwt", path: "$[0]", count: 2 });
  assert.deepEqual(stored.findingsOverflow, { "pii-email": 1, jwt: 2 });
  assert.equal(findingTotal({ decision: stored }.decision), MAX_STORED_FINDINGS + 4);
});

test("finding totals read older records as one each and ignore malformed counts", () => {
  assert.deepEqual([...findingTotals({ findings: [{ rule: "jwt", path: "$" }, { rule: "jwt", path: "$.x", count: 3 }, { rule: "pii-iban", path: "$", count: -2 }, { rule: 7 }, null],
    findingsOverflow: { jwt: 5, bad: "x" } })], [["jwt", 9], ["pii-iban", 1], ["bad", 1]]);
  assert.equal(findingTotal(undefined), 0);
  assert.equal(findingTotal({ findings: "not a list" }), 0);
});

test("a request with 160,000 addresses writes one small record, and report and workbench still count every match", async () => {
  const up = await mockUpstream(), px = await startProxy(up.url, "redact");
  try {
    const chat = (content: unknown) => fetch(px.url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "m", messages: [{ role: "user", content }] }) });
    const flood = await chat("a@b.pl ".repeat(160_000));
    assert.equal(flood.status, 200); assert.equal(flood.headers.get("x-audit-finding-count"), "160000"); await flood.text();
    const spread = await chat(Array.from({ length: 1_500 }, (_, i) => ({ type: "text", text: `part ${i} jan${i}@firma.pl` })));
    assert.equal(spread.status, 200); await spread.text();
    const [first, second] = px.log.read() as any[];
    assert.deepEqual(first.decision.findings, [{ rule: "pii-email", path: "$.messages[0].content", count: 160_000 }]);
    assert.ok(JSON.stringify(first).length < 4_000);
    assert.equal(second.decision.findings.length, MAX_STORED_FINDINGS);
    assert.deepEqual(second.decision.findingsOverflow, { "pii-email": 500 });
    assert.ok(JSON.stringify(second).length < 80_000, `${JSON.stringify(second).length} bytes`);
    assert.match(report(px.log, "1970", "9999").md, /- pii-email: 161500/);
    assert.equal(renderWorkbench(px.log.read(), "digest", { from: "1970", to: "9999" }).findings, 161_500);
  } finally { px.close(); up.close(); }
});
