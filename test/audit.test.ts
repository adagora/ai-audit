import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog, replay, report, sha256 } from "../src/audit.js";

const fresh = () => new AuditLog(join(mkdtempSync(join(tmpdir(), "audit-")), "log.jsonl"));
const step = `(input, tick) => { let s = 0; for (const x of input.xs) { tick(); s += x * input.k; } return { s }; }`;
function seed(log: AuditLog) {
  const a = log.record({ systemId: "rag", useCase: "qa", input: "pytanie a@b.pl", sources: [{ doc: "d.pdf", page: 3 }], output: "odp" });
  const b = log.record({ systemId: "quote", useCase: "price", input: "part", output: { p: 12 }, step: { source: step, input: { xs: [1, 2, 3], k: 2 }, output: { s: 12 } } });
  const c = log.record({ systemId: "rag", useCase: "qa", input: "inne", sources: [{ doc: "d.pdf", page: 3 }, { doc: "e.pdf", page: 1 }], output: "x" });
  log.approve(a.id, "r1", "approved"); log.approve(b.id, "r2", "overridden");
  return { a, b, c };
}

test("chain verifies and raw input is not stored", () => {
  const log = fresh(); seed(log);
  assert.deepEqual(log.verifyChain(), { ok: true });
  const raw = readFileSync(log.path, "utf8");
  assert.ok(!raw.includes("a@b.pl")); assert.ok(raw.includes(sha256("pytanie a@b.pl")));
});

test("editing ANY line is detected at that line", () => {
  const log = fresh(); seed(log);
  const lines = readFileSync(log.path, "utf8").trim().split("\n");
  for (let i = 0; i < lines.length; i++) {
    const t = lines.slice(); const r = JSON.parse(t[i]); r.ts = "1999-01-01T00:00:00Z"; t[i] = JSON.stringify(r);
    writeFileSync(log.path, t.join("\n") + "\n");
    const v = log.verifyChain(); assert.equal(v.ok, false); assert.equal(v.badLine, i + 1);
  }
  writeFileSync(log.path, lines.filter((_, i) => i !== 1).join("\n") + "\n");
  assert.equal(log.verifyChain().ok, false);
});

test("replay reproduces the same output; altered source is refused", () => {
  const log = fresh(); const { b } = seed(log);
  const r = replay(log, b.id); assert.equal(r.reproduced, true); assert.deepEqual(r.output, { s: 12 }); assert.equal(r.steps, 3);
  log.steps.set(b.step!.sourceHash, step.replace("* input.k", "* 3"));
  assert.throws(() => replay(log, b.id), /altered/);
});

test("bounded replay stops a runaway step (step budget and timeout)", () => {
  const log = fresh();
  const loop = log.record({ systemId: "s", useCase: "u", input: "i", output: 0, step: { source: "(i, tick) => { while (true) tick(); }", input: {}, output: 0 } });
  assert.throws(() => replay(log, loop.id, { timeoutMs: 1000, maxSteps: 1000 }), /step budget exceeded/);
  const busy = log.record({ systemId: "s", useCase: "u", input: "i", output: 0, step: { source: "(i, tick) => { while (true) {} }", input: {}, output: 0 } });
  assert.throws(() => replay(log, busy.id, { timeoutMs: 100, maxSteps: 1000 }), /timed out/);
});

test("report numbers match the log", () => {
  const log = fresh(); seed(log);
  const { stats, md } = report(log, "2000-01-01", "2100-01-01");
  assert.deepEqual(stats, { decisions: 3, reviewed: 2, unreviewed: 1, overridden: 1, overrideRatePct: 50, withReplayableStep: 1 });
  assert.match(md, /d\.pdf s\.3: 2/); assert.match(md, /e\.pdf s\.1: 1/); assert.match(md, /OK ✅/);
  assert.equal(report(log, "2100-01-01", "2200-01-01").stats.decisions, 0);
  const lines = readFileSync(log.path, "utf8").split("\n"); lines[0] = lines[0].replace('"odp"', '"zmienione"'); writeFileSync(log.path, lines.join("\n"));
  assert.match(report(log, "2000-01-01", "2100-01-01").md, /NARUSZONA ❌ \(linia 1/);
});
